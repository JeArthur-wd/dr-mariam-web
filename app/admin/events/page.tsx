'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CalendarDays, Check, Copy, ImagePlus, Pencil, Plus, QrCode, RefreshCw, Shirt, Smartphone, Ticket, Trash2, X } from 'lucide-react'
import { AdminShell } from '../../../components/admin-shell'
import { DEFAULT_TICKET_COLOR } from '../../../components/ticket-pass'
import { adminApiRequest, adminUpload, mediaUrl, type TicketOption } from '../../../lib/user-auth'

type AdminEvent = {
  id: number
  title: string
  date: string
  dateValue: string
  time: string
  timeValue: string
  venue: string
  dressCode: string
  imageUrl: string | null
  capacity: number
  isActive: boolean
  scannerToken: string
  ticketsSold: number
  checkedIn: number
  revenue: string
  hasSales: boolean
  ticketOptions: Array<TicketOption & { id: number; codePrefix: string; sold: number; color: string }>
}

type EventForm = { title: string; date: string; time: string; venue: string; dressCode: string; capacity: string }

const emptyForm: EventForm = { title: '', date: '', time: '', venue: '', dressCode: '', capacity: '200' }

const TICKET_SWATCHES = ['#b82b6c', '#e7528c', '#6e234e', '#c9a227', '#1f7a4d', '#2563eb', '#111827', '#d97706']

const emptyTicketForm = (highlight: boolean, color = DEFAULT_TICKET_COLOR) => ({ name: '', price: '', highlight, color })

type ImageChoice = { file: File | null; preview: string | null; remove: boolean }
const noImageChoice: ImageChoice = { file: null, preview: null, remove: false }

/** Mirrors build_code_prefix on the server so admins see the code format before saving. */
function previewCodePrefix(eventTitle: string, ticketName: string) {
  const initials = (text: string) => text.split(/\s+/).filter((word) => /^[a-z]/i.test(word)).map((word) => word[0]).join('').toUpperCase()
  const year = eventTitle.split(/\s+/).find((word) => /^\d{4}$/.test(word)) ?? ''
  return `${(initials(eventTitle).slice(0, 4) || 'EVT') + year.slice(-2)}-${initials(ticketName).slice(0, 3) || 'GEN'}`
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/**
 * The link door staff open on their phones. A "localhost" address only works on this
 * computer, so swap in a public site URL or this computer's Wi-Fi address instead.
 */
function scannerUrl(token: string) {
  if (typeof window === 'undefined') return `/scan/${token}`
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return `${configured.replace(/\/$/, '')}/scan/${token}`
  const url = new URL(`/scan/${token}`, window.location.origin)
  const lanHost = process.env.NEXT_PUBLIC_LAN_HOST
  if (LOCAL_HOSTS.includes(url.hostname) && lanHost) url.hostname = lanHost
  return url.toString()
}

function scannerLinkWarning(link: string) {
  if (typeof window === 'undefined') return ''
  const url = new URL(link)
  if (LOCAL_HOSTS.includes(url.hostname)) return 'This link only works on this computer. Set NEXT_PUBLIC_SITE_URL to your site address so phones can open it.'
  if (url.protocol !== 'https:') return 'Phones only allow the camera on https:// links. Start the site with "pnpm dev:phone" (or deploy it with HTTPS). Typing ticket codes works either way.'
  return ''
}

function ScannerLinkQr({ link }: { link: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(link, { width: 240, margin: 1, color: { dark: '#3c1730', light: '#ffffff' } }).then(setSrc).catch(() => setSrc(''))
  }, [link])
  return src ? <img className="scanner-link-qr" src={src} alt="QR code that opens the check-in scanner" /> : null
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<'new' | number | null>(null)
  const [form, setForm] = useState<EventForm>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [ticketsFor, setTicketsFor] = useState<number | null>(null)
  const [ticketForm, setTicketForm] = useState(emptyTicketForm(false))
  const [image, setImage] = useState<ImageChoice>(noImageChoice)
  const [qrOpenId, setQrOpenId] = useState<number | null>(null)
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

  function chooseImage(file: File | undefined) {
    if (image.preview) URL.revokeObjectURL(image.preview)
    if (!file) {
      setImage(noImageChoice)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The image must be 5 MB or smaller.')
      return
    }
    setImage({ file, preview: URL.createObjectURL(file), remove: false })
  }

  function startCreate() {
    chooseImage(undefined)
    setForm(emptyForm)
    setEditing('new')
    setError('')
  }

  function startEdit(event: AdminEvent) {
    chooseImage(undefined)
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
      const saveImage = async (eventId: number) => {
        if (!image.file && !image.remove) return
        const upload = new FormData()
        if (image.file) upload.append('image', image.file)
        else upload.append('remove', 'true')
        await adminUpload(`/api/admin/events/${eventId}/image/`, upload)
      }
      if (editing === 'new') {
        const data = await adminApiRequest<{ event: AdminEvent }>('/api/admin/events/', { method: 'POST', body })
        // Close the form first so a failed image upload does not create the event twice on retry.
        setEditing(null)
        try {
          await saveImage(data.event.id)
        } catch (imageError) {
          setError(`Event created, but the image did not upload: ${imageError instanceof Error ? imageError.message : 'try again from Edit.'}`)
        }
        await loadEvents()
        // Step two of creating an event: its ticket types.
        setTicketsFor(data.event.id)
        setTicketForm(emptyTicketForm(true))
        setNotice(`${data.event.title} is live. Add its ticket types below so members can book.`)
      } else if (editing !== null) {
        await adminApiRequest<{ event: AdminEvent }>(`/api/admin/events/${editing}/update/`, { method: 'POST', body })
        await saveImage(editing)
        await loadEvents()
        setNotice('Event updated.')
        setEditing(null)
      }
      chooseImage(undefined)
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
      // Suggest a different colour for the next ticket type so they are easy to tell apart.
      setTicketForm(emptyTicketForm(false, nextSwatch(data.event)))
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
  const editingEvent = typeof editing === 'number' ? events?.find((event) => event.id === editing) : undefined
  const currentImage = image.preview ?? (image.remove ? null : mediaUrl(editingEvent?.imageUrl))

  function nextSwatch(event: AdminEvent) {
    const used = event.ticketOptions.map((option) => option.color)
    return TICKET_SWATCHES.find((swatch) => !used.includes(swatch)) ?? DEFAULT_TICKET_COLOR
  }

  function openTickets(event: AdminEvent) {
    setTicketsFor(ticketsFor === event.id ? null : event.id)
    setTicketForm(emptyTicketForm(event.ticketOptions.length === 0, nextSwatch(event)))
  }

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
            <div className="event-image-field">
              <span className="field-label">Event image</span>
              <div className="event-image-picker">
                {currentImage ? <img src={currentImage} alt="Event image preview" /> : <div className="event-image-empty"><ImagePlus size={26} /><span>No image yet</span></div>}
                <div className="event-image-actions">
                  <label className="secondary-button small-button file-button">
                    <ImagePlus size={15} /> {currentImage ? 'Change image' : 'Choose image'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(changeEvent) => { chooseImage(changeEvent.target.files?.[0]); changeEvent.target.value = '' }} />
                  </label>
                  {currentImage ? (
                    <button type="button" className="text-button" onClick={() => { chooseImage(undefined); if (editingEvent?.imageUrl) setImage({ ...noImageChoice, remove: true }) }}>Remove</button>
                  ) : null}
                  <small className="form-hint">Shown on the event page and members&apos; dashboards. JPG, PNG or WebP, up to 5 MB. A tall poster (4:5) looks best.</small>
                </div>
              </div>
            </div>
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
                {event.imageUrl ? <img className="event-admin-thumb" src={mediaUrl(event.imageUrl) ?? ''} alt="" /> : null}
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
                <p className="form-hint warning">No ticket types yet, so members cannot book this event. <button type="button" className="text-button" onClick={() => openTickets(event)}>Add tickets</button></p>
              ) : null}

              <div className="event-admin-actions">
                <button type="button" className="secondary-button small-button" onClick={() => openTickets(event)}>
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
                        <li key={option.id} className="with-color">
                          <label className="ticket-color-chip" title="Change ticket colour">
                            <input
                              type="color"
                              value={option.color || DEFAULT_TICKET_COLOR}
                              aria-label={`Colour for ${option.label}`}
                              onChange={(changeEvent) => replaceEvent({ ...event, ticketOptions: event.ticketOptions.map((item) => (item.id === option.id ? { ...item, color: changeEvent.target.value } : item)) })}
                              onBlur={(blurEvent) => void runAction(`/api/admin/ticket-types/${option.id}/update/`, (data) => data.event && replaceEvent(data.event), { color: blurEvent.target.value })}
                            />
                          </label>
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
                    <fieldset className="ticket-color-field">
                      <legend>Ticket colour</legend>
                      <div className="ticket-swatches">
                        {TICKET_SWATCHES.map((swatch) => (
                          <button key={swatch} type="button" className={`ticket-swatch${ticketForm.color === swatch ? ' selected' : ''}`} style={{ background: swatch }} aria-label={`Use colour ${swatch}`} aria-pressed={ticketForm.color === swatch} onClick={() => setTicketForm({ ...ticketForm, color: swatch })} />
                        ))}
                        <label className="ticket-swatch custom" title="Pick any colour">
                          <input type="color" value={ticketForm.color} onChange={(changeEvent) => setTicketForm({ ...ticketForm, color: changeEvent.target.value })} aria-label="Pick any colour" />
                        </label>
                        <span className="ticket-color-preview" style={{ background: ticketForm.color }}>{(ticketForm.name || 'Ticket').toUpperCase()}</span>
                      </div>
                      <small className="form-hint">Printed on the guest&apos;s ticket and email, and shown to door staff when it&apos;s scanned.</small>
                    </fieldset>
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
                  <small>Send this to door staff, or let them scan the QR code with their phone. It opens a scanner for this event only, without an admin login.</small>
                </div>
                <input readOnly value={scannerUrl(event.scannerToken)} onFocus={(focusEvent) => focusEvent.target.select()} aria-label={`Check-in link for ${event.title}`} />
                {scannerLinkWarning(scannerUrl(event.scannerToken)) ? <p className="form-hint warning"><Smartphone size={14} /> {scannerLinkWarning(scannerUrl(event.scannerToken))}</p> : null}
                {qrOpenId === event.id ? <ScannerLinkQr link={scannerUrl(event.scannerToken)} /> : null}
                <div className="form-actions">
                  <button type="button" className="secondary-button small-button" onClick={() => setQrOpenId(qrOpenId === event.id ? null : event.id)}>
                    <QrCode size={15} /> {qrOpenId === event.id ? 'Hide QR' : 'Show QR for phone'}
                  </button>
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
