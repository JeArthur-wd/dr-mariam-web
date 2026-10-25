from __future__ import annotations

import uuid

from django.db import models


DEFAULT_TICKET_COLOR = '#b82b6c'


def generate_member_token() -> str:
    return uuid.uuid4().hex


def generate_scanner_token() -> str:
    return uuid.uuid4().hex


def build_code_prefix(event_title: str, ticket_name: str) -> str:
    """Derive a readable ticket-code prefix, e.g. 'Singles to Mingle 2026' + 'Early Bird' -> 'STM26-EB'."""
    def initials(text: str) -> str:
        return ''.join(word[0] for word in text.split() if word[0].isalpha()).upper()

    year = next((word for word in event_title.split() if word.isdigit() and len(word) == 4), '')
    event_part = (initials(event_title)[:4] or 'EVT') + year[-2:]
    ticket_part = initials(ticket_name)[:3] or 'GEN'
    return f'{event_part}-{ticket_part}'


class Member(models.Model):
    full_name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    auth_token = models.CharField(max_length=64, unique=True, default=generate_member_token)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.email


class AdminAccount(models.Model):
    full_name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    auth_token = models.CharField(max_length=64, unique=True, default=generate_member_token)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.email


class Event(models.Model):
    title = models.CharField(max_length=200, default='Singles to Mingle 2026')
    date = models.CharField(max_length=100, default='27 November 2026')
    venue = models.CharField(max_length=200, default='Sheraton Hotel')
    time = models.CharField(max_length=100, default='4:30 PM')
    dress_code = models.CharField(max_length=200, default='Black, Red, White & Pink')
    capacity = models.PositiveIntegerField(default=200)
    early_ticket_label = models.CharField(max_length=100, default='Early Bird')
    early_ticket_price = models.CharField(max_length=50, default='UGX 150,000')
    late_ticket_label = models.CharField(max_length=100, default='Late Ticket')
    late_ticket_price = models.CharField(max_length=50, default='UGX 200,000')
    image = models.FileField(upload_to='events/', blank=True, default='')
    scanner_token = models.CharField(max_length=64, unique=True, default=generate_scanner_token)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.title


class TicketType(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='ticket_types')
    name = models.CharField(max_length=100)
    price = models.PositiveIntegerField()
    code_prefix = models.CharField(max_length=24)
    highlight = models.BooleanField(default=False)
    color = models.CharField(max_length=7, default=DEFAULT_TICKET_COLOR)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self) -> str:
        return f'{self.event.title} - {self.name}'


class Reservation(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('confirmed', 'Confirmed'),
        ('checked_in', 'Checked In'),
        ('failed', 'Failed'),
    ]

    member = models.ForeignKey(Member, on_delete=models.SET_NULL, related_name='reservations', null=True, blank=True)
    event = models.ForeignKey(Event, on_delete=models.SET_NULL, related_name='reservations', null=True, blank=True)
    ticket_type_ref = models.ForeignKey(TicketType, on_delete=models.SET_NULL, related_name='reservations', null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.PositiveIntegerField(default=0)
    total_amount = models.PositiveIntegerField(default=0)
    full_name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254, default='')
    phone = models.CharField(max_length=50)
    ticket_type = models.CharField(max_length=200)
    ticket_code = models.CharField(max_length=64, unique=True, blank=True, default='')
    qr_payload = models.TextField(default='')
    payment_method = models.CharField(max_length=100, default='MTN Mobile Money')
    payment_phone = models.CharField(max_length=50, blank=True, default='')
    payment_reference = models.CharField(max_length=64, unique=True, blank=True, null=True, default=None)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    ticket_email_sent = models.BooleanField(default=False)
    ticket_email_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.full_name} - {self.ticket_type}'


class Ticket(models.Model):
    """One admission per guest; a reservation can hold several."""

    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='tickets')
    guest_name = models.CharField(max_length=200)
    ticket_code = models.CharField(max_length=64, unique=True)
    qr_payload = models.TextField(default='')
    checked_in_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self) -> str:
        return f'{self.guest_name} - {self.ticket_code}'
