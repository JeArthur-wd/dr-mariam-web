import base64
import json
import logging
import os
import uuid
from html import escape
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import AdminAccount, Event, Member, Reservation

logger = logging.getLogger(__name__)

DEFAULT_EVENT = {
    'title': 'Singles to Mingle 2026',
    'date': '27 November 2026',
    'venue': 'Sheraton Hotel',
    'time': '4:30 PM',
    'dressCode': 'Black, Red, White & Pink',
    'ticketOptions': [
        {'label': 'Early Bird', 'price': 'UGX 150,000', 'highlight': True},
        {'label': 'Late Ticket', 'price': 'UGX 200,000', 'highlight': False},
    ],
}


def serialize_member(member: Member) -> dict[str, Any]:
    return {
        'id': member.id,
        'fullName': member.full_name,
        'email': member.email,
        'token': member.auth_token,
    }


def serialize_admin(admin: AdminAccount) -> dict[str, Any]:
    return {
        'id': admin.id,
        'fullName': admin.full_name,
        'email': admin.email,
        'token': admin.auth_token,
    }


def authenticated_admin(request) -> AdminAccount | None:
    token = request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()
    if not token:
        return None
    try:
        return AdminAccount.objects.get(auth_token=token, is_active=True)
    except AdminAccount.DoesNotExist:
        return None


def serialize_event(event: Event | None) -> dict[str, Any]:
    if event is None:
        default_event = DEFAULT_EVENT.copy()
        default_event['capacity'] = 200
        default_event['id'] = None
        return default_event

    return {
        'id': event.id,
        'title': event.title,
        'date': event.date,
        'venue': event.venue,
        'time': event.time,
        'dressCode': event.dress_code,
        'capacity': event.capacity,
        'ticketOptions': [
            {'label': event.early_ticket_label, 'price': event.early_ticket_price, 'highlight': True},
            {'label': event.late_ticket_label, 'price': event.late_ticket_price, 'highlight': False},
        ],
    }


def get_ticket_amount(ticket_type: str) -> int | None:
    """Return the server-controlled amount for a configured ticket type."""
    event = Event.objects.filter(is_active=True).order_by('-created_at').first()
    for ticket in serialize_event(event)['ticketOptions']:
        label = f"{ticket['label']} — {ticket['price']}"
        if ticket_type == label:
            return int(''.join(character for character in ticket['price'] if character.isdigit()))
    return None


def normalize_phone_number(phone_number: str) -> str:
    """Normalize common Ugandan mobile-number formats for payment providers."""
    digits = ''.join(character for character in phone_number if character.isdigit())
    if len(digits) == 10 and digits.startswith('0'):
        return f'256{digits[1:]}'
    if len(digits) == 9:
        return f'256{digits}'
    return digits


def serialize_reservation(reservation: Reservation) -> dict[str, Any]:
    return {
        'id': reservation.id,
        'fullName': reservation.full_name,
        'email': reservation.email,
        'ticketType': reservation.ticket_type,
        'status': reservation.status,
        'paymentMethod': reservation.payment_method,
        'emailSent': reservation.ticket_email_sent,
        'ticket': {
            'ticketCode': reservation.ticket_code,
            'qrPayload': reservation.qr_payload,
        },
    }


def serialize_admin_attendee(reservation: Reservation) -> dict[str, Any]:
    amount = get_ticket_amount(reservation.ticket_type)
    return {
        'name': reservation.full_name,
        'email': reservation.email,
        'ticket': reservation.ticket_type,
        'amount': f'UGX {amount:,}' if amount is not None else 'UGX 0',
        'status': reservation.status,
    }


def send_ticket_email(reservation: Reservation) -> bool:
    """Deliver an event ticket only after a payment has been confirmed."""
    if reservation.status not in {'paid', 'confirmed'} or reservation.ticket_email_sent:
        return reservation.ticket_email_sent

    event = Event.objects.filter(is_active=True).order_by('-created_at').first()
    details = serialize_event(event)
    subject = f"Your ticket for {details['title']}"
    text_body = (
        f"Hello {reservation.full_name},\n\n"
        f"Your payment has been confirmed. Your ticket is ready.\n\n"
        f"Event: {details['title']}\nDate: {details['date']}\n"
        f"Venue: {details['venue']}\nTime: {details['time']}\n"
        f"Ticket: {reservation.ticket_type}\nTicket code: {reservation.ticket_code}\n\n"
        "Please present this ticket code at the event entrance."
    )
    html_body = (
        f"<h2>Your event ticket is confirmed</h2><p>Hello {escape(reservation.full_name)},</p>"
        f"<p>Your payment has been confirmed for <strong>{escape(details['title'])}</strong>.</p>"
        f"<p><strong>Date:</strong> {escape(details['date'])}<br>"
        f"<strong>Venue:</strong> {escape(details['venue'])}<br>"
        f"<strong>Time:</strong> {escape(details['time'])}<br>"
        f"<strong>Ticket:</strong> {escape(reservation.ticket_type)}<br>"
        f"<strong>Ticket code:</strong> {escape(reservation.ticket_code)}</p>"
        "<p>Please present this code at the event entrance.</p>"
    )
    try:
        message = EmailMultiAlternatives(subject, text_body, settings.DEFAULT_FROM_EMAIL, [reservation.email])
        message.attach_alternative(html_body, 'text/html')
        message.send(fail_silently=False)
    except Exception:
        logger.exception('Unable to send ticket email for reservation %s', reservation.id)
        return False

    reservation.ticket_email_sent = True
    reservation.ticket_email_sent_at = timezone.now()
    reservation.save(update_fields=['ticket_email_sent', 'ticket_email_sent_at'])
    return True


def mark_reservation_paid(reservation: Reservation) -> bool:
    if reservation.status not in {'paid', 'confirmed'}:
        reservation.status = 'paid'
        try:
            qr_data = json.loads(reservation.qr_payload or '{}')
        except json.JSONDecodeError:
            qr_data = {}
        qr_data['status'] = 'paid'
        qr_data['ticketCode'] = reservation.ticket_code
        reservation.qr_payload = json.dumps(qr_data, separators=(',', ':'))
        reservation.save(update_fields=['status', 'qr_payload'])
    return send_ticket_email(reservation)


@api_view(['GET'])
def health_check(request):
    return Response({'status': 'ok', 'message': 'Django API is live and connected.'})


@api_view(['POST'])
@csrf_exempt
def signup_member(request):
    full_name = (request.data.get('fullName') or '').strip()
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''

    if not full_name or not email or not password:
        return Response({'error': 'Full name, email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(password) < 6:
        return Response({'error': 'Password must be at least 6 characters long.'}, status=status.HTTP_400_BAD_REQUEST)

    if Member.objects.filter(email__iexact=email).exists():
        return Response({'error': 'This email is already registered. Please log in instead.'}, status=status.HTTP_400_BAD_REQUEST)

    member = Member.objects.create(
        full_name=full_name,
        email=email,
        password_hash=make_password(password),
        auth_token=uuid.uuid4().hex,
    )

    return Response({
        'message': 'Account created successfully.',
        'user': serialize_member(member),
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@csrf_exempt
def login_member(request):
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''

    if not email or not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        member = Member.objects.get(email__iexact=email)
    except Member.DoesNotExist:
        return Response({'error': 'Incorrect email or password. Please try again.'}, status=status.HTTP_401_UNAUTHORIZED)

    if not check_password(password, member.password_hash):
        return Response({'error': 'Incorrect email or password. Please try again.'}, status=status.HTTP_401_UNAUTHORIZED)

    member.auth_token = uuid.uuid4().hex
    member.save(update_fields=['auth_token'])

    return Response({
        'message': 'Login successful.',
        'user': serialize_member(member),
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_current_member(request):
    token = request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()
    if not token:
        return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        member = Member.objects.get(auth_token=token)
    except Member.DoesNotExist:
        return Response({'error': 'Invalid session.'}, status=status.HTTP_401_UNAUTHORIZED)

    return Response({'user': serialize_member(member)})


@api_view(['POST'])
@csrf_exempt
def logout_member(request):
    token = request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()
    if token:
        Member.objects.filter(auth_token=token).update(auth_token=uuid.uuid4().hex)
    return Response({'message': 'Logged out successfully.'})


@api_view(['POST'])
@csrf_exempt
def signup_admin(request):
    full_name = (request.data.get('fullName') or '').strip()
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    if not full_name or not email or not password:
        return Response({'error': 'Full name, email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(password) < 8:
        return Response({'error': 'Admin passwords must be at least 8 characters long.'}, status=status.HTTP_400_BAD_REQUEST)
    if AdminAccount.objects.exists():
        return Response({'error': 'The initial admin account already exists. Ask an existing administrator to create additional access.'}, status=status.HTTP_403_FORBIDDEN)
    if AdminAccount.objects.filter(email__iexact=email).exists():
        return Response({'error': 'An admin account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

    admin = AdminAccount.objects.create(
        full_name=full_name,
        email=email,
        password_hash=make_password(password),
        auth_token=uuid.uuid4().hex,
    )
    return Response({'message': 'Admin account created successfully.', 'admin': serialize_admin(admin)}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@csrf_exempt
def login_admin(request):
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    try:
        admin = AdminAccount.objects.get(email__iexact=email, is_active=True)
    except AdminAccount.DoesNotExist:
        return Response({'error': 'Incorrect admin email or password.'}, status=status.HTTP_401_UNAUTHORIZED)
    if not check_password(password, admin.password_hash):
        return Response({'error': 'Incorrect admin email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    admin.auth_token = uuid.uuid4().hex
    admin.save(update_fields=['auth_token'])
    return Response({'message': 'Admin login successful.', 'admin': serialize_admin(admin)})


@api_view(['POST'])
@csrf_exempt
def logout_admin(request):
    admin = authenticated_admin(request)
    if admin:
        admin.auth_token = uuid.uuid4().hex
        admin.save(update_fields=['auth_token'])
    return Response({'message': 'Logged out successfully.'})


@api_view(['GET'])
def event_details(request):
    event = Event.objects.filter(is_active=True).order_by('-created_at').first()
    return Response(serialize_event(event))


@api_view(['POST'])
@csrf_exempt
def create_event(request):
    if not authenticated_admin(request):
        return Response({'error': 'Administrator authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    title = (request.data.get('title') or '').strip() or 'Singles to Mingle 2026'
    date = (request.data.get('date') or '').strip() or '27 November 2026'
    venue = (request.data.get('venue') or '').strip() or 'Sheraton Hotel'
    time = (request.data.get('time') or '').strip() or '4:30 PM'
    dress_code = (request.data.get('dressCode') or '').strip() or 'Black, Red, White & Pink'
    capacity = request.data.get('capacity')

    try:
        capacity_value = int(capacity) if capacity is not None and str(capacity).strip() else 200
    except (TypeError, ValueError):
        capacity_value = 200

    ticket_types = request.data.get('ticketTypes') or []

    if isinstance(ticket_types, list) and ticket_types:
        first_ticket = ticket_types[0] if isinstance(ticket_types[0], dict) else {}
        second_ticket = ticket_types[1] if len(ticket_types) > 1 and isinstance(ticket_types[1], dict) else {}
        early_label = str(first_ticket.get('name') or 'Early Bird').strip() or 'Early Bird'
        early_price = str(first_ticket.get('price') or 'UGX 150,000').strip() or 'UGX 150,000'
        late_label = str(second_ticket.get('name') or 'Late Ticket').strip() or 'Late Ticket'
        late_price = str(second_ticket.get('price') or 'UGX 200,000').strip() or 'UGX 200,000'
    else:
        early_label, early_price = 'Early Bird', 'UGX 150,000'
        late_label, late_price = 'Late Ticket', 'UGX 200,000'

    Event.objects.filter(is_active=True).update(is_active=False)
    event = Event.objects.create(
        title=title,
        date=date,
        venue=venue,
        time=time,
        dress_code=dress_code,
        capacity=capacity_value,
        early_ticket_label=early_label,
        early_ticket_price=early_price,
        late_ticket_label=late_label,
        late_ticket_price=late_price,
        is_active=True,
    )

    return Response({'message': 'Event created successfully.', 'event': serialize_event(event)}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def admin_dashboard(request):
    if not authenticated_admin(request):
        return Response({'error': 'Administrator authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    event = Event.objects.filter(is_active=True).order_by('-created_at').first()
    reservations = Reservation.objects.order_by('-created_at')
    attendees = [serialize_admin_attendee(reservation) for reservation in reservations]
    paid_count = reservations.filter(status__in={'paid', 'confirmed', 'checked_in'}).count()
    revenue_total = 0
    for reservation in reservations.filter(status__in={'paid', 'confirmed', 'checked_in'}):
        amount = get_ticket_amount(reservation.ticket_type)
        if amount is not None:
            revenue_total += amount

    payload = {
        'event': serialize_event(event),
        'summary': {
            'paidGuests': paid_count,
            'revenue': f'UGX {revenue_total:,}',
            'capacity': int((event or Event()).capacity if event else 200),
            'totalReservations': reservations.count(),
        },
        'attendees': attendees,
        'scannerLinks': [
            {'label': 'Main entrance', 'href': '/admin/scanner', 'type': 'Live check-in'},
            {'label': 'VIP lane', 'href': '/admin/scanner', 'type': 'Priority scan'},
            {'label': 'Guest list', 'href': '/admin/scanner', 'type': 'Printed list'},
        ],
    }
    return Response(payload)


@api_view(['POST'])
@csrf_exempt
def update_event(request, event_id: int):
    if not authenticated_admin(request):
        return Response({'error': 'Administrator authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

    title = (request.data.get('title') or event.title).strip() or event.title
    date = (request.data.get('date') or event.date).strip() or event.date
    venue = (request.data.get('venue') or event.venue).strip() or event.venue
    time = (request.data.get('time') or event.time).strip() or event.time
    dress_code = (request.data.get('dressCode') or event.dress_code).strip() or event.dress_code
    capacity = request.data.get('capacity')
    try:
        capacity_value = int(capacity) if capacity is not None and str(capacity).strip() else event.capacity
    except (TypeError, ValueError):
        capacity_value = event.capacity

    event.title = title
    event.date = date
    event.venue = venue
    event.time = time
    event.dress_code = dress_code
    event.capacity = capacity_value

    ticket_types = request.data.get('ticketTypes') or []
    if isinstance(ticket_types, list) and ticket_types:
        first_ticket = ticket_types[0] if isinstance(ticket_types[0], dict) else {}
        second_ticket = ticket_types[1] if len(ticket_types) > 1 and isinstance(ticket_types[1], dict) else {}
        event.early_ticket_label = str(first_ticket.get('name') or event.early_ticket_label).strip() or event.early_ticket_label
        event.early_ticket_price = str(first_ticket.get('price') or event.early_ticket_price).strip() or event.early_ticket_price
        event.late_ticket_label = str(second_ticket.get('name') or event.late_ticket_label).strip() or event.late_ticket_label
        event.late_ticket_price = str(second_ticket.get('price') or event.late_ticket_price).strip() or event.late_ticket_price

    event.save()
    return Response({'message': 'Event updated successfully.', 'event': serialize_event(event)})


@api_view(['POST'])
@csrf_exempt
def delete_event(request, event_id: int):
    if not authenticated_admin(request):
        return Response({'error': 'Administrator authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

    event.is_active = False
    event.save(update_fields=['is_active'])
    return Response({'message': 'Event deleted successfully.'})


@api_view(['POST'])
@csrf_exempt
def validate_ticket_scan(request):
    if not authenticated_admin(request):
        return Response({'error': 'Administrator authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    ticket_code = (request.data.get('ticketCode') or '').strip()
    if not ticket_code:
        return Response({'error': 'Ticket code is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        reservation = Reservation.objects.get(ticket_code__iexact=ticket_code)
    except Reservation.DoesNotExist:
        return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)

    should_check_in = bool(request.data.get('checkIn'))
    if should_check_in and reservation.status in {'paid', 'confirmed'}:
        reservation.status = 'checked_in'
        try:
            qr_data = json.loads(reservation.qr_payload or '{}')
        except json.JSONDecodeError:
            qr_data = {}
        qr_data['status'] = 'checked_in'
        qr_data['ticketCode'] = reservation.ticket_code
        reservation.qr_payload = json.dumps(qr_data, separators=(',', ':'))
        reservation.save(update_fields=['status', 'qr_payload'])

    guest = {
        'name': reservation.full_name,
        'email': reservation.email,
        'ticket': reservation.ticket_type,
        'status': reservation.status,
        'amount': f"UGX {get_ticket_amount(reservation.ticket_type) or 0:,}",
        'ticketCode': reservation.ticket_code,
    }
    return Response({'guest': guest, 'message': 'Ticket validated successfully.'})


def _build_gateway_config(gateway: str) -> dict[str, str]:
    if gateway == 'MTN Mobile Money':
        return {
            'name': gateway,
            'base_url': (os.getenv('MTN_MOBILE_MONEY_BASE_URL') or 'https://sandbox.momodeveloper.mtn.com').strip(),
            'api_key': (os.getenv('MTN_MOBILE_MONEY_API_KEY') or '').strip(),
            'subscription_key': (os.getenv('MTN_MOBILE_MONEY_SUBSCRIPTION_KEY') or '').strip(),
            'client_id': (os.getenv('MTN_MOBILE_MONEY_CLIENT_ID') or '').strip(),
            'client_secret': (os.getenv('MTN_MOBILE_MONEY_CLIENT_SECRET') or '').strip(),
            'callback_url': (os.getenv('MTN_MOBILE_MONEY_CALLBACK_URL') or 'http://localhost:8000/api/payments/callback/').strip(),
            'target_environment': (os.getenv('MTN_MOBILE_MONEY_TARGET_ENV') or 'sandbox').strip() or 'sandbox',
        }

    if gateway == 'Airtel Money':
        return {
            'name': gateway,
            'base_url': (os.getenv('AIRTEL_MONEY_BASE_URL') or '').strip(),
            'api_key': (os.getenv('AIRTEL_MONEY_API_KEY') or '').strip(),
            'client_id': (os.getenv('AIRTEL_MONEY_CLIENT_ID') or '').strip(),
            'client_secret': (os.getenv('AIRTEL_MONEY_CLIENT_SECRET') or '').strip(),
            'callback_url': (os.getenv('AIRTEL_MONEY_CALLBACK_URL') or 'http://localhost:8000/api/payments/callback/').strip(),
        }

    return {}


def _request_mtn_access_token(config: dict[str, str]) -> str:
    token_url = f"{config['base_url'].rstrip('/')}/collection/token/"
    credentials = f"{config['client_id']}:{config['client_secret']}"
    basic_token = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
    body = urllib_parse.urlencode({'grant_type': 'client_credentials'}).encode('utf-8')
    headers = {
        'Authorization': f'Basic {basic_token}',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
    }
    req = urllib_request.Request(token_url, data=body, headers=headers, method='POST')
    with urllib_request.urlopen(req, timeout=30) as response:
        data = json.loads(response.read().decode('utf-8') or '{}')
        token = data.get('access_token')
        if not token:
            raise ValueError('No access token returned from MTN sandbox.')
        return str(token)


def _refresh_mtn_payment_status(reservation: Reservation) -> None:
    """Verify a pending MTN transaction before releasing a ticket."""
    config = _build_gateway_config('MTN Mobile Money')
    if not reservation.payment_reference or not all((
        config.get('base_url'),
        config.get('client_id'),
        config.get('client_secret'),
        config.get('subscription_key'),
    )):
        return

    try:
        access_token = _request_mtn_access_token(config)
        status_url = f"{config['base_url'].rstrip('/')}/collection/v1_0/requesttopay/{reservation.payment_reference}"
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'X-Target-Environment': config.get('target_environment', 'sandbox'),
            'Ocp-Apim-Subscription-Key': config['subscription_key'],
        }
        req = urllib_request.Request(status_url, headers=headers, method='GET')
        with urllib_request.urlopen(req, timeout=15) as response:
            payload = json.loads(response.read().decode('utf-8') or '{}')
    except Exception:
        logger.warning('Unable to refresh MTN payment status for reservation %s', reservation.id, exc_info=True)
        return

    provider_status = str(payload.get('status') or '').upper()
    if provider_status in {'SUCCESSFUL', 'SUCCESS', 'COMPLETED'}:
        mark_reservation_paid(reservation)
    elif provider_status in {'FAILED', 'FAILURE', 'REJECTED', 'CANCELLED'}:
        reservation.status = 'failed'
        reservation.save(update_fields=['status'])


def _call_live_mobile_money_gateway(gateway: str, phone_number: str, amount: str, full_name: str, ticket_type: str, reference: str) -> dict[str, Any]:
    config = _build_gateway_config(gateway)
    if not config:
        return {
            'live': False,
            'status': 'error',
            'message': 'Unsupported gateway selected.',
        }

    if gateway == 'MTN Mobile Money':
        client_id = config.get('client_id', '')
        client_secret = config.get('client_secret', '')
        subscription_key = config.get('subscription_key', '')
        base_url = config.get('base_url', '').rstrip('/')

        if not base_url or not client_id or not client_secret or not subscription_key:
            return {
                'live': False,
                'status': 'not_configured',
                'message': 'MTN Mobile Money sandbox is not configured. Add MTN_MOBILE_MONEY_BASE_URL, MTN_MOBILE_MONEY_CLIENT_ID, MTN_MOBILE_MONEY_CLIENT_SECRET, and MTN_MOBILE_MONEY_SUBSCRIPTION_KEY before testing.',
                'required': ['MTN_MOBILE_MONEY_BASE_URL', 'MTN_MOBILE_MONEY_CLIENT_ID', 'MTN_MOBILE_MONEY_CLIENT_SECRET', 'MTN_MOBILE_MONEY_SUBSCRIPTION_KEY'],
            }

        try:
            access_token = _request_mtn_access_token(config)
        except Exception as exc:
            return {
                'live': True,
                'status': 'error',
                'message': f'MTN sandbox auth failed: {exc}',
                'reference': reference,
                'gateway': gateway,
            }

        payload = {
            'amount': str(amount),
            'currency': 'UGX',
            'externalId': reference,
            'payer': {'partyIdType': 'MSISDN', 'partyId': phone_number},
            'payerMessage': f'Ticket purchase for {full_name}',
            'payeeNote': f'Event ticket - {ticket_type}',
            'callbackUrl': config.get('callback_url', 'http://localhost:8000/api/payments/callback/'),
        }
        request_url = f"{base_url}/collection/v1_0/requesttopay"
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Reference-Id': reference,
            'X-Target-Environment': config.get('target_environment', 'sandbox'),
            'Ocp-Apim-Subscription-Key': subscription_key,
        }

        try:
            req = urllib_request.Request(request_url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
            with urllib_request.urlopen(req, timeout=30) as response:
                response_payload = response.read().decode('utf-8', errors='ignore')
                response_json = json.loads(response_payload) if response_payload else {}
                return {
                    'live': True,
                    'status': 'pending',
                    'message': f'Payment request sent via MTN Mobile Money for {full_name}.',
                    'reference': reference,
                    'gateway': gateway,
                    'amount': str(amount),
                    'ticketType': ticket_type,
                    'provider_response': response_json,
                }
        except urllib_error.HTTPError as exc:
            body = exc.read().decode('utf-8', errors='ignore')
            try:
                provider_json = json.loads(body)
            except Exception:
                provider_json = {'raw_error': body}
            return {
                'live': True,
                'status': 'error',
                'message': f'MTN sandbox rejected the payment request.',
                'reference': reference,
                'gateway': gateway,
                'provider_response': provider_json,
            }
        except Exception as exc:
            return {
                'live': True,
                'status': 'error',
                'message': f'MTN Mobile Money connection failed: {exc}',
                'reference': reference,
                'gateway': gateway,
            }

    if gateway == 'Airtel Money':
        base_url = config.get('base_url', '')
        api_key = config.get('api_key', '')
        client_id = config.get('client_id', '')
        client_secret = config.get('client_secret', '')
        if not base_url or not api_key or not client_id or not client_secret:
            return {
                'live': False,
                'status': 'not_configured',
                'message': 'Airtel Money is not configured. Add AIRTEL_MONEY_BASE_URL, AIRTEL_MONEY_API_KEY, AIRTEL_MONEY_CLIENT_ID and AIRTEL_MONEY_CLIENT_SECRET before testing.',
                'required': ['AIRTEL_MONEY_BASE_URL', 'AIRTEL_MONEY_API_KEY', 'AIRTEL_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_SECRET'],
            }

        payload = {
            'amount': str(amount),
            'currency': 'UGX',
            'externalId': reference,
            'payer': {'partyIdType': 'MSISDN', 'partyId': phone_number},
            'payerMessage': f'Ticket purchase for {full_name}',
            'payeeNote': f'Event ticket - {ticket_type}',
            'callbackUrl': config.get('callback_url') or 'http://localhost:8000/api/payments/callback/',
        }
        headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', 'Accept': 'application/json'}
        try:
            req = urllib_request.Request(base_url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
            with urllib_request.urlopen(req, timeout=30) as response:
                response_payload = response.read().decode('utf-8', errors='ignore')
                response_json = json.loads(response_payload) if response_payload else {}
                return {
                    'live': True,
                    'status': 'pending',
                    'message': f'Payment request sent via Airtel Money for {full_name}.',
                    'reference': reference,
                    'gateway': gateway,
                    'amount': str(amount),
                    'ticketType': ticket_type,
                    'provider_response': response_json,
                }
        except urllib_error.HTTPError as exc:
            body = exc.read().decode('utf-8', errors='ignore')
            try:
                provider_json = json.loads(body)
            except Exception:
                provider_json = {'raw_error': body}
            return {
                'live': True,
                'status': 'error',
                'message': f'Airtel Money rejected the payment request.',
                'reference': reference,
                'gateway': gateway,
                'provider_response': provider_json,
            }
        except Exception as exc:
            return {
                'live': True,
                'status': 'error',
                'message': f'Airtel Money connection failed: {exc}',
                'reference': reference,
                'gateway': gateway,
            }

    return {
        'live': False,
        'status': 'error',
        'message': 'Gateway configuration is unsupported.',
    }


@api_view(['POST'])
@csrf_exempt
def initiate_payment(request):
    token = request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()
    if not token:
        return Response({'error': 'Authentication required to initiate a payment.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        member = Member.objects.get(auth_token=token)
    except Member.DoesNotExist:
        return Response({'error': 'Invalid session.'}, status=status.HTTP_401_UNAUTHORIZED)

    reservation_id = request.data.get('reservationId')
    if not reservation_id:
        return Response({'error': 'Create a reservation before requesting payment.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        reservation = Reservation.objects.get(id=reservation_id, member=member)
    except (Reservation.DoesNotExist, ValueError, TypeError):
        return Response({'error': 'Reservation not found.'}, status=status.HTTP_404_NOT_FOUND)

    if reservation.status in {'paid', 'confirmed'}:
        return Response({'error': 'This reservation has already been paid for.'}, status=status.HTTP_400_BAD_REQUEST)

    gateway = (request.data.get('paymentMethod') or request.data.get('gateway') or reservation.payment_method).strip()
    phone_number = normalize_phone_number((request.data.get('phoneNumber') or request.data.get('paymentPhone') or '').strip())
    full_name = reservation.full_name
    ticket_type = reservation.ticket_type
    amount = get_ticket_amount(ticket_type)

    if gateway not in {'MTN Mobile Money', 'Airtel Money'}:
        return Response({'error': 'Please select MTN Mobile Money or Airtel Money.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(phone_number) < 10 or not phone_number.isdigit():
        return Response({'error': 'Enter a valid mobile money phone number.'}, status=status.HTTP_400_BAD_REQUEST)

    if amount is None:
        return Response({'error': 'Please select a valid ticket type.'}, status=status.HTTP_400_BAD_REQUEST)

    reference = f'{gateway[:3].upper()}-{uuid.uuid4().hex[:18]}'
    gateway_result = _call_live_mobile_money_gateway(gateway, phone_number, str(amount), full_name, ticket_type, reference)

    if not gateway_result.get('live', False):
        return Response({
            'status': gateway_result.get('status', 'not_configured'),
            'error': 'Mobile money checkout is temporarily unavailable. Please contact us to reserve your ticket.',
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if gateway_result.get('status') == 'pending':
        reservation.payment_method = gateway
        reservation.payment_phone = phone_number
        reservation.payment_reference = reference
        reservation.status = 'pending'
        reservation.save(update_fields=['payment_method', 'payment_phone', 'payment_reference', 'status'])

    return Response({
        'status': gateway_result.get('status', 'pending'),
        'message': gateway_result.get('message', f'Payment request sent via {gateway} for {full_name}.'),
        'reference': gateway_result.get('reference', reference),
        'gateway': gateway_result.get('gateway', gateway),
        'amount': gateway_result.get('amount', str(amount)),
        'ticketType': gateway_result.get('ticketType', ticket_type),
        'provider_response': gateway_result.get('provider_response'),
    }, status=status.HTTP_200_OK if gateway_result.get('status') == 'pending' else status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@csrf_exempt
def reserve_ticket(request):
    token = request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()
    if not token:
        return Response({'error': 'Authentication required to reserve a ticket.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        member = Member.objects.get(auth_token=token)
    except Member.DoesNotExist:
        return Response({'error': 'Invalid session.'}, status=status.HTTP_401_UNAUTHORIZED)

    full_name = (request.data.get('fullName') or member.full_name).strip()
    email = (request.data.get('email') or member.email).strip().lower()
    phone = (request.data.get('phone') or '').strip()
    ticket_type = (request.data.get('ticketType') or 'Early Bird — UGX 150,000').strip()
    payment_method = (request.data.get('paymentMethod') or request.data.get('gateway') or 'MTN Mobile Money').strip()
    payment_phone = (request.data.get('paymentPhone') or '').strip()

    if not full_name or not phone or not email:
        return Response({'error': 'Full name, phone number and email are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if get_ticket_amount(ticket_type) is None:
        return Response({'error': 'Please select a valid ticket type.'}, status=status.HTTP_400_BAD_REQUEST)

    if payment_method not in {'MTN Mobile Money', 'Airtel Money'}:
        payment_method = 'MTN Mobile Money'

    ticket_code = f'DRM-{uuid.uuid4().hex[:10].upper()}'
    qr_payload = json.dumps({
        'event': 'Singles to Mingle 2026',
        'fullName': full_name,
        'email': email,
        'phone': phone,
        'ticketType': ticket_type,
        'ticketCode': ticket_code,
        'status': 'pending',
    }, separators=(',', ':'))

    reservation = Reservation.objects.create(
        member=member,
        full_name=full_name,
        email=email,
        phone=phone,
        ticket_type=ticket_type,
        ticket_code=ticket_code,
        qr_payload=qr_payload,
        payment_method=payment_method,
        payment_phone=payment_phone,
        status='pending',
    )

    return Response({
        'message': 'Reservation created. Complete your payment to receive the ticket by email.',
        'reservation': serialize_reservation(reservation),
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def reservation_status(request, reservation_id: int):
    token = request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()
    if not token:
        return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        member = Member.objects.get(auth_token=token)
        reservation = Reservation.objects.get(id=reservation_id, member=member)
    except (Member.DoesNotExist, Reservation.DoesNotExist):
        return Response({'error': 'Reservation not found.'}, status=status.HTTP_404_NOT_FOUND)

    if reservation.status == 'pending' and reservation.payment_method == 'MTN Mobile Money':
        _refresh_mtn_payment_status(reservation)
        reservation.refresh_from_db()

    return Response({'reservation': serialize_reservation(reservation)})


@api_view(['POST'])
@csrf_exempt
def payment_callback(request):
    expected_secret = settings.PAYMENT_CALLBACK_SECRET
    received_secret = request.headers.get('X-Payment-Callback-Secret') or request.query_params.get('token', '')
    if not expected_secret or received_secret != expected_secret:
        return Response({'error': 'Invalid payment callback.'}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data if isinstance(request.data, dict) else {}
    reference = str(payload.get('reference') or payload.get('externalId') or payload.get('transactionReference') or '').strip()
    provider_status = str(payload.get('status') or payload.get('financialTransactionStatus') or '').upper().strip()
    if not reference:
        return Response({'error': 'Payment reference is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        reservation = Reservation.objects.get(payment_reference=reference)
    except Reservation.DoesNotExist:
        return Response({'error': 'Reservation not found.'}, status=status.HTTP_404_NOT_FOUND)

    if provider_status in {'SUCCESSFUL', 'SUCCESS', 'COMPLETED', 'PAID'}:
        email_sent = mark_reservation_paid(reservation)
        return Response({'status': 'paid', 'emailSent': email_sent, 'reservation': serialize_reservation(reservation)})

    if provider_status in {'FAILED', 'FAILURE', 'REJECTED', 'CANCELLED'}:
        reservation.status = 'failed'
        reservation.save(update_fields=['status'])
        return Response({'status': 'failed', 'reservation': serialize_reservation(reservation)})

    return Response({'status': 'pending', 'reservation': serialize_reservation(reservation)})


@api_view(['POST'])
@csrf_exempt
def resend_ticket_email(request, reservation_id: int):
    token = request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()
    if not token:
        return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        member = Member.objects.get(auth_token=token)
        reservation = Reservation.objects.get(id=reservation_id, member=member)
    except (Member.DoesNotExist, Reservation.DoesNotExist):
        return Response({'error': 'Reservation not found.'}, status=status.HTTP_404_NOT_FOUND)

    if reservation.status not in {'paid', 'confirmed'}:
        return Response({'error': 'Your ticket is emailed after payment is confirmed.'}, status=status.HTTP_400_BAD_REQUEST)

    reservation.ticket_email_sent = False
    reservation.save(update_fields=['ticket_email_sent'])
    email_sent = send_ticket_email(reservation)
    return Response({'emailSent': email_sent, 'reservation': serialize_reservation(reservation)}, status=status.HTTP_200_OK if email_sent else status.HTTP_503_SERVICE_UNAVAILABLE)


