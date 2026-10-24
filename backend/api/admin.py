from django.contrib import admin

from .models import AdminAccount, Event, Member, Reservation, Ticket, TicketType


@admin.register(AdminAccount)
class AdminAccountAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'is_active', 'created_at')
    search_fields = ('email', 'full_name')
    list_filter = ('is_active', 'created_at')
    readonly_fields = ('auth_token', 'created_at')


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'created_at')
    search_fields = ('email', 'full_name')
    list_filter = ('created_at',)


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('title', 'date', 'venue', 'is_active', 'created_at')
    search_fields = ('title', 'venue', 'date')
    list_filter = ('is_active', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'email_display', 'ticket_type', 'payment_method', 'status', 'ticket_email_sent', 'created_at')
    search_fields = ('full_name', 'phone', 'ticket_type', 'ticket_code', 'payment_reference')
    list_filter = ('status', 'payment_method', 'created_at')
    readonly_fields = ('ticket_code', 'qr_payload', 'payment_reference', 'ticket_email_sent_at', 'created_at')

    @admin.display(description='Email')
    def email_display(self, obj):
        return obj.member.email if obj.member else 'N/A'



@admin.register(TicketType)
class TicketTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'event', 'price', 'code_prefix', 'highlight')
    list_filter = ('event',)


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ('guest_name', 'ticket_code', 'reservation', 'checked_in_at')
    search_fields = ('guest_name', 'ticket_code')
    readonly_fields = ('ticket_code', 'qr_payload', 'created_at')
