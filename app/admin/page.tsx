'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowRight, CheckCircle2, CircleDollarSign, LogOut, Plus, QrCode, ScanLine, ShieldCheck, Ticket, Users } from 'lucide-react'
import { adminApiRequest, logoutAdmin, readAdminSession, type UserSession } from '../../lib/user-auth'

export default function AdminDashboardPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<UserSession | null>(null)
  const [eventId, setEventId] = useState<number | null>(null)
  const [eventTitle, setEventTitle] = useState('Singles to Mingle 2026')
  const [eventDate, setEventDate] = useState('2026-11-27')
  const [eventVenue, setEventVenue] = useState('Sheraton Hotel, Kampala')
  const [eventCapacity, setEventCapacity] = useState('200')
  const [ticketName, setTicketName] = useState('VIP Pass')
  const [ticketPrice, setTicketPrice] = useState('250000')
  const [ticketCode, setTicketCode] = useState('SM-2026-VIP-001')
  const [qrcodeUrl, setQrcodeUrl] = useState('')
  const [attendees, setAttendees] = useState<Array<{ name: string; email: string; ticket: string; amount: string; status: string }>>([])
  const [scannerLinks, setScannerLinks] = useState<Array<{ label: string; href: string; type: string }>>([])
  const [summary, setSummary] = useState({ paidGuests: 0, revenue: 'UGX 0', capacity: 0, totalReservations: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')
  const [isSavingEvent, setIsSavingEvent] = useState(false)

  type DashboardEventResponse = {
    id?: number | string
    title: string
    date: string
    venue: string
    capacity?: number
    ticketOptions?: Array<{ label: string; price: string; highlight: boolean }>
  }

  type DashboardSummaryResponse = {
    paidGuests: number
    revenue: string
    capacity: number
    totalReservations: number
  }

  type DashboardResponse = {
    event: DashboardEventResponse
    summary: DashboardSummaryResponse
    attendees: Array<{ name: string; email: string; ticket: string; amount: string; status: string }>
    scannerLinks: Array<{ label: string; href: string; type: string }>
  }

  useEffect(() => {
    const session = readAdminSession()
    setAdmin(session)
  }, [])

  async function loadDashboard() {
    setIsLoading(true)
    setDashboardError('')
    try {
      const data = await adminApiRequest<DashboardResponse>('/api/admin/dashboard/')
      setEventId(typeof data.event?.id === 'number' ? data.event.id : null)
      if (data.event?.title) setEventTitle(data.event.title)
      if (data.event?.date) setEventDate(data.event.date.match(/^\d{4}-\d{2}-\d{2}$/) ? data.event.date : '')
      if (data.event?.venue) setEventVenue(data.event.venue)
      setEventCapacity(String(data.summary?.capacity || data.event?.capacity || 0))
      setSummary(data.summary)
      setAttendees(Array.isArray(data.attendees) ? data.attendees : [])
      setScannerLinks(Array.isArray(data.scannerLinks) ? data.scannerLinks : [])
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to load dashboard data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  useEffect(() => {
    async function generateQr() {
      if (!ticketCode) return
      try {
        const dataUrl = await QRCode.toDataURL(ticketCode, {
          width: 280,
          margin: 1,
          color: {
            dark: '#3c1730',
            light: '#ffffff',
          },
        })
        setQrcodeUrl(dataUrl)
      } catch {
        setQrcodeUrl('')
      }
    }

    void generateQr()
  }, [ticketCode])

  async function handleCreateEvent() {
    setIsSavingEvent(true)

    try {
      const endpoint = eventId ? `/api/admin/events/${eventId}/update/` : '/api/admin/events/'
      const data = await adminApiRequest<{ event?: DashboardEventResponse }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          title: eventTitle,
          date: eventDate,
          venue: eventVenue,
          time: '4:30 PM',
          dressCode: 'Black, Red, White & Pink',
          capacity: Number(eventCapacity) || 200,
          ticketTypes: [
            { name: ticketName, price: `UGX ${Number(ticketPrice || 0).toLocaleString()}` },
            { name: 'Standard', price: 'UGX 120,000' },
          ],
        }),
      })

      if (data.event?.id) setEventId(Number(data.event.id))
      if (data.event?.title) setEventTitle(data.event.title)
      if (data.event?.date) setEventDate(data.event.date)
      if (data.event?.venue) setEventVenue(data.event.venue)
      if (data.event?.capacity) setEventCapacity(String(data.event.capacity))
      await loadDashboard()
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to save event.')
    } finally {
      setIsSavingEvent(false)
    }
  }

  async function handleDeleteEvent() {
    if (!eventId) return

    try {
      await adminApiRequest(`/api/admin/events/${eventId}/delete/`, {
        method: 'POST',
      })
      setEventId(null)
      await loadDashboard()
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to delete event.')
    }
  }

  function exportReport() {
    const rows = attendees.map((person) => [person.name, person.email, person.ticket, person.amount, person.status])
    const csvRows = [
      ['Name', 'Email', 'Ticket', 'Amount', 'Status'],
      ...rows,
    ].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = 'dr-mariam-event-report.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(href)
  }

  async function handleLogout() {
    await logoutAdmin()
    setAdmin(null)
    router.replace('/admin/login')
  }

  if (!admin) {
    return (
      <div className="site-shell">
        <main className="page-main user-auth-gate">
          <section className="planner-login-card user-gate-card">
            <div className="eyebrow">ADMIN ACCESS</div>
            <h1>Event operations hub</h1>
            <p>Sign in to create events, manage ticketing, track payments and scan guests at the entrance.</p>

            <div className="user-auth-actions">
              <Link href="/admin/login" className="secondary-button">Admin login</Link>
              <Link href="/admin/signup" className="user-secondary-button">Create admin account</Link>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>Dr Mariam</strong>
            <span>Admin Portal</span>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          <a className="active" href="#overview">Overview</a>
          <a href="#events">Events</a>
          <a href="#tickets">Tickets</a>
          <a href="#guests">Guests</a>
          <Link href="/admin/scanner">Check-in</Link>
        </nav>

        <div className="admin-profile-card">
          <span className="mini-label">Signed in</span>
          <h3>{admin.fullName}</h3>
          <p>{admin.email}</p>
          <button type="button" className="admin-logout-button" onClick={() => void handleLogout()}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="admin-main" id="overview">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">ADMIN COMMAND CENTER</p>
            <h1>Event operations</h1>
          </div>
          <div className="admin-topbar-actions">
            <button type="button" className="secondary-button small-button" onClick={exportReport}>Export report</button>
            <Link href="/admin/scanner" className="primary-button small-button">
              <ScanLine size={16} /> Live scanner
            </Link>
          </div>
        </header>

        {dashboardError ? <div className="planner-error" role="alert">{dashboardError}</div> : null}

        <section className="admin-metrics-grid">
          <article className="admin-metric-card">
            <div className="metric-topline">
              <span>Paid guests</span>
              <div className="metric-icon"><Users size={18} /></div>
            </div>
            <strong>{isLoading ? '—' : summary.paidGuests}</strong>
            <small>Confirmed check-outs</small>
          </article>

          <article className="admin-metric-card">
            <div className="metric-topline">
              <span>Revenue</span>
              <div className="metric-icon"><CircleDollarSign size={18} /></div>
            </div>
            <strong>{isLoading ? '—' : summary.revenue}</strong>
            <small>Across all sold tickets</small>
          </article>

          <article className="admin-metric-card">
            <div className="metric-topline">
              <span>Occupancy</span>
              <div className="metric-icon"><ShieldCheck size={18} /></div>
            </div>
            <strong>{isLoading ? '—' : `${summary.paidGuests}/${summary.capacity}`}</strong>
            <small>Seats currently filled</small>
          </article>

          <article className="admin-metric-card">
            <div className="metric-topline">
              <span>Reservations</span>
              <div className="metric-icon"><Ticket size={18} /></div>
            </div>
            <strong>{isLoading ? '—' : summary.totalReservations}</strong>
            <small>All customer reservations</small>
          </article>
        </section>

        <section className="admin-panel-grid" id="events">
          <article className="admin-panel">
            <div className="panel-header">
              <h2>Create event</h2>
              <span className="panel-tag">Draft saved</span>
            </div>

            <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void handleCreateEvent() }}>
              <div className="field-row two-up">
                <label>
                  Event title
                  <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
                </label>
                <label>
                  Capacity
                  <input value={eventCapacity} onChange={(event) => setEventCapacity(event.target.value)} />
                </label>
              </div>

              <div className="field-row two-up">
                <label>
                  Date
                  <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
                </label>
                <label>
                  Venue
                  <input value={eventVenue} onChange={(event) => setEventVenue(event.target.value)} />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Event description
                  <textarea rows={4} defaultValue="An elegant evening of connection, wellness, and meaningful conversation with Dr Mariam Nagujja." />
                </label>
              </div>

              <div className="field-row two-up">
                <button type="submit" className="primary-button" disabled={isSavingEvent}>
                  <Plus size={16} /> {isSavingEvent ? 'Saving…' : eventId ? 'Update event' : 'Publish event'}
                </button>
                {eventId ? (
                  <button type="button" className="secondary-button" onClick={handleDeleteEvent}>
                    Delete event
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="admin-panel highlight-panel">
            <div className="panel-header">
              <h2>Ticket design</h2>
              <span className="panel-tag success">QR ready</span>
            </div>

            <div className="ticket-preview">
              <div className="ticket-preview-card">
                <div className="ticket-preview-header">
                  <div>
                    <span className="mini-label">Entry pass</span>
                    <h3>{eventTitle}</h3>
                  </div>
                  <div className="qr-mini-box">
                    {qrcodeUrl ? <img src={qrcodeUrl} alt="Ticket QR code" /> : <QrCode size={34} />}
                  </div>
                </div>
                <div className="ticket-preview-body">
                  <div>
                    <span>Guest</span>
                    <strong>VIP / Premium access</strong>
                  </div>
                  <div>
                    <span>Date</span>
                    <strong>{eventDate}</strong>
                  </div>
                  <div>
                    <span>Venue</span>
                    <strong>{eventVenue}</strong>
                  </div>
                </div>
                <div className="ticket-code-row">
                  <span>Ticket code</span>
                  <strong>{ticketCode}</strong>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="admin-panel-grid secondary-grid">
          <article className="admin-panel" id="guests">
            <div className="panel-header">
              <h2>Paid attendees</h2>
              <span className="panel-tag">{attendees.filter((person) => ['paid', 'confirmed', 'checked_in', 'Paid', 'Confirmed', 'Checked In'].includes(person.status)).length} paid</span>
            </div>

            <div className="attendee-list">
              {isLoading ? <p className="empty-state">Loading reservations…</p> : null}
              {!isLoading && attendees.length === 0 ? <p className="empty-state">No reservations have been recorded yet.</p> : null}
              {attendees.map((person) => (
                <div key={`${person.email}-${person.ticket}`} className="attendee-row">
                  <div className="attendee-person">
                    <div className="avatar-circle">{person.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
                    <div>
                      <strong>{person.name}</strong>
                      <small>{person.email}</small>
                    </div>
                  </div>
                  <div className="attendee-meta">
                    <span>{person.ticket}</span>
                    <strong>{person.amount}</strong>
                  </div>
                  <span className={`attendance-status ${['paid', 'Paid', 'confirmed', 'Confirmed', 'checked_in', 'Checked In'].includes(person.status) ? 'paid' : 'pending'}`}>
                    {person.status}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel" id="tickets">
            <div className="panel-header">
              <h2>Create ticket</h2>
              <span className="panel-tag">Live preview</span>
            </div>

            <form className="admin-form compact-form" onSubmit={(event) => { event.preventDefault(); void handleCreateEvent() }}>
              <label>
                Ticket type
                <input value={ticketName} onChange={(event) => setTicketName(event.target.value)} />
              </label>

              <label>
                Price (UGX)
                <input value={ticketPrice} onChange={(event) => setTicketPrice(event.target.value)} />
              </label>

              <label>
                Ticket code
                <input value={ticketCode} onChange={(event) => setTicketCode(event.target.value)} />
              </label>

              <button type="submit" className="primary-button" disabled={isSavingEvent}>
                <CheckCircle2 size={16} /> {isSavingEvent ? 'Saving…' : 'Save ticket'}
              </button>
            </form>
          </article>
        </section>

        <section className="admin-panel-grid scanner-grid">
          <article className="admin-panel">
            <div className="panel-header">
              <h2>QR scanning links</h2>
              <span className="panel-tag">Entrance ready</span>
            </div>

            <div className="scanner-link-list">
              {scannerLinks.map((link) => (
                <Link key={`${link.label}-${link.type}`} href={link.href} className="scanner-link-item">
                  <div className="scanner-link-copy">
                    <strong>{link.label}</strong>
                    <small>{link.type}</small>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}

