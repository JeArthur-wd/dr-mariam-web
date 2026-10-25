'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2 } from 'lucide-react'
import type { ReservationTicket } from '../lib/user-auth'

export const DEFAULT_TICKET_COLOR = '#b82b6c'

type TicketPassProps = {
  ticket: ReservationTicket
  ticketType: string
  color?: string | null
  eventTitle?: string
}

/** One guest's admission: QR code, name and code on a band in the ticket type's colour. */
export function TicketPass({ ticket, ticketType, color, eventTitle }: TicketPassProps) {
  const [qr, setQr] = useState('')

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(ticket.qrPayload || ticket.ticketCode, { width: 360, margin: 1, color: { dark: '#3c1730', light: '#ffffff' } })
      .then((url) => { if (!cancelled) setQr(url) })
      .catch(() => { if (!cancelled) setQr('') })
    return () => { cancelled = true }
  }, [ticket.qrPayload, ticket.ticketCode])

  return (
    <article className="issued-ticket ticket-pass" style={{ '--ticket-color': color || DEFAULT_TICKET_COLOR } as React.CSSProperties}>
      {qr ? <img src={qr} alt={`QR code for ${ticket.guestName}`} /> : <div className="qr-placeholder" aria-hidden="true" />}
      <div>
        <span className="ticket-pass-type">{ticketType}</span>
        <strong>{ticket.guestName}</strong>
        {eventTitle ? <span>{eventTitle}</span> : null}
        <code>{ticket.ticketCode}</code>
        {ticket.checkedIn ? <span className="ticket-pass-used"><CheckCircle2 size={14} /> Checked in</span> : null}
      </div>
    </article>
  )
}
