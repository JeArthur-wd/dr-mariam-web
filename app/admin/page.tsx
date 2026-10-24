'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CircleDollarSign, Clock3, ScanLine, ShieldCheck, Ticket } from 'lucide-react'
import { AdminShell } from '../../components/admin-shell'
import { adminApiRequest } from '../../lib/user-auth'

type GuestOrder = {
  id: number
  buyerName: string
  email: string
  eventTitle: string
  ticketType: string
  quantity: number
  amountPaid: string
  paymentMethod: string
  createdAt: string
}

type DashboardResponse = {
  event: { id: number | null; title: string; date: string; venue: string; capacity?: number }
  summary: {
    revenue: string
    ticketsSold: number
    paidOrders: number
    pendingOrders: number
    checkedIn: number
    capacity: number
    liveTicketsSold: number
  }
  revenueByEvent: Array<{ id: number; title: string; isActive: boolean; revenue: string; ticketsSold: number }>
  recentSales: GuestOrder[]
}

function formatSaleTime(value: string) {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApiRequest<DashboardResponse>('/api/admin/dashboard/')
      .then(setData)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.'))
  }, [])

  const summary = data?.summary
  const liveEvent = data?.event?.id ? data.event : null
  const metrics = [
    { label: 'Revenue', value: summary?.revenue, note: `From ${summary?.paidOrders ?? 0} paid order${summary?.paidOrders === 1 ? '' : 's'}`, icon: CircleDollarSign },
    { label: 'Tickets sold', value: summary?.ticketsSold, note: 'Paid tickets, all events', icon: Ticket },
    { label: 'Checked in', value: summary?.checkedIn, note: 'Scanned at the entrance', icon: ShieldCheck },
    { label: 'Awaiting payment', value: summary?.pendingOrders, note: 'Orders not yet paid', icon: Clock3 },
  ]

  return (
    <AdminShell
      title="Overview"
      actions={<Link href="/admin/scanner" className="primary-button small-button"><ScanLine size={16} /> Live scanner</Link>}
    >
      {error ? <div className="planner-error" role="alert">{error}</div> : null}

      <section className="admin-metrics-grid">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <article key={label} className="admin-metric-card">
            <div className="metric-topline">
              <span>{label}</span>
              <div className="metric-icon"><Icon size={18} /></div>
            </div>
            <strong>{data ? value : '—'}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="admin-panel-grid">
        <article className="admin-panel">
          <div className="panel-header">
            <h2>Recent sales</h2>
            <Link href="/admin/guests" className="panel-link">All guests</Link>
          </div>
          <div className="attendee-list">
            {!data && !error ? <p className="empty-state">Loading sales…</p> : null}
            {data && data.recentSales.length === 0 ? <p className="empty-state">No paid tickets yet. Sales appear here once mobile money payments are confirmed.</p> : null}
            {data?.recentSales.map((sale) => (
              <div key={sale.id} className="attendee-row">
                <div className="attendee-person">
                  <div className="avatar-circle">{sale.buyerName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div>
                  <div>
                    <strong>{sale.buyerName}</strong>
                    <small>{sale.quantity} × {sale.ticketType} · {formatSaleTime(sale.createdAt)}</small>
                  </div>
                </div>
                <div className="attendee-meta">
                  <span>{sale.paymentMethod}</span>
                  <strong>{sale.amountPaid}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-panel highlight-panel">
          <div className="panel-header">
            <h2>Live event</h2>
            <Link href="/admin/events" className="panel-link">Manage</Link>
          </div>
          {liveEvent && summary ? (
            <div className="live-event-summary">
              <h3>{liveEvent.title}</h3>
              <p>{liveEvent.date} · {liveEvent.venue}</p>
              <div className="capacity-meter" role="img" aria-label={`${summary.liveTicketsSold} of ${summary.capacity} tickets sold`}>
                <span style={{ width: `${Math.min((summary.liveTicketsSold / Math.max(summary.capacity, 1)) * 100, 100)}%` }} />
              </div>
              <small>{summary.liveTicketsSold} of {summary.capacity} tickets sold</small>
            </div>
          ) : (
            <p className="empty-state">{data ? 'No event is on sale. Create one in Events.' : 'Loading…'}</p>
          )}

          {data && data.revenueByEvent.length > 0 ? (
            <div className="revenue-list">
              <h3>Revenue by event</h3>
              {data.revenueByEvent.map((item) => (
                <div key={item.id} className="revenue-row">
                  <span>{item.title}{item.isActive ? <em className="live-dot">Live</em> : null}</span>
                  <strong>{item.revenue}</strong>
                  <small>{item.ticketsSold} sold</small>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </section>
    </AdminShell>
  )
}
