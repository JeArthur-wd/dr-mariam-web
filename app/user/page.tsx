'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Clock3, HeartHandshake, MapPin, MessageSquareText, ShoppingBag, Sparkles, Ticket } from 'lucide-react'
import { DEFAULT_TICKET_COLOR } from '../../components/ticket-pass'
import { UserShell } from '../../components/user-shell'
import { fetchEventDetails, fetchMyReservations, mediaUrl, type EventDetails, type ReservationPayload } from '../../lib/user-auth'

const PAID = ['paid', 'confirmed', 'checked_in']

const quickLinks = [
  { title: 'Counseling', description: 'Book a session and receive personal guidance.', href: '/counseling', icon: HeartHandshake, accent: 'pink' },
  { title: 'Singles Forum', description: 'Join conversations and connect with the community.', href: '/forum', icon: MessageSquareText, accent: 'mauve' },
  { title: 'Singles Event', description: 'View event updates, tickets and RSVP details.', href: '/event', icon: Sparkles, accent: 'rose' },
  { title: 'Products', description: 'Browse wellness products and support resources.', href: '/products', icon: ShoppingBag, accent: 'gold' },
] as const

export default function UserDashboardPage() {
  const [eventData, setEventData] = useState<EventDetails | null>(null)
  const [orders, setOrders] = useState<ReservationPayload[] | null>(null)

  useEffect(() => {
    fetchEventDetails().then(setEventData).catch(() => setEventData(null))
    fetchMyReservations().then(setOrders).catch(() => setOrders([]))
  }, [])

  const paidOrders = (orders ?? []).filter((order) => PAID.includes(order.status))
  const ticketCount = paidOrders.reduce((sum, order) => sum + order.tickets.length, 0)
  const pendingCount = (orders ?? []).filter((order) => order.status === 'pending').length
  const eventImage = mediaUrl(eventData?.imageUrl) ?? '/event-poster.jpg'

  return (
    <UserShell title="Dashboard">
      {(user) => (
        <div className="member-dashboard">
          <section className="user-dashboard-hero member-welcome">
            <div>
              <div className="eyebrow">WELCOME BACK</div>
              <h2>Hello, {user.fullName.split(' ')[0]}</h2>
              <p>Your tickets, event updates and support all live here.</p>
            </div>
          </section>

          <section className="user-metrics-grid">
            <article className="user-metric-card">
              <div className="metric-topline"><span>My tickets</span><div className="metric-icon"><Ticket size={18} /></div></div>
              <strong>{orders === null ? '…' : ticketCount}</strong>
            </article>
            <article className="user-metric-card">
              <div className="metric-topline"><span>Awaiting payment</span><div className="metric-icon"><Clock3 size={18} /></div></div>
              <strong>{orders === null ? '…' : pendingCount}</strong>
            </article>
            <article className="user-metric-card">
              <div className="metric-topline"><span>Next event</span><div className="metric-icon"><CalendarDays size={18} /></div></div>
              <strong>{eventData?.date ?? '—'}</strong>
            </article>
            <article className="user-metric-card">
              <div className="metric-topline"><span>Venue</span><div className="metric-icon"><MapPin size={18} /></div></div>
              <strong>{eventData?.venue ?? '—'}</strong>
            </article>
          </section>

          <section className="user-dashboard-grid">
            <div className="user-main-column">
              <div className="user-panel-header">
                <h2>My recent tickets</h2>
                <Link href="/user/tickets">View all</Link>
              </div>
              {orders === null ? <p className="empty-state">Loading your tickets…</p> : null}
              {orders?.length === 0 ? (
                <div className="empty-state">
                  <p>You have no tickets yet.</p>
                  <Link href="/event" className="primary-button small-button"><Ticket size={15} /> Get a ticket</Link>
                </div>
              ) : null}
              <ul className="member-order-list">
                {orders?.slice(0, 3).map((order) => (
                  <li key={order.id} style={{ '--ticket-color': order.ticketColor || DEFAULT_TICKET_COLOR } as React.CSSProperties}>
                    <div>
                      <strong>{order.eventTitle}</strong>
                      <span>{order.quantity} × {order.ticketType} · {order.totalAmount}</span>
                    </div>
                    <span className={`status-pill ${PAID.includes(order.status) ? 'success' : 'pending'}`}>{PAID.includes(order.status) ? 'Paid' : 'Awaiting payment'}</span>
                  </li>
                ))}
              </ul>

              <div className="user-panel-header"><h2>Explore</h2></div>
              <div className="service-grid user-service-grid">
                {quickLinks.map(({ title, description, href, icon: Icon, accent }) => (
                  <article key={title} className={`service-card home-card dashboard-card ${accent}`}>
                    <div className="service-icon"><Icon size={22} /></div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                    <Link href={href} className="secondary-button">Open <ArrowRight size={16} /></Link>
                  </article>
                ))}
              </div>
            </div>

            <aside className="user-side-panel">
              <div className="side-spotlight member-event-spotlight">
                <img src={eventImage} alt="" className="member-event-image" />
                <span className="spotlight-kicker">Featured event</span>
                <h3>{eventData?.title ?? 'Singles Event'}</h3>
                {eventData ? <p>{eventData.date} · {eventData.time} · {eventData.venue}</p> : null}
                <Link href="/event" className="secondary-button full-width-button">View event</Link>
              </div>
            </aside>
          </section>
        </div>
      )}
    </UserShell>
  )
}
