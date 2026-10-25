'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Mail, MapPin, Ticket } from 'lucide-react'
import { DEFAULT_TICKET_COLOR, TicketPass } from '../../../components/ticket-pass'
import { UserShell } from '../../../components/user-shell'
import { fetchMyReservations, resendTicketEmail, type ReservationPayload } from '../../../lib/user-auth'

const PAID = ['paid', 'confirmed', 'checked_in']

export default function MyTicketsPage() {
  const [orders, setOrders] = useState<ReservationPayload[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sendingId, setSendingId] = useState<number | null>(null)

  useEffect(() => {
    fetchMyReservations()
      .then(setOrders)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load your tickets.'))
  }, [])

  async function resend(order: ReservationPayload) {
    setSendingId(order.id)
    setError('')
    setNotice('')
    try {
      await resendTicketEmail(order.id)
      setNotice(`Tickets sent again to ${order.email}.`)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The email could not be sent. Please try again later.')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <UserShell title="My tickets" actions={<Link href="/event" className="primary-button small-button"><Ticket size={15} /> Get tickets</Link>}>
      {() => (
        <div className="member-tickets">
          {error ? <div className="planner-error" role="alert">{error}</div> : null}
          {notice ? <div className="admin-notice" role="status">{notice}</div> : null}
          {orders === null && !error ? <p className="empty-state">Loading your tickets…</p> : null}
          {orders?.length === 0 ? (
            <div className="empty-state">
              <p>You have no tickets yet. Reserve a place at the next event.</p>
              <Link href="/event" className="primary-button small-button"><Ticket size={15} /> Get a ticket</Link>
            </div>
          ) : null}

          {orders?.map((order) => {
            const paid = PAID.includes(order.status)
            return (
              <article key={order.id} className="admin-panel member-order-card" style={{ '--ticket-color': order.ticketColor || DEFAULT_TICKET_COLOR } as React.CSSProperties}>
                <div className="event-admin-head">
                  <div>
                    <h2>{order.eventTitle}</h2>
                    <p className="event-admin-meta">
                      {order.eventDate ? <span><CalendarDays size={15} /> {order.eventDate} · {order.eventTime}</span> : null}
                      {order.eventVenue ? <span><MapPin size={15} /> {order.eventVenue}</span> : null}
                    </p>
                  </div>
                  <span className={`status-pill ${paid ? 'success' : 'pending'}`}>{paid ? 'Paid' : 'Awaiting payment'}</span>
                </div>

                <p className="member-order-summary">{order.quantity} × {order.ticketType} · {order.totalAmount}</p>

                {paid ? (
                  <>
                    <div className="issued-tickets member-ticket-grid">
                      {order.tickets.map((ticket) => (
                        <TicketPass key={ticket.ticketCode} ticket={ticket} ticketType={order.ticketType} color={order.ticketColor} />
                      ))}
                    </div>
                    <div className="form-actions">
                      <span className="form-hint">{order.emailSent ? `Emailed to ${order.email}.` : `Not emailed yet. Tickets go to ${order.email}.`}</span>
                      <button type="button" className="secondary-button small-button" disabled={sendingId === order.id} onClick={() => void resend(order)}>
                        <Mail size={15} /> {sendingId === order.id ? 'Sending…' : 'Email my tickets'}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="form-hint"><Clock3 size={14} /> Approve the mobile money prompt on your phone. Your QR codes appear here and are emailed to {order.email} once payment is confirmed.</p>
                )}
              </article>
            )
          })}
        </div>
      )}
    </UserShell>
  )
}
