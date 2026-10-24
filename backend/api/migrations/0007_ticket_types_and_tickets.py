import uuid

import django.db.models.deletion
from django.db import migrations, models

import api.models


def _initials(text):
    return ''.join(word[0] for word in text.split() if word[0].isalpha()).upper()


def _code_prefix(event_title, ticket_name):
    year = next((word for word in event_title.split() if word.isdigit() and len(word) == 4), '')
    return f"{(_initials(event_title)[:4] or 'EVT') + year[-2:]}-{_initials(ticket_name)[:3] or 'GEN'}"


def _amount(price_text):
    digits = ''.join(character for character in price_text if character.isdigit())
    return int(digits) if digits else 0


def forwards(apps, schema_editor):
    Event = apps.get_model('api', 'Event')
    TicketType = apps.get_model('api', 'TicketType')
    Reservation = apps.get_model('api', 'Reservation')
    Ticket = apps.get_model('api', 'Ticket')

    Reservation.objects.filter(payment_reference='').update(payment_reference=None)

    for event in Event.objects.all():
        event.scanner_token = uuid.uuid4().hex
        event.save(update_fields=['scanner_token'])
        for label, price, highlight in (
            (event.early_ticket_label, event.early_ticket_price, True),
            (event.late_ticket_label, event.late_ticket_price, False),
        ):
            TicketType.objects.create(
                event=event,
                name=label,
                price=_amount(price),
                code_prefix=_code_prefix(event.title, label),
                highlight=highlight,
            )

    # Existing reservations predate per-event links; attach them to the event that was live.
    live_event = Event.objects.filter(is_active=True).order_by('-created_at').first() or Event.objects.order_by('-created_at').first()
    for reservation in Reservation.objects.all():
        label = reservation.ticket_type.split('—')[0].strip()
        amount = _amount(reservation.ticket_type.split('—')[1]) if '—' in reservation.ticket_type else 0
        reservation.event = live_event
        if live_event is not None:
            reservation.ticket_type_ref = TicketType.objects.filter(event=live_event, name=label).first()
        reservation.quantity = 1
        reservation.unit_price = amount
        reservation.total_amount = amount
        reservation.save(update_fields=['event', 'ticket_type_ref', 'quantity', 'unit_price', 'total_amount'])

        if reservation.ticket_code:
            Ticket.objects.create(
                reservation=reservation,
                guest_name=reservation.full_name,
                ticket_code=reservation.ticket_code,
                qr_payload=reservation.qr_payload,
                checked_in_at=reservation.created_at if reservation.status == 'checked_in' else None,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_alter_reservation_status'),
    ]

    operations = [
        # An empty string counted as a value for the unique constraint, so a second unpaid reservation failed.
        migrations.AlterField(
            model_name='reservation',
            name='payment_reference',
            field=models.CharField(blank=True, default=None, max_length=64, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='event',
            name='scanner_token',
            field=models.CharField(default='', max_length=64),
        ),
        migrations.CreateModel(
            name='TicketType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('price', models.PositiveIntegerField()),
                ('code_prefix', models.CharField(max_length=24)),
                ('highlight', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ticket_types', to='api.event')),
            ],
            options={'ordering': ['created_at', 'id']},
        ),
        migrations.AddField(
            model_name='reservation',
            name='event',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reservations', to='api.event'),
        ),
        migrations.AddField(
            model_name='reservation',
            name='ticket_type_ref',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reservations', to='api.tickettype'),
        ),
        migrations.AddField(
            model_name='reservation',
            name='quantity',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='reservation',
            name='unit_price',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='reservation',
            name='total_amount',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name='Ticket',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('guest_name', models.CharField(max_length=200)),
                ('ticket_code', models.CharField(max_length=64, unique=True)),
                ('qr_payload', models.TextField(default='')),
                ('checked_in_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reservation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tickets', to='api.reservation')),
            ],
            options={'ordering': ['created_at', 'id']},
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='event',
            name='scanner_token',
            field=models.CharField(default=api.models.generate_scanner_token, max_length=64, unique=True),
        ),
    ]
