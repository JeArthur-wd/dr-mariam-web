from __future__ import annotations

import uuid

from django.db import models


def generate_member_token() -> str:
    return uuid.uuid4().hex


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
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.title


class Reservation(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('confirmed', 'Confirmed'),
        ('checked_in', 'Checked In'),
        ('failed', 'Failed'),
    ]

    member = models.ForeignKey(Member, on_delete=models.SET_NULL, related_name='reservations', null=True, blank=True)
    full_name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254, default='')
    phone = models.CharField(max_length=50)
    ticket_type = models.CharField(max_length=200)
    ticket_code = models.CharField(max_length=64, unique=True, blank=True, default='')
    qr_payload = models.TextField(default='')
    payment_method = models.CharField(max_length=100, default='MTN Mobile Money')
    payment_phone = models.CharField(max_length=50, blank=True, default='')
    payment_reference = models.CharField(max_length=64, unique=True, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    ticket_email_sent = models.BooleanField(default=False)
    ticket_email_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.full_name} - {self.ticket_type}'
