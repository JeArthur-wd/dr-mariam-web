import json

from django.core import mail
from django.test import TestCase, override_settings

from .models import AdminAccount, Event, Reservation, Ticket, TicketType, build_code_prefix


def post_json(client, path, payload, **headers):
    return client.post(path, data=json.dumps(payload), content_type='application/json', **headers)


def create_member_token(client, email='guest@example.com', full_name='Event Guest'):
    response = post_json(client, '/api/auth/signup/', {'fullName': full_name, 'email': email, 'password': 'secure-password'})
    return response.json()['user']['token']


def create_admin_headers(client):
    response = post_json(client, '/api/admin/auth/signup/', {
        'fullName': 'Site Administrator',
        'email': 'admin@example.com',
        'password': 'admin-password',
    })
    return {'HTTP_AUTHORIZATION': f"Token {response.json()['admin']['token']}"}


def create_live_event(capacity=200):
    event = Event.objects.create(
        title='Singles to Mingle 2026',
        date='2026-11-27',
        time='16:30',
        venue='Sheraton Hotel',
        dress_code='Black, Red, White & Pink',
        capacity=capacity,
        is_active=True,
    )
    early = TicketType.objects.create(event=event, name='Early Bird', price=150000, code_prefix=build_code_prefix(event.title, 'Early Bird'), highlight=True)
    late = TicketType.objects.create(event=event, name='Late Ticket', price=200000, code_prefix=build_code_prefix(event.title, 'Late Ticket'))
    return event, early, late


def reserve(client, token, ticket_type, quantity=1, guest_names=None):
    return post_json(client, '/api/event/reserve/', {
        'fullName': 'Event Guest',
        'phone': '+256 700 000 000',
        'email': 'eventguest@example.com',
        'ticketTypeId': ticket_type.id,
        'quantity': quantity,
        'guestNames': guest_names or ['Event Guest'],
        'paymentMethod': 'MTN Mobile Money',
    }, HTTP_AUTHORIZATION=f'Token {token}')


def mark_paid(reservation_id):
    reservation = Reservation.objects.get(id=reservation_id)
    reservation.status = 'paid'
    reservation.save(update_fields=['status'])
    return reservation


class MemberApiTests(TestCase):
    def test_member_can_sign_up_log_in_and_view_profile(self):
        create_member_token(self.client, 'jane@example.com', 'Jane Doe')
        login_response = post_json(self.client, '/api/auth/login/', {'email': 'jane@example.com', 'password': 'secure-password'})
        self.assertEqual(login_response.status_code, 200)
        token = login_response.json()['user']['token']
        self.assertNotIn('password', login_response.json()['user'])

        profile_response = self.client.get('/api/auth/me/', HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(profile_response.status_code, 200)
        self.assertEqual(profile_response.json()['user']['fullName'], 'Jane Doe')

    def test_duplicate_email_is_rejected(self):
        create_member_token(self.client, 'jane@example.com')
        response = post_json(self.client, '/api/auth/signup/', {'fullName': 'Another Jane', 'email': 'JANE@example.com', 'password': 'another-password'})
        self.assertEqual(response.status_code, 400)

    def test_logout_invalidates_the_member_token(self):
        token = create_member_token(self.client)
        self.client.post('/api/auth/logout/', HTTP_AUTHORIZATION=f'Token {token}')
        me_response = self.client.get('/api/auth/me/', HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(me_response.status_code, 401)


class ReservationTests(TestCase):
    def setUp(self):
        self.event, self.early, self.late = create_live_event(capacity=5)
        self.token = create_member_token(self.client)

    def test_event_details_list_ticket_types_with_readable_date(self):
        response = self.client.get('/api/event/details/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['date'], '27 November 2026')
        self.assertEqual(data['time'], '4:30 PM')
        self.assertEqual([option['label'] for option in data['ticketOptions']], ['Early Bird', 'Late Ticket'])
        self.assertEqual(data['ticketOptions'][1]['id'], self.late.id)

    def test_reserves_the_selected_ticket_type_with_one_ticket_per_guest(self):
        response = reserve(self.client, self.token, self.late, quantity=3, guest_names=['Event Guest', 'Amina K', 'Sarah N'])
        self.assertEqual(response.status_code, 201)
        reservation = Reservation.objects.get()
        self.assertEqual(reservation.ticket_type_ref, self.late)
        self.assertEqual(reservation.quantity, 3)
        self.assertEqual(reservation.total_amount, 600000)

        tickets = response.json()['reservation']['tickets']
        self.assertEqual([ticket['guestName'] for ticket in tickets], ['Event Guest', 'Amina K', 'Sarah N'])
        self.assertEqual(len({ticket['ticketCode'] for ticket in tickets}), 3)
        self.assertTrue(all(ticket['ticketCode'].startswith('STM26-LT-') for ticket in tickets))

        qr = json.loads(tickets[1]['qrPayload'])
        self.assertEqual(qr, {
            'event': 'Singles to Mingle 2026',
            'date': '27 November 2026',
            'ticketType': 'Late Ticket',
            'name': 'Amina K',
            'code': tickets[1]['ticketCode'],
        })

    def test_every_ticket_needs_a_guest_name(self):
        response = reserve(self.client, self.token, self.early, quantity=2, guest_names=['Event Guest', ' '])
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Reservation.objects.exists())

    def test_cannot_reserve_more_than_remaining_capacity(self):
        mark_paid(reserve(self.client, self.token, self.early, quantity=4, guest_names=['A', 'B', 'C', 'D']).json()['reservation']['id'])
        response = reserve(self.client, self.token, self.early, quantity=2, guest_names=['E', 'F'])
        self.assertEqual(response.status_code, 400)
        self.assertIn('Only 1 ticket left', response.json()['error'])

    def test_ticket_type_from_another_event_is_rejected(self):
        other_event = Event.objects.create(title='Other', date='2027-01-01', time='18:00', venue='Elsewhere', dress_code='Any', is_active=False)
        foreign_type = TicketType.objects.create(event=other_event, name='VIP', price=1, code_prefix='OTH-VIP')
        response = reserve(self.client, self.token, foreign_type)
        self.assertEqual(response.status_code, 400)

    def test_payment_requires_a_reservation(self):
        response = post_json(self.client, '/api/payments/initiate/', {
            'phoneNumber': '+256 700 000 000',
            'amount': '1',
            'paymentMethod': 'MTN Mobile Money',
        }, HTTP_AUTHORIZATION=f'Token {self.token}')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Create a reservation', response.json()['error'])

    @override_settings(PAYMENT_CALLBACK_SECRET='test-callback', EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_confirmed_payment_emails_every_ticket(self):
        reservation_id = reserve(self.client, self.token, self.early, quantity=2, guest_names=['Event Guest', 'Amina K']).json()['reservation']['id']
        Reservation.objects.filter(id=reservation_id).update(payment_reference='MTN-confirmed-payment')

        callback_response = post_json(self.client, '/api/payments/callback/', {'reference': 'MTN-confirmed-payment', 'status': 'SUCCESSFUL'}, HTTP_X_PAYMENT_CALLBACK_SECRET='test-callback')

        self.assertEqual(callback_response.status_code, 200)
        reservation = Reservation.objects.get(id=reservation_id)
        self.assertEqual(reservation.status, 'paid')
        self.assertEqual(len(mail.outbox), 1)
        for ticket in reservation.tickets.all():
            self.assertIn(ticket.ticket_code, mail.outbox[0].body)
        self.assertIn('UGX 300,000', mail.outbox[0].body)
        # Sent to the signup email, not the address typed at checkout, with one QR image per guest.
        self.assertEqual(mail.outbox[0].to, ['guest@example.com'])
        qr_images = [part for part in mail.outbox[0].attachments if getattr(part, 'get_content_type', lambda: '')() == 'image/png']
        self.assertEqual(len(qr_images), 2)
        self.assertIn('cid:ticket-1', mail.outbox[0].alternatives[0][0])

    def test_member_sees_their_own_orders_with_ticket_colour(self):
        self.early.color = '#123abc'
        self.early.save(update_fields=['color'])
        reserve(self.client, self.token, self.early, quantity=2, guest_names=['Event Guest', 'Amina K'])
        other_token = create_member_token(self.client, 'other@example.com')
        reserve(self.client, other_token, self.late)

        response = self.client.get('/api/auth/reservations/', HTTP_AUTHORIZATION=f'Token {self.token}')
        self.assertEqual(response.status_code, 200)
        orders = response.json()['reservations']
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]['ticketColor'], '#123abc')
        self.assertEqual(orders[0]['eventVenue'], 'Sheraton Hotel')
        self.assertEqual(len(orders[0]['tickets']), 2)
        self.assertEqual(self.client.get('/api/auth/reservations/').status_code, 401)


class AdminEventTests(TestCase):
    def setUp(self):
        self.headers = create_admin_headers(self.client)

    def create_event(self, **overrides):
        payload = {
            'title': 'Women Leadership Summit 2027',
            'date': '2027-02-14',
            'time': '17:00',
            'venue': 'Kampala International Convention Centre',
            'dressCode': 'Elegant Business',
            'capacity': 120,
        }
        payload.update(overrides)
        return post_json(self.client, '/api/admin/events/', payload, **self.headers)

    def test_admin_endpoints_require_authentication(self):
        for path in ('/api/admin/dashboard/', '/api/admin/events/', '/api/admin/guests/'):
            self.assertEqual(self.client.get(path).status_code, 401)

    def test_only_one_initial_admin_can_register(self):
        response = post_json(self.client, '/api/admin/auth/signup/', {'fullName': 'Second', 'email': 'second@example.com', 'password': 'admin-password'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(AdminAccount.objects.count(), 1)

    def test_event_requires_time_dress_code_venue_and_date(self):
        response = self.create_event(time='', dressCode='')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Time, Dress code are required.')

    def test_new_event_goes_live_then_gets_ticket_types_with_automatic_prefixes(self):
        event_id = self.create_event().json()['event']['id']
        response = post_json(self.client, f'/api/admin/events/{event_id}/ticket-types/', {'name': 'VIP Table', 'price': 'UGX 250,000', 'highlight': True}, **self.headers)
        self.assertEqual(response.status_code, 201)
        option = response.json()['event']['ticketOptions'][0]
        self.assertEqual(option['codePrefix'], 'WLS27-VT')
        self.assertEqual(option['amount'], 250000)

    def test_ticket_types_take_a_colour_that_can_be_changed(self):
        event_id = self.create_event().json()['event']['id']
        path = f'/api/admin/events/{event_id}/ticket-types/'
        self.assertEqual(post_json(self.client, path, {'name': 'VIP', 'price': 250000, 'color': 'red'}, **self.headers).status_code, 400)
        option = post_json(self.client, path, {'name': 'VIP', 'price': 250000, 'color': '#1F7A4D'}, **self.headers).json()['event']['ticketOptions'][0]
        self.assertEqual(option['color'], '#1f7a4d')

        response = post_json(self.client, f"/api/admin/ticket-types/{option['id']}/update/", {'color': '#222222'}, **self.headers)
        self.assertEqual(response.json()['event']['ticketOptions'][0]['color'], '#222222')

    def test_admin_can_upload_and_remove_an_event_image(self):
        import shutil
        import tempfile

        from django.core.files.uploadedfile import SimpleUploadedFile

        media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media_root, ignore_errors=True)
        with self.settings(MEDIA_ROOT=media_root):
            event_id = self.create_event().json()['event']['id']
            path = f'/api/admin/events/{event_id}/image/'
            bad = self.client.post(path, {'image': SimpleUploadedFile('notes.txt', b'hello', content_type='text/plain')}, **self.headers)
            self.assertEqual(bad.status_code, 400)

            image = SimpleUploadedFile('poster.png', b'\x89PNG\r\n\x1a\n' + b'0' * 64, content_type='image/png')
            response = self.client.post(path, {'image': image}, **self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()['event']['imageUrl'].startswith('/media/events/event-'))
            self.assertEqual(self.client.get('/api/event/details/').json()['imageUrl'], response.json()['event']['imageUrl'])

            removed = self.client.post(path, {'remove': 'true'}, **self.headers)
            self.assertIsNone(removed.json()['event']['imageUrl'])

        details = self.client.get('/api/event/details/').json()
        self.assertEqual(details['title'], 'Women Leadership Summit 2027')
        self.assertEqual(details['date'], '14 February 2027')
        self.assertEqual(details['time'], '5:00 PM')

    def test_admin_can_edit_and_delete_unsold_events(self):
        event_id = self.create_event().json()['event']['id']
        update_response = post_json(self.client, f'/api/admin/events/{event_id}/update/', {'title': 'Updated Summit', 'capacity': 150}, **self.headers)
        self.assertEqual(update_response.json()['event']['title'], 'Updated Summit')
        self.assertEqual(update_response.json()['event']['capacity'], 150)

        delete_response = post_json(self.client, f'/api/admin/events/{event_id}/delete/', {}, **self.headers)
        self.assertEqual(delete_response.json()['message'], 'Event deleted successfully.')

    def test_events_with_sales_cannot_be_deleted(self):
        event, early, _ = create_live_event()
        reserve(self.client, create_member_token(self.client), early)
        response = post_json(self.client, f'/api/admin/events/{event.id}/delete/', {}, **self.headers)
        self.assertEqual(response.status_code, 400)


class AdminReportingTests(TestCase):
    def setUp(self):
        self.headers = create_admin_headers(self.client)
        self.event, self.early, self.late = create_live_event()
        token = create_member_token(self.client)
        self.paid = mark_paid(reserve(self.client, token, self.late, quantity=2, guest_names=['Event Guest', 'Amina K']).json()['reservation']['id'])
        reserve(self.client, token, self.early)  # left pending: must not count

    def test_dashboard_revenue_comes_from_stored_paid_orders(self):
        # Changing a price afterwards must not rewrite what was already paid.
        TicketType.objects.filter(id=self.late.id).update(price=999)
        summary = self.client.get('/api/admin/dashboard/', **self.headers).json()['summary']
        self.assertEqual(summary['revenue'], 'UGX 400,000')
        self.assertEqual(summary['ticketsSold'], 2)
        self.assertEqual(summary['pendingOrders'], 1)
        self.assertNotIn('paidGuests', summary)

    def test_guests_page_lists_paid_orders_with_amount_and_tickets(self):
        data = self.client.get(f'/api/admin/guests/?event={self.event.id}', **self.headers).json()
        self.assertEqual(len(data['orders']), 1)
        order = data['orders'][0]
        self.assertEqual(order['quantity'], 2)
        self.assertEqual(order['amountPaid'], 'UGX 400,000')
        self.assertEqual([ticket['guestName'] for ticket in order['tickets']], ['Event Guest', 'Amina K'])
        self.assertEqual(data['totals']['tickets'], 2)


class ScannerTests(TestCase):
    def setUp(self):
        self.headers = create_admin_headers(self.client)
        self.event, self.early, _ = create_live_event()
        token = create_member_token(self.client)
        reservation_id = reserve(self.client, token, self.early, quantity=2, guest_names=['Event Guest', 'Amina K']).json()['reservation']['id']
        self.reservation = mark_paid(reservation_id)
        self.first, self.second = self.reservation.tickets.all()

    def scan(self, code, token=None):
        return post_json(self.client, f'/api/scanner/{token or self.event.scanner_token}/check-in/', {'code': code})

    def test_secret_link_checks_in_each_ticket_once_from_qr_content(self):
        response = self.scan(self.first.qr_payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['guest']['name'], 'Event Guest')
        self.assertEqual(response.json()['event']['checkedIn'], 1)

        repeat = self.scan(self.first.ticket_code)
        self.assertEqual(repeat.status_code, 409)
        self.assertEqual(repeat.json()['result'], 'already_checked_in')

        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, 'paid')
        self.scan(self.second.ticket_code)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, 'checked_in')

    def test_unpaid_and_foreign_tickets_are_refused(self):
        Reservation.objects.filter(id=self.reservation.id).update(status='pending')
        self.assertEqual(self.scan(self.first.ticket_code).json()['result'], 'unpaid')

        other_event = Event.objects.create(title='Other', date='2027-01-01', time='18:00', venue='Elsewhere', dress_code='Any', is_active=False)
        self.assertEqual(self.scan(self.first.ticket_code, token=other_event.scanner_token).json()['result'], 'wrong_event')

    def test_regenerated_link_revokes_the_old_one(self):
        old_token = self.event.scanner_token
        response = post_json(self.client, f'/api/admin/events/{self.event.id}/scanner-link/', {}, **self.headers)
        self.assertNotEqual(response.json()['event']['scannerToken'], old_token)
        self.assertEqual(self.client.get(f'/api/scanner/{old_token}/').status_code, 404)

    def test_admin_scanner_still_validates_without_checking_in(self):
        response = post_json(self.client, '/api/admin/scanner/validate/', {'ticketCode': self.first.ticket_code}, **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['guest']['status'], 'paid')
        self.assertIsNone(Ticket.objects.get(id=self.first.id).checked_in_at)
