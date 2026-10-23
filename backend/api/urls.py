from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('auth/signup/', views.signup_member, name='signup_member'),
    path('auth/login/', views.login_member, name='login_member'),
    path('auth/me/', views.get_current_member, name='get_current_member'),
    path('auth/logout/', views.logout_member, name='logout_member'),
    path('admin/auth/signup/', views.signup_admin, name='signup_admin'),
    path('admin/auth/login/', views.login_admin, name='login_admin'),
    path('admin/auth/logout/', views.logout_admin, name='logout_admin'),
    path('event/details/', views.event_details, name='event_details'),
    path('event/reserve/', views.reserve_ticket, name='reserve_ticket'),
    path('event/reservations/<int:reservation_id>/', views.reservation_status, name='reservation_status'),
    path('event/reservations/<int:reservation_id>/send-ticket/', views.resend_ticket_email, name='resend_ticket_email'),
    path('admin/events/', views.create_event, name='create_event'),
    path('admin/events/<int:event_id>/update/', views.update_event, name='update_event'),
    path('admin/events/<int:event_id>/delete/', views.delete_event, name='delete_event'),
    path('admin/dashboard/', views.admin_dashboard, name='admin_dashboard'),
    path('admin/scanner/validate/', views.validate_ticket_scan, name='validate_ticket_scan'),
    path('payments/initiate/', views.initiate_payment, name='initiate_payment'),
    path('payments/callback/', views.payment_callback, name='payment_callback'),
]
