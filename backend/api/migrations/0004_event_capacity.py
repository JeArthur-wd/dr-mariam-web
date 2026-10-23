from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0003_reservation_payment_reference_and_ticket_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='capacity',
            field=models.PositiveIntegerField(default=200),
        ),
    ]
