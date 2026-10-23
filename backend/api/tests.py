import json

from django.core import mail
from django.test import TestCase, override_settings

from .models import AdminAccount, Reservation


class MemberApiTests(TestCase):
    def post_json(self, path, payload, **headers):
        return self.client.post(path, data=json.dumps(payload), content_type='application/json', **headers)

    def create_member(self):
        response = self.post_json('/api/auth/signup/', {
            'fullName': 'Jane Doe',
            'email': 'jane@example.com',
            'password': 'secure-password',
        })
        self.assertEqual(response.status_code, 201)
        return response.json()['user']

    def test_member_can_sign_up_log_in_and_view_profile(self):
        member = self.create_member()
        self.assertEqual(member['fullName'], 'Jane Doe')
        self.assertNotIn('password', member)

        login_response = self.post_json('/api/auth/login/', {
            'email': 'jane@example.com',
            'password': 'secure-password',
        })
        self.assertEqual(login_response.status_code, 200)
        token = login_response.json()['user']['token']

        profile_response = self.client.get('/api/auth/me/', HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(profile_response.status_code, 200)
        self.assertEqual(profile_response.json()['user']['email'], 'jane@example.com')

    def test_duplicate_email_is_rejected(self):
        self.create_member()
        response = self.post_json('/api/auth/signup/', {
            'fullName': 'Another Jane',
            'email': 'JANE@example.com',
            'password': 'another-password',
        })
        self.assertEqual(response.status_code, 400)


class EventApiTests(TestCase):
    def post_json(self, path, payload, **headers):
        return self.client.post(path, data=json.dumps(payload), content_type='application/json', **headers)

    def authenticated_token(self):
        response = self.post_json('/api/auth/signup/', {
            'fullName': 'Event Guest',
            'email': 'guest@example.com',
            'password': 'secure-password',
        })
        return response.json()['user']['token']

    def test_event_details_are_available_without_login(self):
        response = self.client.get('/api/event/details/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['title'], 'Singles to Mingle 2026')
        self.assertEqual(len(response.json()['ticketOptions']), 2)

    def test_authenticated_member_can_reserve_ticket(self):
        token = self.authenticated_token()
        response = self.post_json('/api/event/reserve/', {
            'fullName': 'Event Guest',
            'phone': '+256 700 000 000',
            'email': 'eventguest@example.com',
            'ticketType': 'Early Bird — UGX 150,000',
            'paymentMethod': 'MTN Mobile Money',
            'paymentPhone': '+256 700 000 000',
        }, HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['reservation']['status'], 'pending')
        self.assertEqual(Reservation.objects.count(), 1)
        self.assertEqual(Reservation.objects.first().email, 'eventguest@example.com')
        self.assertTrue(response.json()['reservation']['ticket']['ticketCode'])
        self.assertIn('eventguest@example.com', response.json()['reservation']['ticket']['qrPayload'])

    def test_payment_rejects_tampered_ticket_type(self):
        token = self.authenticated_token()
        response = self.post_json('/api/payments/initiate/', {
            'fullName': 'Event Guest',
            'phoneNumber': '+256 700 000 000',
            'ticketType': 'Early Bird — UGX 1',
            'amount': '1',
            'paymentMethod': 'MTN Mobile Money',
        }, HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Create a reservation', response.json()['error'])

    @override_settings(
        PAYMENT_CALLBACK_SECRET='test-callback',
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    )
    def test_confirmed_payment_sends_ticket_email(self):
        token = self.authenticated_token()
        reservation_response = self.post_json('/api/event/reserve/', {
            'fullName': 'Event Guest',
            'phone': '+256 700 000 000',
            'email': 'eventguest@example.com',
            'ticketType': 'Early Bird — UGX 150,000',
            'paymentMethod': 'MTN Mobile Money',
            'paymentPhone': '+256 700 000 000',
        }, HTTP_AUTHORIZATION=f'Token {token}')
        reservation = Reservation.objects.get(id=reservation_response.json()['reservation']['id'])
        reservation.payment_reference = 'MTN-confirmed-payment'
        reservation.save(update_fields=['payment_reference'])

        callback_response = self.post_json('/api/payments/callback/', {
            'reference': 'MTN-confirmed-payment',
            'status': 'SUCCESSFUL',
        }, HTTP_X_PAYMENT_CALLBACK_SECRET='test-callback')

        self.assertEqual(callback_response.status_code, 200)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, 'paid')
        self.assertTrue(reservation.ticket_email_sent)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(reservation.ticket_code, mail.outbox[0].body)


class AdminApiTests(TestCase):
    def post_json(self, path, payload, **headers):
        return self.client.post(path, data=json.dumps(payload), content_type='application/json', **headers)

    def create_admin(self):
        response = self.post_json('/api/admin/auth/signup/', {
            'fullName': 'Site Administrator',
            'email': 'admin@example.com',
            'password': 'admin-password',
        })
        self.assertEqual(response.status_code, 201)
        return response.json()['admin']['token']

    def test_dashboard_requires_admin_authentication(self):
        response = self.client.get('/api/admin/dashboard/')
        self.assertEqual(response.status_code, 401)

    def test_authenticated_admin_receives_database_dashboard_data(self):
        token = self.create_admin()
        member_response = self.post_json('/api/auth/signup/', {
            'fullName': 'Dashboard Guest',
            'email': 'guest@example.com',
            'password': 'secure-password',
        })
        member_token = member_response.json()['user']['token']
        reservation_response = self.post_json('/api/event/reserve/', {
            'fullName': 'Dashboard Guest',
            'email': 'guest@example.com',
            'phone': '+256 700 000 000',
            'ticketType': 'Early Bird — UGX 150,000',
            'paymentMethod': 'MTN Mobile Money',
        }, HTTP_AUTHORIZATION=f'Token {member_token}')
        reservation = Reservation.objects.get(id=reservation_response.json()['reservation']['id'])
        reservation.status = 'paid'
        reservation.save(update_fields=['status'])

        dashboard_response = self.client.get('/api/admin/dashboard/', HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(dashboard_response.status_code, 200)
        dashboard = dashboard_response.json()
        self.assertEqual(dashboard['summary']['paidGuests'], 1)
        self.assertEqual(dashboard['summary']['revenue'], 'UGX 150,000')
        self.assertEqual(dashboard['attendees'][0]['email'], 'guest@example.com')

    def test_only_one_initial_admin_can_register(self):
        self.create_admin()
        response = self.post_json('/api/admin/auth/signup/', {
            'fullName': 'Second Admin',
            'email': 'second@example.com',
            'password': 'admin-password',
        })
        self.assertEqual(response.status_code, 403)
        self.assertEqual(AdminAccount.objects.count(), 1)


class AdminDashboardTests(TestCase):
    def post_json(self, path, payload, **headers):
        return self.client.post(path, data=json.dumps(payload), content_type='application/json', **headers)

    def admin_headers(self):
        response = self.post_json('/api/admin/auth/signup/', {
            'fullName': 'Dashboard Administrator',
            'email': 'dashboard-admin@example.com',
            'password': 'admin-password',
        })
        self.assertEqual(response.status_code, 201)
        return {'HTTP_AUTHORIZATION': f"Token {response.json()['admin']['token']}"}

    def test_admin_can_create_event_and_fetch_dashboard_summary(self):
        headers = self.admin_headers()
        response = self.post_json('/api/admin/events/', {
            'title': 'Women Leadership Summit 2027',
            'date': '2027-02-14',
            'venue': 'Kampala International Convention Centre',
            'time': '5:00 PM',
            'dressCode': 'Elegant Business',
            'capacity': 120,
            'ticketTypes': [
                {'name': 'VIP', 'price': 'UGX 250,000'},
                {'name': 'Premium', 'price': 'UGX 180,000'},
            ],
        }, **headers)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['event']['title'], 'Women Leadership Summit 2027')

        dashboard_response = self.client.get('/api/admin/dashboard/', **headers)
        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(dashboard_response.json()['event']['title'], 'Women Leadership Summit 2027')
        self.assertEqual(dashboard_response.json()['summary']['capacity'], 120)

    def test_ticket_validation_returns_paid_guest_details(self):
        headers = self.admin_headers()
        member_response = self.post_json('/api/auth/signup/', {
            'fullName': 'Alice Guest',
            'email': 'alice@example.com',
            'password': 'secure-password',
        })
        token = member_response.json()['user']['token']

        reservation_response = self.post_json('/api/event/reserve/', {
            'fullName': 'Alice Guest',
            'phone': '+256 700 000 000',
            'email': 'alice@example.com',
            'ticketType': 'Early Bird — UGX 150,000',
            'paymentMethod': 'MTN Mobile Money',
            'paymentPhone': '+256 700 000 000',
        }, HTTP_AUTHORIZATION=f'Token {token}')

        reservation = Reservation.objects.get(id=reservation_response.json()['reservation']['id'])
        reservation.status = 'paid'
        reservation.save(update_fields=['status'])

        validation_response = self.post_json('/api/admin/scanner/validate/', {
            'ticketCode': reservation.ticket_code,
        }, **headers)

        self.assertEqual(validation_response.status_code, 200)
        self.assertEqual(validation_response.json()['guest']['name'], 'Alice Guest')
        self.assertEqual(validation_response.json()['guest']['status'], 'paid')

    def test_admin_can_edit_and_delete_events(self):
        headers = self.admin_headers()
        create_response = self.post_json('/api/admin/events/', {
            'title': 'Women Leadership Summit 2027',
            'date': '2027-02-14',
            'venue': 'Kampala International Convention Centre',
            'time': '5:00 PM',
            'dressCode': 'Elegant Business',
            'capacity': 120,
            'ticketTypes': [
                {'name': 'VIP', 'price': 'UGX 250,000'},
                {'name': 'Premium', 'price': 'UGX 180,000'},
            ],
        }, **headers)
        event_id = create_response.json()['event']['id']

        update_response = self.post_json(f'/api/admin/events/{event_id}/update/', {
            'title': 'Updated Leadership Summit',
            'venue': 'Pearl Africa Hotel',
            'capacity': 150,
        }, **headers)
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()['event']['title'], 'Updated Leadership Summit')
        self.assertEqual(update_response.json()['event']['capacity'], 150)

        delete_response = self.post_json(f'/api/admin/events/{event_id}/delete/', {}, **headers)
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.json()['message'], 'Event deleted successfully.')

    def test_ticket_validation_marks_guest_checked_in(self):
        headers = self.admin_headers()
        member_response = self.post_json('/api/auth/signup/', {
            'fullName': 'Bob Guest',
            'email': 'bob@example.com',
            'password': 'secure-password',
        })
        token = member_response.json()['user']['token']

        reservation_response = self.post_json('/api/event/reserve/', {
            'fullName': 'Bob Guest',
            'phone': '+256 700 000 001',
            'email': 'bob@example.com',
            'ticketType': 'Early Bird — UGX 150,000',
            'paymentMethod': 'MTN Mobile Money',
            'paymentPhone': '+256 700 000 001',
        }, HTTP_AUTHORIZATION=f'Token {token}')

        reservation = Reservation.objects.get(id=reservation_response.json()['reservation']['id'])
        reservation.status = 'paid'
        reservation.save(update_fields=['status'])

        validation_response = self.post_json('/api/admin/scanner/validate/', {
            'ticketCode': reservation.ticket_code,
            'checkIn': True,
        }, **headers)

        self.assertEqual(validation_response.status_code, 200)
        self.assertEqual(validation_response.json()['guest']['status'], 'checked_in')
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, 'checked_in')


class MemberAuthTests(TestCase):
    def test_signup_and_login_work_for_member_accounts(self):
        signup_response = self.client.post(
            '/api/auth/signup/',
            {'fullName': 'Jane Doe', 'email': 'jane@example.com', 'password': 'secret123'},
            content_type='application/json',
        )

        self.assertEqual(signup_response.status_code, 201)
        signup_data = signup_response.json()
        self.assertEqual(signup_data['user']['email'], 'jane@example.com')
        self.assertTrue(signup_data['user']['token'])

        login_response = self.client.post(
            '/api/auth/login/',
            {'email': 'jane@example.com', 'password': 'secret123'},
            content_type='application/json',
        )

        self.assertEqual(login_response.status_code, 200)
        login_data = login_response.json()
        self.assertEqual(login_data['user']['email'], 'jane@example.com')
        self.assertTrue(login_data['user']['token'])

        me_response = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f"Token {login_data['user']['token']}",
        )

        self.assertEqual(me_response.status_code, 200)
        me_data = me_response.json()
        self.assertEqual(me_data['user']['email'], 'jane@example.com')
        self.assertEqual(me_data['user']['fullName'], 'Jane Doe')

    def test_logout_invalidates_the_member_token(self):
        signup_response = self.client.post(
            '/api/auth/signup/',
            {'fullName': 'John Smith', 'email': 'john@example.com', 'password': 'secret123'},
            content_type='application/json',
        )

        self.assertEqual(signup_response.status_code, 201)
        token = signup_response.json()['user']['token']

        logout_response = self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token}',
        )

        self.assertEqual(logout_response.status_code, 200)

        me_response = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {token}',
        )

        self.assertEqual(me_response.status_code, 401)
        self.assertEqual(me_response.json()['error'], 'Invalid session.')
