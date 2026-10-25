import base64
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime
from html import escape
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request
from email.message import MIMEPart

import segno
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import DEFAULT_TICKET_COLOR, AdminAccount, Event, Member, Reservation, Ticket, TicketType, build_code_prefix

logger = logging.getLogger(__name__)

PAID_STATUSES = {'paid', 'confirmed', 'checked_in'}
MAX_TICKETS_PER_ORDER = 10
HEX_COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
EVENT_IMAGE_TYPES = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}

DEFAULT_EVENT = {
    'title': 'Singles to Mingle 2026',
    'date': '27 November 2026',
    'venue': 'Sheraton Hotel',
    'time': '4:30 PM',
    'dressCode': 'Black, Red, White & Pink',
    'ticketOptions': [
        {'id': None, 'label': 'Early Bird', 'price': 'UGX 150,000', 'amount': 150000, 'highlight': True},
        {'id': None, 'label': 'Late Ticket', 'price': 'UGX 200,000', 'amount': 200000, 'highlight': False},
    ],
}


def format_ugx(amount: int) -> str:
    return f'UGX {amount:,}'


def parse_amount(value: Any) -> int | None:
    digits = ''.join(character for character in str(value or '') if character.isdigit())
    return int(digits) if digits else None


def format_event_date(value: str) -> str:
    """Show ISO dates from the admin date picker as '27 November 2026'; leave free text alone."""
    try:
        return datetime.strptime(value.strip(), '%Y-%m-%d').strftime('%d %B %Y').lstrip('0')
    except ValueError:
        return value


def format_event_time(value: str) -> str:
    """Show 24-hour times from the admin time picker as '4:30 PM'; leave free text alone."""
    try:
        return datetime.strptime(value.strip(), '%H:%M').strftime('%I:%M %p').lstrip('0')
    except ValueError:
        return value


def read_color(value: Any) -> str | None:
    """Accept '#a1b2c3' style colours from the admin colour picker."""
    color = str(value or '').strip()
    return color.lower() if HEX_COLOR.match(color) else None


def event_image_url(event: Event | None) -> str | None:
    return event.image.url if event and event.image else None


def ticket_color(reservation: Reservation) -> str:
    return reservation.ticket_type_ref.color if reservation.ticket_type_ref else DEFAULT_TICKET_COLOR


def read_token(request) -> str:
    return request.headers.get('Authorization', '').replace('Token ', '').replace('Bearer ', '').strip()


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
    token = read_token(request)
    if not token:
        return None
    try:
        return AdminAccount.objects.get(auth_token=token, is_active=True)
    except AdminAccount.DoesNotExist:
        return None


def authenticated_member(request) -> Member | None:
    token = read_token(request)
    if not token:
        return None
    return Member.objects.filter(auth_token=token).first()


def live_event() -> Event | None:
    return Event.objects.filter(is_active=True).order_by('-created_at').first()


def paid_tickets(event: Event):
    return Ticket.objects.filter(reservation__event=event, reservation__status__in=PAID_STATUSES)


def serialize_ticket_type(ticket_type: TicketType) -> dict[str, Any]:
    return {
        'id': ticket_type.id,
        'label': ticket_type.name,
        'price': format_ugx(ticket_type.price),
        'amount': ticket_type.price,
        'highlight': ticket_type.highlight,
        'codePrefix': ticket_type.code_prefix,
        'color': ticket_type.color,
    }


def serialize_event(event: Event | None) -> dict[str, Any]:
    if event is None:
        default_event = DEFAULT_EVENT.copy()
        default_event['capacity'] = 200
        default_event['id'] = None
        default_event['imageUrl'] = None
        return default_event

    return {
        'id': event.id,
        'title': event.title,
        'date': format_event_date(event.date),
        'dateValue': event.date,
        'venue': event.venue,
        'time': format_event_time(event.time),
        'timeValue': event.time,
        'dressCode': event.dress_code,
        'imageUrl': event_image_url(event),
        'capacity': event.capacity,
        'ticketsRemaining': max(event.capacity - paid_tickets(event).count(), 0),
        'ticketOptions': [serialize_ticket_type(ticket_type) for ticket_type in event.ticket_types.all()],
    }


def serialize_admin_event(event: Event) -> dict[str, Any]:
    paid_reservations = event.reservations.filter(status__in=PAID_STATUSES)
    tickets = paid_tickets(event)
    payload = serialize_event(event)
    payload.update({
        'isActive': event.is_active,
        'scannerToken': event.scanner_token,
        'ticketsSold': tickets.count(),
        'checkedIn': tickets.filter(checked_in_at__isnull=False).count(),
        'revenue': format_ugx(paid_reservations.aggregate(total=Sum('total_amount'))['total'] or 0),
        'hasSales': event.reservations.exists(),
    })
    for option in payload['ticketOptions']:
        option['sold'] = tickets.filter(reservation__ticket_type_ref_id=option['id']).count()
    return payload


def build_ticket_qr(event: Event, ticket_type_name: str, guest_name: str, ticket_code: str) -> str:
    """Everything the door needs is readable straight from the code; the ticket code is what gets verified."""
    return json.dumps({
        'event': event.title,
        'date': format_event_date(event.date),
        'ticketType': ticket_type_name,
        'name': guest_name,
        'code': ticket_code,
    }, separators=(',', ':'))


def read_scanned_code(raw_value: str) -> str:
    """Accept either a bare ticket code or the JSON content of a ticket QR code."""
    value = (raw_value or '').strip()
    if value.startswith('{'):
        try:
            data = json.loads(value)
        except json.JSONDecodeError:
            return value
        return str(data.get('code') or data.get('ticketCode') or '').strip()
    return value


def generate_ticket_code(prefix: str) -> str:
    while True:
        code = f'{prefix}-{uuid.uuid4().hex[:6].upper()}'
        if not Ticket.objects.filter(ticket_code=code).exists() and not Reservation.objects.filter(ticket_code=code).exists():
            return code


def serialize_ticket(ticket: Ticket) -> dict[str, Any]:
    return {
        'guestName': ticket.guest_name,
        'ticketCode': ticket.ticket_code,
        'qrPayload': ticket.qr_payload,
        'checkedIn': ticket.checked_in_at is not None,
        'checkedInAt': ticket.checked_in_at.isoformat() if ticket.checked_in_at else None,
    }


def serialize_reservation(reservation: Reservation) -> dict[str, Any]:
    tickets = [serialize_ticket(ticket) for ticket in reservation.tickets.all()]
    return {
        'id': reservation.id,
        'fullName': reservation.full_name,
        'email': reservation.email,
        'eventTitle': reservation.event.title if reservation.event else '',
        'eventDate': format_event_date(reservation.event.date) if reservation.event else '',
        'eventTime': format_event_time(reservation.event.time) if reservation.event else '',
        'eventVenue': reservation.event.venue if reservation.event else '',
        'eventImageUrl': event_image_url(reservation.event),
        'ticketType': reservation.ticket_type_ref.name if reservation.ticket_type_ref else reservation.ticket_type,
        'ticketColor': ticket_color(reservation),
        'quantity': reservation.quantity,
        'totalAmount': format_ugx(reservation.total_amount),
        'createdAt': reservation.created_at.isoformat(),
        'status': reservation.status,
        'paymentMethod': reservation.payment_method,
        'emailSent': reservation.ticket_email_sent,
        'tickets': tickets,
        'ticket': {
            'ticketCode': reservation.ticket_code,
            'qrPayload': reservation.qr_payload,
        },
    }


def serialize_guest_order(reservation: Reservation) -> dict[str, Any]:
    tickets = list(reservation.tickets.all())
    return {
        'id': reservation.id,
        'buyerName': reservation.full_name,
        'email': reservation.email,
        'phone': reservation.phone,
        'eventTitle': reservation.event.title if reservation.event else '',
        'ticketType': reservation.ticket_type_ref.name if reservation.ticket_type_ref else reservation.ticket_type,
        'ticketColor': ticket_color(reservation),
        'quantity': reservation.quantity,
        'amountPaid': format_ugx(reservation.total_amount),
        'amountValue': reservation.total_amount,
        'paymentMethod': reservation.payment_method,
        'status': reservation.status,
        'createdAt': reservation.created_at.isoformat(),
        'checkedIn': sum(1 for ticket in tickets if ticket.checked_in_at),
        'tickets': [serialize_ticket(ticket) for ticket in tickets],
    }


def ticket_qr_png(payload: str) -> bytes:
    buffer = io.BytesIO()
    segno.make(payload, error='m').save(buffer, kind='png', scale=8, border=2, dark='#3c1730')
    return buffer.getvalue()


def send_ticket_email(reservation: Reservation) -> bool:
    """Deliver event tickets, with a QR code per guest, only after a payment has been confirmed."""
    if reservation.status not in PAID_STATUSES or reservation.ticket_email_sent:
        return reservation.ticket_email_sent

    details = serialize_event(reservation.event or live_event())
    tickets = list(reservation.tickets.all())
    ticket_type = reservation.ticket_type_ref.name if reservation.ticket_type_ref else reservation.ticket_type
    color = ticket_color(reservation)
    subject = f"Your ticket{'s' if len(tickets) > 1 else ''} for {details['title']}"
    ticket_lines = '\n'.join(f'- {ticket.guest_name}: {ticket.ticket_code}' for ticket in tickets) or f'- {reservation.full_name}: {reservation.ticket_code}'
    text_body = (
        f"Hello {reservation.full_name},\n\n"
        f"Your payment of {format_ugx(reservation.total_amount)} has been confirmed.\n\n"
        f"Event: {details['title']}\nDate: {details['date']}\n"
        f"Venue: {details['venue']}\nTime: {details['time']}\n"
        f"Ticket type: {ticket_type} x {reservation.quantity}\n\n"
        f"Tickets:\n{ticket_lines}\n\n"
        "Each guest's QR code is attached. Show it, or the ticket code, at the entrance."
    )
    ticket_cards = ''.join(
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:460px;margin:0 0 14px;border:1px solid #f0d8e4;border-left:8px solid {color};border-radius:14px;">'
        f'<tr><td style="padding:14px;width:150px;"><img src="cid:ticket-{index}" width="140" height="140" alt="QR code for {escape(ticket.guest_name)}" style="display:block;"></td>'
        f'<td style="padding:14px 14px 14px 0;font-family:Arial,sans-serif;color:#3c1730;">'
        f'<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:{color};color:#fff;font-size:11px;font-weight:bold;letter-spacing:1px;">{escape(ticket_type.upper())}</span>'
        f'<p style="margin:10px 0 4px;font-size:17px;font-weight:bold;">{escape(ticket.guest_name)}</p>'
        f'<p style="margin:0;font-family:Consolas,monospace;font-size:13px;color:#a72968;">{escape(ticket.ticket_code)}</p></td></tr></table>'
        for index, ticket in enumerate(tickets)
    )
    html_body = (
        '<div style="font-family:Arial,sans-serif;color:#3c1730;">'
        f'<h2 style="color:#6e234e;">Your tickets are confirmed</h2><p>Hello {escape(reservation.full_name)},</p>'
        f"<p>Your payment of {escape(format_ugx(reservation.total_amount))} has been confirmed for "
        f"<strong>{escape(details['title'])}</strong>.</p>"
        f"<p><strong>Date:</strong> {escape(details['date'])}<br>"
        f"<strong>Venue:</strong> {escape(details['venue'])}<br>"
        f"<strong>Time:</strong> {escape(details['time'])}<br>"
        f"<strong>Ticket type:</strong> {escape(ticket_type)} &times; {reservation.quantity}</p>"
        f"{ticket_cards}"
        "<p>Each guest shows their own QR code, or the ticket code, at the entrance.</p></div>"
    )
    try:
        message = EmailMultiAlternatives(subject, text_body, settings.DEFAULT_FROM_EMAIL, [reservation.email])
        message.attach_alternative(html_body, 'text/html')
        for index, ticket in enumerate(tickets):
            image = MIMEPart()
            image.set_content(
                ticket_qr_png(ticket.qr_payload or ticket.ticket_code), maintype='image', subtype='png',
                disposition='inline', filename=f'{ticket.ticket_code}.png', cid=f'<ticket-{index}>',
            )
            message.attach(image)
        message.send(fail_silently=False)
    except Exception:
        logger.exception('Unable to send ticket email for reservation %s', reservation.id)
        return False

    reservation.ticket_email_sent = True
    reservation.ticket_email_sent_at = timezone.now()
    reservation.save(update_fields=['ticket_email_sent', 'ticket_email_sent_at'])
    return True


def mark_reservation_paid(reservation: Reservation) -> bool:
    if reservation.status not in PAID_STATUSES:
        reservation.status = 'paid'
        reservation.save(update_fields=['status'])
    return send_ticket_email(reservation)


def check_in_ticket(raw_code: str, event: Event | None = None, commit: bool = True) -> tuple[int, dict[str, Any]]:
    """Validate a scanned ticket and admit it once. Returns (http_status, body)."""
    code = read_scanned_code(raw_code)
    if not code:
        return status.HTTP_400_BAD_REQUEST, {'result': 'invalid', 'error': 'Ticket code is required.'}

    ticket = Ticket.objects.select_related('reservation__event', 'reservation__ticket_type_ref').filter(ticket_code__iexact=code).first()
    if ticket is None:
        return status.HTTP_404_NOT_FOUND, {'result': 'not_found', 'error': 'Ticket not found.', 'ticketCode': code}

    reservation = ticket.reservation
    guest = {
        'name': ticket.guest_name,
        'buyerName': reservation.full_name,
        'email': reservation.email,
        'ticket': reservation.ticket_type_ref.name if reservation.ticket_type_ref else reservation.ticket_type,
        'ticketColor': ticket_color(reservation),
        'eventTitle': reservation.event.title if reservation.event else '',
        'status': reservation.status,
        'amount': format_ugx(reservation.unit_price),
        'ticketCode': ticket.ticket_code,
        'checkedInAt': ticket.checked_in_at.isoformat() if ticket.checked_in_at else None,
    }

    if event is not None and reservation.event_id != event.id:
        return status.HTTP_400_BAD_REQUEST, {'result': 'wrong_event', 'error': 'This ticket is for a different event.', 'guest': guest}
    if reservation.status not in PAID_STATUSES:
        return status.HTTP_400_BAD_REQUEST, {'result': 'unpaid', 'error': 'Payment for this ticket has not been confirmed.', 'guest': guest}
    if ticket.checked_in_at is not None:
        return status.HTTP_409_CONFLICT, {'result': 'already_checked_in', 'error': 'This ticket has already been used.', 'guest': guest}
    if not commit:
        return status.HTTP_200_OK, {'result': 'valid', 'message': 'Ticket is valid.', 'guest': guest}

    ticket.checked_in_at = timezone.now()
    ticket.save(update_fields=['checked_in_at'])
    if not reservation.tickets.filter(checked_in_at__isnull=True).exists():
        reservation.status = 'checked_in'
        reservation.save(update_fields=['status'])
    guest['status'] = reservation.status
    guest['checkedInAt'] = ticket.checked_in_at.isoformat()
    return status.HTTP_200_OK, {'result': 'checked_in', 'message': f'{ticket.guest_name} is checked in.', 'guest': guest}


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


@api_view(['GET'])
def member_reservations(request):
    """The signed-in member's orders and tickets, newest first, for their dashboard."""
    member = authenticated_member(request)
    if member is None:
        return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    reservations = (
        member.reservations.exclude(status='failed')
        .select_related('event', 'ticket_type_ref')
        .prefetch_related('tickets')
        .order_by('-created_at')
    )
    return Response({'reservations': [serialize_reservation(reservation) for reservation in reservations]})


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


ADMIN_REQUIRED = {'error': 'Administrator authentication required.'}


@api_view(['GET'])
def event_details(request):
    return Response(serialize_event(live_event()))


def _create_ticket_type(event: Event, name: str, price: int, highlight: bool, color: str | None = None) -> TicketType:
    return TicketType.objects.create(
        event=event,
        name=name,
        price=price,
        code_prefix=build_code_prefix(event.title, name),
        highlight=highlight,
        color=color or DEFAULT_TICKET_COLOR,
    )


def _read_event_fields(data, current: Event | None = None) -> tuple[dict[str, Any], str | None]:
    """Collect event form fields; every field is required on create and optional on update."""
    labels = {'title': 'Event title', 'date': 'Date', 'time': 'Time', 'venue': 'Venue', 'dressCode': 'Dress code'}
    columns = {'title': 'title', 'date': 'date', 'time': 'time', 'venue': 'venue', 'dressCode': 'dress_code'}
    fields: dict[str, Any] = {}
    missing = []
    for key, column in columns.items():
        value = str(data.get(key) or '').strip()
        if value:
            fields[column] = value
        elif current is None:
            missing.append(labels[key])
    if missing:
        return fields, f"{', '.join(missing)} {'is' if len(missing) == 1 else 'are'} required."

    capacity = data.get('capacity')
    if capacity is not None and str(capacity).strip():
        try:
            fields['capacity'] = max(int(capacity), 1)
        except (TypeError, ValueError):
            return fields, 'Capacity must be a whole number.'
    return fields, None


@api_view(['GET', 'POST'])
@csrf_exempt
def admin_events(request):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        return Response({'events': [serialize_admin_event(event) for event in Event.objects.prefetch_related('ticket_types')]})

    fields, error = _read_event_fields(request.data)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        # The newest published event is the one members can book.
        Event.objects.filter(is_active=True).update(is_active=False)
        event = Event.objects.create(is_active=True, **fields)
        ticket_types = request.data.get('ticketTypes') or []
        for index, ticket in enumerate(ticket_types if isinstance(ticket_types, list) else []):
            name = str((ticket or {}).get('name') or '').strip()
            price = parse_amount((ticket or {}).get('price'))
            if name and price:
                _create_ticket_type(event, name, price, highlight=index == 0, color=read_color((ticket or {}).get('color')))

    return Response({'message': 'Event created. Now add its ticket types.', 'event': serialize_admin_event(event)}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@csrf_exempt
def update_event(request, event_id: int):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    event = Event.objects.filter(id=event_id).first()
    if event is None:
        return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

    fields, error = _read_event_fields(request.data, current=event)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        for column, value in fields.items():
            setattr(event, column, value)
        if request.data.get('isActive') is True:
            Event.objects.exclude(id=event.id).filter(is_active=True).update(is_active=False)
            event.is_active = True
        event.save()
    return Response({'message': 'Event updated successfully.', 'event': serialize_admin_event(event)})


@api_view(['POST'])
@csrf_exempt
def delete_event(request, event_id: int):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    event = Event.objects.filter(id=event_id).first()
    if event is None:
        return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)
    if event.reservations.exists():
        return Response({'error': 'This event already has reservations, so it cannot be deleted.'}, status=status.HTTP_400_BAD_REQUEST)

    if event.image:
        event.image.delete(save=False)
    event.delete()
    return Response({'message': 'Event deleted successfully.'})


@api_view(['POST'])
@csrf_exempt
def event_image(request, event_id: int):
    """Upload (multipart field 'image') or, with remove=true, clear an event's poster image."""
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    event = Event.objects.filter(id=event_id).first()
    if event is None:
        return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

    if str(request.data.get('remove') or '').lower() == 'true':
        if event.image:
            event.image.delete(save=True)
        return Response({'message': 'Event image removed.', 'event': serialize_admin_event(event)})

    upload = request.FILES.get('image')
    if upload is None:
        return Response({'error': 'Choose an image to upload.'}, status=status.HTTP_400_BAD_REQUEST)
    extension = EVENT_IMAGE_TYPES.get(upload.content_type or '')
    if extension is None:
        return Response({'error': 'Upload a JPG, PNG, WebP or GIF image.'}, status=status.HTTP_400_BAD_REQUEST)
    if upload.size > settings.MAX_EVENT_IMAGE_BYTES:
        return Response({'error': 'The image must be 5 MB or smaller.'}, status=status.HTTP_400_BAD_REQUEST)

    if event.image:
        event.image.delete(save=False)
    event.image.save(f'event-{event.id}-{uuid.uuid4().hex[:8]}.{extension}', upload, save=True)
    return Response({'message': 'Event image saved.', 'event': serialize_admin_event(event)})


@api_view(['POST'])
@csrf_exempt
def create_ticket_type(request, event_id: int):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    event = Event.objects.filter(id=event_id).first()
    if event is None:
        return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

    name = str(request.data.get('name') or '').strip()
    price = parse_amount(request.data.get('price'))
    if not name or not price:
        return Response({'error': 'Ticket name and a price above zero are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if event.ticket_types.filter(name__iexact=name).exists():
        return Response({'error': f'This event already has a "{name}" ticket.'}, status=status.HTTP_400_BAD_REQUEST)
    color = request.data.get('color')
    if color and read_color(color) is None:
        return Response({'error': 'Pick a ticket colour like #b82b6c.'}, status=status.HTTP_400_BAD_REQUEST)

    _create_ticket_type(event, name, price, highlight=bool(request.data.get('highlight')), color=read_color(color))
    return Response({'message': 'Ticket type added.', 'event': serialize_admin_event(event)}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@csrf_exempt
def update_ticket_type(request, ticket_type_id: int):
    """Change a ticket type's colour; safe after sales because the colour is display-only."""
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    ticket_type = TicketType.objects.select_related('event').filter(id=ticket_type_id).first()
    if ticket_type is None:
        return Response({'error': 'Ticket type not found.'}, status=status.HTTP_404_NOT_FOUND)
    color = read_color(request.data.get('color'))
    if color is None:
        return Response({'error': 'Pick a ticket colour like #b82b6c.'}, status=status.HTTP_400_BAD_REQUEST)

    ticket_type.color = color
    ticket_type.save(update_fields=['color'])
    return Response({'message': 'Ticket colour updated.', 'event': serialize_admin_event(ticket_type.event)})


@api_view(['POST'])
@csrf_exempt
def delete_ticket_type(request, ticket_type_id: int):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    ticket_type = TicketType.objects.select_related('event').filter(id=ticket_type_id).first()
    if ticket_type is None:
        return Response({'error': 'Ticket type not found.'}, status=status.HTTP_404_NOT_FOUND)
    if ticket_type.reservations.exists():
        return Response({'error': 'This ticket type has already been sold, so it cannot be removed.'}, status=status.HTTP_400_BAD_REQUEST)

    event = ticket_type.event
    ticket_type.delete()
    return Response({'message': 'Ticket type removed.', 'event': serialize_admin_event(event)})


@api_view(['POST'])
@csrf_exempt
def regenerate_scanner_link(request, event_id: int):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    event = Event.objects.filter(id=event_id).first()
    if event is None:
        return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

    event.scanner_token = uuid.uuid4().hex
    event.save(update_fields=['scanner_token'])
    return Response({'message': 'New scanner link created. The old link no longer works.', 'event': serialize_admin_event(event)})


@api_view(['GET'])
def admin_dashboard(request):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)

    paid_reservations = Reservation.objects.filter(status__in=PAID_STATUSES)
    paid_ticket_set = Ticket.objects.filter(reservation__status__in=PAID_STATUSES)
    event = live_event()
    recent_sales = paid_reservations.select_related('event', 'ticket_type_ref').prefetch_related('tickets').order_by('-created_at')[:8]
    events = Event.objects.order_by('-created_at')

    return Response({
        'event': serialize_admin_event(event) if event else serialize_event(None),
        'summary': {
            'revenue': format_ugx(paid_reservations.aggregate(total=Sum('total_amount'))['total'] or 0),
            'ticketsSold': paid_ticket_set.count(),
            'paidOrders': paid_reservations.count(),
            'pendingOrders': Reservation.objects.filter(status='pending').count(),
            'checkedIn': paid_ticket_set.filter(checked_in_at__isnull=False).count(),
            'capacity': event.capacity if event else 200,
            'liveTicketsSold': paid_tickets(event).count() if event else 0,
        },
        'revenueByEvent': [
            {
                'id': item.id,
                'title': item.title,
                'isActive': item.is_active,
                'revenue': format_ugx(item.reservations.filter(status__in=PAID_STATUSES).aggregate(total=Sum('total_amount'))['total'] or 0),
                'ticketsSold': paid_tickets(item).count(),
            }
            for item in events
        ],
        'recentSales': [serialize_guest_order(reservation) for reservation in recent_sales],
    })


@api_view(['GET'])
def admin_guests(request):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)

    reservations = Reservation.objects.filter(status__in=PAID_STATUSES).select_related('event', 'ticket_type_ref').prefetch_related('tickets')
    event_id = request.query_params.get('event')
    if event_id:
        reservations = reservations.filter(event_id=event_id)
    orders = [serialize_guest_order(reservation) for reservation in reservations.order_by('-created_at')]

    return Response({
        'orders': orders,
        'totals': {
            'orders': len(orders),
            'tickets': sum(order['quantity'] for order in orders),
            'checkedIn': sum(order['checkedIn'] for order in orders),
            'amountPaid': format_ugx(sum(order['amountValue'] for order in orders)),
        },
    })


@api_view(['POST'])
@csrf_exempt
def validate_ticket_scan(request):
    if not authenticated_admin(request):
        return Response(ADMIN_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
    http_status, body = check_in_ticket(request.data.get('ticketCode') or '', commit=bool(request.data.get('checkIn')))
    return Response(body, status=http_status)


def _scanner_event(token: str) -> Event | None:
    return Event.objects.filter(scanner_token=token).first() if token else None


def _scanner_summary(event: Event) -> dict[str, Any]:
    tickets = paid_tickets(event)
    return {
        'title': event.title,
        'date': format_event_date(event.date),
        'time': format_event_time(event.time),
        'venue': event.venue,
        'ticketsSold': tickets.count(),
        'checkedIn': tickets.filter(checked_in_at__isnull=False).count(),
    }


@api_view(['GET'])
def scanner_event(request, token: str):
    event = _scanner_event(token)
    if event is None:
        return Response({'error': 'This scanner link is invalid or has been replaced.'}, status=status.HTTP_404_NOT_FOUND)
    return Response({'event': _scanner_summary(event)})


@api_view(['POST'])
@csrf_exempt
def scanner_check_in(request, token: str):
    """Door-staff check-in: the secret link itself is the credential, limited to one event."""
    event = _scanner_event(token)
    if event is None:
        return Response({'error': 'This scanner link is invalid or has been replaced.'}, status=status.HTTP_404_NOT_FOUND)
    http_status, body = check_in_ticket(request.data.get('code') or '', event=event)
    body['event'] = _scanner_summary(event)
    return Response(body, status=http_status)


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

    if reservation.status in PAID_STATUSES:
        return Response({'error': 'This reservation has already been paid for.'}, status=status.HTTP_400_BAD_REQUEST)

    gateway = (request.data.get('paymentMethod') or request.data.get('gateway') or reservation.payment_method).strip()
    phone_number = normalize_phone_number((request.data.get('phoneNumber') or request.data.get('paymentPhone') or '').strip())
    full_name = reservation.full_name
    ticket_type = f'{reservation.ticket_type_ref.name if reservation.ticket_type_ref else reservation.ticket_type} x {reservation.quantity}'
    # The amount always comes from the stored order, never from the client.
    amount = reservation.total_amount or None

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
    # Tickets always go to the email the member signed up with.
    email = member.email
    phone = (request.data.get('phone') or '').strip()
    payment_method = (request.data.get('paymentMethod') or request.data.get('gateway') or 'MTN Mobile Money').strip()
    payment_phone = (request.data.get('paymentPhone') or '').strip()

    if not full_name or not phone or not email:
        return Response({'error': 'Full name, phone number and email are required.'}, status=status.HTTP_400_BAD_REQUEST)

    event = live_event()
    if event is None:
        return Response({'error': 'Ticket sales are not open yet.'}, status=status.HTTP_400_BAD_REQUEST)

    ticket_type = event.ticket_types.filter(id=parse_amount(request.data.get('ticketTypeId')) or 0).first()
    if ticket_type is None:
        return Response({'error': 'Please select a valid ticket type.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        quantity = int(request.data.get('quantity') or 1)
    except (TypeError, ValueError):
        quantity = 0
    if not 1 <= quantity <= MAX_TICKETS_PER_ORDER:
        return Response({'error': f'You can reserve between 1 and {MAX_TICKETS_PER_ORDER} tickets at a time.'}, status=status.HTTP_400_BAD_REQUEST)

    remaining = event.capacity - paid_tickets(event).count()
    if quantity > remaining:
        message = 'This event is sold out.' if remaining <= 0 else f'Only {remaining} ticket{"s" if remaining != 1 else ""} left.'
        return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)

    guest_names = request.data.get('guestNames')
    guest_names = [str(name or '').strip() for name in guest_names] if isinstance(guest_names, list) else []
    guest_names = (guest_names + [''] * quantity)[:quantity]
    guest_names[0] = guest_names[0] or full_name
    if not all(guest_names):
        return Response({'error': 'Enter a guest name for every ticket.'}, status=status.HTTP_400_BAD_REQUEST)

    if payment_method not in {'MTN Mobile Money', 'Airtel Money'}:
        payment_method = 'MTN Mobile Money'

    with transaction.atomic():
        codes = [generate_ticket_code(ticket_type.code_prefix) for _ in guest_names]
        payloads = [build_ticket_qr(event, ticket_type.name, name, code) for name, code in zip(guest_names, codes)]
        reservation = Reservation.objects.create(
            member=member,
            event=event,
            ticket_type_ref=ticket_type,
            quantity=quantity,
            unit_price=ticket_type.price,
            total_amount=ticket_type.price * quantity,
            full_name=full_name,
            email=email,
            phone=phone,
            ticket_type=f'{ticket_type.name} — {format_ugx(ticket_type.price)}',
            ticket_code=codes[0],
            qr_payload=payloads[0],
            payment_method=payment_method,
            payment_phone=payment_phone,
            status='pending',
        )
        Ticket.objects.bulk_create([
            Ticket(reservation=reservation, guest_name=name, ticket_code=code, qr_payload=payload)
            for name, code, payload in zip(guest_names, codes, payloads)
        ])

    return Response({
        'message': 'Reservation created. Complete your payment to receive your tickets by email.',
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

    if reservation.status not in PAID_STATUSES:
        return Response({'error': 'Your ticket is emailed after payment is confirmed.'}, status=status.HTTP_400_BAD_REQUEST)

    reservation.ticket_email_sent = False
    reservation.save(update_fields=['ticket_email_sent'])
    email_sent = send_ticket_email(reservation)
    return Response({'emailSent': email_sent, 'reservation': serialize_reservation(reservation)}, status=status.HTTP_200_OK if email_sent else status.HTTP_503_SERVICE_UNAVAILABLE)


