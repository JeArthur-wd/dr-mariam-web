'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Check, Copy, Pencil, Plus, RefreshCw, Shirt, Ticket, Trash2, X } from 'lucide-react'
import { AdminShell } from '../../../components/admin-shell'
import { adminApiRequest, type TicketOption } from '../../../lib/user-auth'

type AdminEvent = {
  id: number
  title: string
  date: string
  dateValue: string
  time: string
  timeValue: string
  venue: string
  dressCode: string
  capacity: number
  isActive: boolean
  scannerToken: string
  ticketsSold: number
  checkedIn: number
  revenue: string
  hasSales: boolean
  ticketOptions: Array<TicketOption & { id: number; codePrefix: string; sold: number }>
}

type EventForm = { title: string; date: string; time: string; venue: string; dressCode: string; capacity: string }

const emptyForm: EventForm = { title: '', date: '', time: '', venue: '', dressCode: '', capacity: '200' }

/** Mirrors build_code_prefix on the server so admins see the code format before saving. */
function previewCodePrefix(eventTitle: string, ticketName: string) {
  const initials = (text: string) => text.split(/\s+/).filter((word) => /^[a-z]/i.test(word)).map((word) => word[0]).join('').toUpperCase()
  const year = eventTitle.split(/\s+/).find((word) => /^\d{4}$/.test(word)) ?? ''
  return `${(initials(eventTitle).slice(0, 4) || 'EVT') + year.slice(-2)}-${initials(ticketName).slice(0, 3) || 'GEN'}`
}

function scannerUrl(token: string) {
  return typeof window === 'undefined' ? `/scan/${token}` : `${window.location.origin}/scan/${token}`
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<'new' | number | null>(null)
  const [form, setForm] = useState<EventForm>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [ticketsFor, setTicketsFor] = useState<number | null>(null)
  const [ticketForm, setTicketForm] = useState({ name: '', price: '', highlight: false })
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<{ action: 'delete' | 'relink'; id: number } | null>(null)

  async function loadEvents() {
    try {
      const data = await adminApiRequest<{ events: AdminEvent[] }>('/api/admin/events/')
      setEvents(data.events)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load events.')
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  function replaceEvent(updated: AdminEvent) {
    setEvents((current) => (current ?? []).map((event) => (event.id === updated.id ? updated : event)))
  }

  function startCreate() {
    setForm(emptyForm)
    setEditing('new')
    setError('')
  }

  function startEdit(event: AdminEvent) {
    setForm({ title: event.title, date: event.dateValue, time: event.timeValue, venue: event.venue, dressCode: event.dressCode, capacity: String(event.capacity) })
    setEditing(event.id)
    setError('')
  }

  async function saveEvent(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      const body = JSON.stringify({ ...form, capacity: Number(form.capacity) || 200 })
      if (editing === 'new') {
        const data = await adminApiRequest<{ event: AdminEvent }>('/api/admin/events/', { method: 'POST', body })
        await loadEvents()
        // Step two of creating an event: its ticket types.
        setTicketsFor(data.event.id)
        setTicketForm({ name: '', price: '', highlight: true })
        setNotice(`${data.event.title} is live. Add its ticket types below so members can book.`)
      } else if (editing !== null) {
        const data = await adminApiRequest<{ event: AdminEvent }>(`/api/admin/events/${editing}/update/`, { method: 'POST', body })
        replaceEvent(data.event)
        setNotice('Event updated.')
      }
      setEditing(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the event.')
    } finally {
      setIsSaving(false)
    }
  }

  async function addTicketType(submitEvent: React.FormEvent<HTMLFormElement>, eventId: number) {
    submitEvent.preventDefault()
    setError('')
    try {
      const data = await adminApiRequest<{ event: AdminEvent }>(`/api/admin/events/${eventId}/ticket-types/`, {
        method: 'POST',
        body: JSON.stringify(ticketForm),
      })
      replaceEvent(data.event)
      setTicketForm({ name: '', price: '', highlight: false })
    } catch (ticketError) {
      setError(ticketError instanceof Error ? ticketError.message : 'Unable to add the ticket type.')
    }
  }

  async function runAction(path: string, onDone: (data: { event?: AdminEvent; message?: string }) => void, body: Record<string, unknown> = {}) {
    setError('')
    try {
      onDone(await adminApiRequest<{ event?: AdminEvent; message?: string }>(path, { method: 'POST', body: JSON.stringify(body) }))
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'That action failed.')
    } finally {
      setConfirming(null)
    }
  }

  async function copyScannerLink(event: AdminEvent) {
    try {
      await navigator.clipboard.writeText(scannerUrl(event.scannerToken))
      setCopiedId(event.id)
      window.setTimeout(() => setCopiedId((current) => (current === event.id ? null : current)), 2500)
    } catch {
      setError('Copying is blocked in this browser. Select the link text and copy it manually.')
    }
  }

  const formTitle = editing === 'new' ? 'New event' : 'Edit event'

  return (
    <AdminShell title="Events" actions={<button type="button" className="primary-button small-button" onClick={startCreate}><Plus size={16} /> New event</button>}>
      {error ? <div className="planner-error" role="alert">{error}</div> : null}
      {notice ? <div className="admin-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div> : null}

      {editing !== null ? (
        <article className="admin-panel event-form-panel">
          <div className="panel-header">
            <h2>{formTitle}</h2>
            {editing === 'new' ? <span className="panel-tag">Step 1 of 2 · then tickets</span> : null}
          </div>
          <form className="admin-form" onSubmit={saveEvent}>
            <label>Event title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Singles to Mingle 2027" /></label>
            <div className="field-row two-up">
              <label>Date<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label>Time<input required type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
            </div>
            <div className="field-row two-up">
              <label>Venue<input required value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} placeholder="Sheraton Hotel, Kampala" /></label>
              <label>Dress code<input required value={form.dressCode} onChange={(event) => setForm({ ...form, dressCode: event.target.value })} placeholder="Black, Red, White & Pink" /></label>
            </div>
            <label className="narrow-field">Capacity<input required type="number" min={1} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></label>
            {editing === 'new' ? <p className="form-hint">Publishing makes this the event members can book. The previous live event stops selling.</p> : null}
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving…' : editing === 'new' ? 'Create & add tickets' : 'Save changes'}</button>
              <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </article>
      ) : null}

      <section className="event-admin-list">
        {events === null && !error ? <p className="empty-state">Loading events…</p> : null}
        {events?.length === 0 && editing === null ? (
          <div className="empty-state">
            <p>No events yet. Create one to open ticket sales.</p>
            <button type="button" className="primary-button small-button" onClick={startCreate}><Plus size={16} /> New event</button>
          </div>
        ) : null}

        {events?.map((event) => {
          const ticketsOpen = ticketsFor === event.id
          const needsTickets = event.ticketOptions.length === 0
          return (
            <article key={event.id} className={`admin-panel event-admin-card${event.isActive ? ' is-live' : ''}`}>
              <div className="event-admin-head">
                <div>
                  <h2>{event.title} {event.isActive ? <span className="panel-tag success">Live</span> : null}</h2>
                  <p className="event-admin-meta">
                    <span><CalendarDays size={15} /> {event.date} · {event.time}</span>
                    <span>{event.venue}</span>
                    <span><Shirt size={15} /> {event.dressCode}</span>
                  </p>
                </div>
                <div className="event-admin-stats">
                  <div><strong>{event.ticketsSold}/{event.capacity}</strong><span>sold</span></div>
                  <div><strong>{event.revenue}</strong><span>revenue</span></div>
                </div>
              </div>

              {needsTickets && !ticketsOpen ? (
                <p className="form-hint warning">No ticket types yet, so members cannot book this event. <button type="button" className="text-button" onClick={() => { setTicketsFor(event.id); setTicketForm({ name: '', price: '', highlight: true }) }}>Add tickets</button></p>
              ) : null}

              <div className="event-admin-actions">
                <button type="button" className="secondary-button small-button" onClick={() => { setTicketsFor(ticketsOpen ? null : event.id); setTicketForm({ name: '', price: '', highlight: needsTickets }) }}>
                  <Ticket size={15} /> Tickets ({event.ticketOptions.length})
                </button>
                <button type="button" className="secondary-button small-button" onClick={() => startEdit(event)}><Pencil size={15} /> Edit</button>
                {!event.isActive ? (
                  <button type="button" className="secondary-button small-button" onClick={() => void runAction(`/api/admin/events/${event.id}/update/`, () => { void loadEvents(); setNotice(`${event.title} is now the live event.`) }, { isActive: true })}>Make live</button>
                ) : null}
                {!event.hasSales ? (
                  confirming?.action === 'delete' && confirming.id === event.id ? (
                    <span className="inline-confirm">Delete this event?
                      <button type="button" className="danger-button small-button" onClick={() => void runAction(`/api/admin/events/${event.id}/delete/`, () => setEvents((current) => (current ?? []).filter((item) => item.id !== event.id)))}>Delete</button>
                      <button type="button" className="text-button" onClick={() => setConfirming(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className="secondary-button small-button" onClick={() => setConfirming({ action: 'delete', id: event.id })}><Trash2 size={15} /> Delete</button>
                  )
                ) : null}
              </div>

              {ticketsOpen ? (
                <div className="ticket-type-panel">
                  <h3>{needsTickets ? 'Step 2 of 2 · Add ticket types' : 'Ticket types'}</h3>
                  {event.ticketOptions.length > 0 ? (
                    <ul className="ticket-type-list">
                      {event.ticketOptions.map((option) => (
                        <li key={option.id}>
                          <div>
                            <strong>{option.label}{option.highlight ? <em className="live-dot">Featured</em> : null}</strong>
                            <code>{option.codePrefix}-XXXXXX</code>
                          </div>
                          <span>{option.price}</span>
                          <span>{option.sold} sold</span>
                          {option.sold === 0 ? (
                            <button type="button" className="icon-button" aria-label={`Remove ${option.label}`} onClick={() => void runAction(`/api/admin/ticket-types/${option.id}/delete/`, (data) => data.event && replaceEvent(data.event))}><Trash2 size={15} /></button>
                          ) : <span aria-hidden="true" />}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <form className="admin-form ticket-type-form" onSubmit={(submitEvent) => void addTicketType(submitEvent, event.id)}>
                    <div className="field-row two-up">
                      <label>Ticket name<input required value={ticketForm.name} onChange={(changeEvent) => setTicketForm({ ...ticketForm, name: changeEvent.target.value })} placeholder="Early Bird" /></label>
                      <label>Price (UGX)<input required inputMode="numeric" value={ticketForm.price} onChange={(changeEvent) => setTicketForm({ ...ticketForm, price: changeEvent.target.value })} placeholder="150000" /></label>
                    </div>
                    <label className="checkbox-field"><input type="checkbox" checked={ticketForm.highlight} onChange={(changeEvent) => setTicketForm({ ...ticketForm, highlight: changeEvent.target.checked })} /> Feature this ticket (shown first and selected by default)</label>
                    <p className="form-hint">Ticket codes are generated for every guest, like <code>{previewCodePrefix(event.title, ticketForm.name || 'Ticket')}-4F2A9C</code>.</p>
                    <div className="form-actions">
                      <button type="submit" className="primary-button small-button"><Plus size={15} /> Add ticket type</button>
                      {!needsTickets ? <button type="button" className="text-button" onClick={() => setTicketsFor(null)}>Done</button> : null}
                    </div>
                  </form>
                </div>
              ) : null}

              <div className="scanner-link-box">
                <div>
                  <strong>Check-in link</strong>
                  <small>Send this to door staff. It opens a scanner for this event only, without an admin login.</small>
                </div>
                <input readOnly value={scannerUrl(event.scannerToken)} onFocus={(focusEvent) => focusEvent.target.select()} aria-label={`Check-in link for ${event.title}`} />
                <div className="form-actions">
                  <button type="button" className="primary-button small-button" onClick={() => void copyScannerLink(event)}>
                    {copiedId === event.id ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}
                  </button>
                  {confirming?.action === 'relink' && confirming.id === event.id ? (
                    <span className="inline-confirm">The old link will stop working.
                      <button type="button" className="danger-button small-button" onClick={() => void runAction(`/api/admin/events/${event.id}/scanner-link/`, (data) => { if (data.event) replaceEvent(data.event); setNotice('New check-in link created. Send it to your door staff.') })}>Replace</button>
                      <button type="button" className="text-button" onClick={() => setConfirming(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button type="button" className="secondary-button small-button" onClick={() => setConfirming({ action: 'relink', id: event.id })}><RefreshCw size={15} /> New link</button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </AdminShell>
  )
}
