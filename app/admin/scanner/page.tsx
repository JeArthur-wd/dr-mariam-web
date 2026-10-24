'use client'

import Link from 'next/link'
import { AdminShell } from '../../../components/admin-shell'
import { TicketScanner } from '../../../components/ticket-scanner'
import { checkInAsAdmin } from '../../../lib/user-auth'

export default function AdminScannerPage() {
  return (
    <AdminShell title="Check-in">
      <p className="form-hint scanner-intro">
        Scans tickets for any event. For door staff without an admin account, copy an event’s check-in link from <Link href="/admin/events">Events</Link>.
      </p>
      <TicketScanner onScan={checkInAsAdmin} />
    </AdminShell>
  )
}
