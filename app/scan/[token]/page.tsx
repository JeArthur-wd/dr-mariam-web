'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, MapPin, ShieldAlert } from 'lucide-react'
import { TicketScanner } from '../../../components/ticket-scanner'
import { checkInWithScannerLink, fetchScannerEvent, type ScanEvent } from '../../../lib/user-auth'

export default function DoorScannerPage() {
  const { token } = useParams<{ token: string }>()
  const [event, setEvent] = useState<ScanEvent | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchScannerEvent(token)
      .then(setEvent)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'This scanner link could not be opened.'))
  }, [token])

  const scan = useCallback((code: string) => checkInWithScannerLink(token, code), [token])

  if (error) {
    return (
      <div className="scanner-page-shell">
        <section className="planner-login-card user-gate-card scanner-link-error">
          <ShieldAlert size={32} />
          <h1>Scanner link not working</h1>
          <p>{error} Ask the event organiser for the current check-in link.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="scanner-page-shell">
      <header className="scanner-header">
        <div>
          <h1>{event ? event.title : 'Loading event…'}</h1>
          {event ? (
            <p className="scanner-event-meta">
              <span><CalendarDays size={15} /> {event.date} · {event.time}</span>
              <span><MapPin size={15} /> {event.venue}</span>
            </p>
          ) : null}
        </div>
      </header>
      {event ? <TicketScanner onScan={scan} event={event} /> : null}
    </div>
  )
}
