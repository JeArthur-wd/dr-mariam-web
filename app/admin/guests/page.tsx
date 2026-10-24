'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { AdminShell } from '../../../components/admin-shell'
import { adminApiRequest, type ReservationTicket } from '../../../lib/user-auth'

type GuestOrder = {
  id: number
  buyerName: string
  email: string
  phone: string
  eventTitle: string
  ticketType: string
  quantity: number
  amountPaid: string
  paymentMethod: string
  createdAt: string
  checkedIn: number
  tickets: ReservationTicket[]
}

type GuestsResponse = {
  orders: GuestOrder[]
  totals: { orders: number; tickets: number; checkedIn: number; amountPaid: string }
}

type EventOption = { id: number; title: string; isActive: boolean }

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminGuestsPage() {
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState('')
  const [data, setData] = useState<GuestsResponse | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    adminApiRequest<{ events: EventOption[] }>('/api/admin/events/')
      .then((response) => {
        setEvents(response.events)
        setEventId(String(response.events.find((event) => event.isActive)?.id ?? ''))
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load events.'))
  }, [])

  useEffect(() => {
    setData(null)
    adminApiRequest<GuestsResponse>(`/api/admin/guests/${eventId ? `?event=${eventId}` : ''}`)
      .then(setData)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load guests.'))
  }, [eventId])

  function exportCsv() {
    if (!data) return
    const rows = data.orders.flatMap((order) => order.tickets.map((ticket) => [
      ticket.guestName, ticket.ticketCode, order.ticketType, order.eventTitle, order.buyerName, order.email, order.phone,
      order.amountPaid, order.paymentMethod, formatDate(order.createdAt), ticket.checkedIn ? 'Yes' : 'No',
    ]))
    const csv = [['Guest', 'Ticket code', 'Ticket type', 'Event', 'Buyer', 'Email', 'Phone', 'Order amount', 'Paid with', 'Paid on', 'Checked in'], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = href
    link.download = 'paid-guests.csv'
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <AdminShell
      title="Guests"
      actions={<button type="button" className="secondary-button small-button" onClick={exportCsv} disabled={!data?.orders.length}><Download size={15} /> Export CSV</button>}
    >
      {error ? <div className="planner-error" role="alert">{error}</div> : null}

      <div className="guests-toolbar">
        <label className="admin-select">
          <span>Event</span>
          <select value={eventId} onChange={(event) => setEventId(event.target.value)}>
            <option value="">All events</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.title}{event.isActive ? ' (live)' : ''}</option>)}
          </select>
        </label>
        {data ? (
          <dl className="guests-totals">
            <div><dt>Paid orders</dt><dd>{data.totals.orders}</dd></div>
            <div><dt>Tickets</dt><dd>{data.totals.tickets}</dd></div>
            <div><dt>Checked in</dt><dd>{data.totals.checkedIn}/{data.totals.tickets}</dd></div>
            <div><dt>Amount paid</dt><dd>{data.totals.amountPaid}</dd></div>
          </dl>
        ) : null}
      </div>

      <article className="admin-panel">
        {!data && !error ? <p className="empty-state">Loading guests…</p> : null}
        {data && data.orders.length === 0 ? <p className="empty-state">No paid guests yet. Only orders with a confirmed payment are listed here.</p> : null}
        {data && data.orders.length > 0 ? (
          <table className="guests-table">
            <thead>
              <tr>
                <th scope="col">Buyer</th>
                <th scope="col">Tickets bought</th>
                <th scope="col" className="numeric">Amount paid</th>
                <th scope="col">Checked in</th>
                <th scope="col"><span className="visually-hidden">Guest list</span></th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => {
                const isOpen = expanded === order.id
                return (
                  <Fragment key={order.id}>
                    <tr>
                      <td data-label="Buyer">
                        <strong>{order.buyerName}</strong>
                        <small>{order.email} · {order.phone}</small>
                      </td>
                      <td data-label="Tickets bought">
                        <strong>{order.quantity} × {order.ticketType}</strong>
                        <small>{eventId ? formatDate(order.createdAt) : order.eventTitle}</small>
                      </td>
                      <td data-label="Amount paid" className="numeric">
                        <strong>{order.amountPaid}</strong>
                        <small>{order.paymentMethod}</small>
                      </td>
                      <td data-label="Checked in">
                        <span className={`attendance-status ${order.checkedIn === order.quantity ? 'paid' : 'pending'}`}>{order.checkedIn}/{order.quantity}</span>
                      </td>
                      <td>
                        <button type="button" className="text-button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : order.id)}>
                          {isOpen ? 'Hide' : 'Guests'} <ChevronDown size={15} className={isOpen ? 'rotated' : ''} />
                        </button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="guest-detail-row">
                        <td colSpan={5}>
                          <ul className="ticket-type-list">
                            {order.tickets.map((ticket) => (
                              <li key={ticket.ticketCode}>
                                <strong>{ticket.guestName}</strong>
                                <code>{ticket.ticketCode}</code>
                                <span className={`attendance-status ${ticket.checkedIn ? 'paid' : 'pending'}`}>{ticket.checkedIn ? 'Checked in' : 'Not yet'}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </article>
    </AdminShell>
  )
}
