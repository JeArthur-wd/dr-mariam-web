'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowLeft, CalendarDays, Check, Clock3, MapPin, MessageCircle, Shirt, Ticket, X, Zap } from 'lucide-react'
import { SiteFooter, SiteHeader } from '../../components/site-shell'
import { contactLinks, whatsappLink } from '../../lib/site-data'
import { fetchCurrentMember, fetchEventDetails, fetchReservation, initiatePayment, readSession, reserveTicket, type EventDetails, type ReservationPayload, type UserSession } from '../../lib/user-auth'

type ReservationDraft = {
  fullName: string
  phone: string
  email: string
}

export default function EventPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)
  const [eventData, setEventData] = useState<EventDetails>({
    title: 'Singles to Mingle 2026',
    date: '27 November 2026',
    venue: 'Sheraton Hotel',
    time: '4:30 PM',
    dressCode: 'Black, Red, White & Pink',
    ticketOptions: [
      { label: 'Early Bird', price: 'UGX 150,000', highlight: true },
      { label: 'Late Ticket', price: 'UGX 200,000', highlight: false },
    ],
  })
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [ticketType, setTicketType] = useState('Early Bird — UGX 150,000')
  const [paymentMethod, setPaymentMethod] = useState<'MTN Mobile Money' | 'Airtel Money'>('MTN Mobile Money')
  const [reservation, setReservation] = useState<ReservationDraft | null>(null)
  const [paymentError, setPaymentError] = useState('')
  const [isPaying, setIsPaying] = useState(false)
  const [ticketInfo, setTicketInfo] = useState<ReservationPayload | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')

  useEffect(() => {
    if (!ticketInfo?.ticket.qrPayload || !['paid', 'confirmed'].includes(ticketInfo.status)) {
      setQrCodeDataUrl('')
      return
    }

    QRCode.toDataURL(ticketInfo.ticket.qrPayload)
      .then((dataUrl: string) => setQrCodeDataUrl(dataUrl))
      .catch(() => setQrCodeDataUrl(''))
  }, [ticketInfo])

  useEffect(() => {
    if (!ticketInfo || ticketInfo.status !== 'pending') return

    const interval = window.setInterval(async () => {
      try {
        const response = await fetchReservation(ticketInfo.id)
        setTicketInfo(response.reservation)
      } catch {
        // Keep checking while the payment provider completes the transaction.
      }
    }, 5000)

    return () => window.clearInterval(interval)
  }, [ticketInfo])

  useEffect(() => {
    async function verifyAccess() {
      const activeUser = readSession()
      if (!activeUser?.token) {
        setUser(null)
        setCheckingAccess(false)
        router.replace('/user/login')
        return
      }

      try {
        const backendUser = await fetchCurrentMember()
        if (!backendUser) {
          setUser(null)
          setCheckingAccess(false)
          router.replace('/user/login')
          return
        }

        setUser({
          fullName: backendUser.fullName,
          email: backendUser.email,
          token: backendUser.token,
        })
      } catch {
        setUser(null)
        setCheckingAccess(false)
        router.replace('/user/login')
        return
      }

      try {
        const eventResponse = await fetchEventDetails()
        if (eventResponse) {
          setEventData(eventResponse)
        }
      } catch {
        // Keep the static fallback event if the backend is unavailable.
      }

      setCheckingAccess(false)
    }

    verifyAccess()
  }, [router])

  if (checkingAccess) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="page-main user-auth-gate">
          <section className="user-auth-card user-gate-card">
            <div className="eyebrow">ACCESS REQUIRED</div>
            <h1>Checking member access...</h1>
            <p>Please wait while we verify your account before you can view the event.</p>
          </section>
        </main>
        <SiteFooter />
      </div>
    )
  }

  if (!user) {
    return null
  }

  function openReservation() {
    setSubmitted(false)
    setPaymentError('')
    setTicketInfo(null)
    setReservation(null)
    setModalOpen(true)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const selectedTicket = String(form.get('ticket') || 'Early Bird — UGX 150,000')
    setReservation({
      fullName: String(form.get('name') || user?.fullName || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      email: String(form.get('email') || user?.email || '').trim(),
    })
    setTicketType(selectedTicket)
    setPaymentError('')
    setModalOpen(false)
    setCheckoutOpen(true)
  }

  async function completePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const paymentPhone = String(form.get('paymentPhone') || '')
    const selectedMethod = paymentMethod
    const fullName = reservation?.fullName || user?.fullName || ''
    const phone = reservation?.phone || paymentPhone
    const email = reservation?.email || user?.email || ''

    setPaymentError('')
    setIsPaying(true)

    try {
      let activeReservation = ticketInfo
      if (!activeReservation) {
        const reservationResponse = await reserveTicket({
          fullName,
          phone,
          email,
          ticketType,
          paymentMethod: selectedMethod,
          paymentPhone,
        })
        activeReservation = reservationResponse.reservation
        setTicketInfo(activeReservation)
      }

      await initiatePayment({
        reservationId: activeReservation.id,
        fullName,
        phoneNumber: paymentPhone,
        ticketType: ticketType,
        amount: ticketType.replace(/[^0-9]/g, ''),
        paymentMethod: selectedMethod,
      })

      setCheckoutOpen(false)
      setSubmitted(true)
      setModalOpen(true)
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'We could not send your payment request. Please try again.')
    } finally {
      setIsPaying(false)
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="page-main event-page-main">
        <section className="event-intro" id="event">
          <div className="eyebrow">THE ULTIMATE SINGLES EXPERIENCE</div>
          <h1>{eventData.title}</h1>
          <p className="intro-copy">Reserve your place today</p>
        </section>

        <section className="event-layout" aria-label="Event details">
          <div className="poster-wrap">
            <div className="poster-glow" />
            <img src="/event-poster.jpg" alt={eventData.title} className="poster" />
          </div>
          <div className="details-column">
            <div className="details-card">
              <div className="detail-item"><span className="detail-icon"><CalendarDays size={20} /></span><div><span className="detail-label">DATE</span><strong>{eventData.date}</strong></div></div>
              <div className="detail-item"><span className="detail-icon"><MapPin size={20} /></span><div><span className="detail-label">VENUE</span><strong>{eventData.venue}</strong></div></div>
              <div className="detail-item"><span className="detail-icon"><Clock3 size={20} /></span><div><span className="detail-label">TIME</span><strong>{eventData.time}</strong></div></div>
              <div className="detail-item"><span className="detail-icon"><Shirt size={20} /></span><div><span className="detail-label">DRESS CODE</span><strong>{eventData.dressCode}</strong></div></div>
            </div>

            <div className="ticket-heading"><Ticket size={20} /> <h2>Ticket Prices</h2></div>
            <div className="ticket-grid">
              {eventData.ticketOptions.map((ticket) => (
                <article key={ticket.label} className={ticket.highlight ? 'ticket-card featured' : 'ticket-card'}>
                  <div className="ticket-badge">
                    {ticket.highlight ? <Zap size={13} fill="currentColor" /> : <Clock3 size={13} />} {ticket.label.toUpperCase()}
                  </div>
                  <span className="ticket-caption">{ticket.highlight ? 'BEST VALUE' : 'STANDARD'}</span>
                  <span className="currency">UGX</span>
                  <strong className="price">{ticket.price.replace('UGX ', '')}</strong>
                  <p>{ticket.highlight ? 'Limited slots available' : 'Available until the event'}</p>
                </article>
              ))}
            </div>
            <button className="reserve-button" onClick={openReservation}><Ticket size={18} /> Reserve Your Place</button>
          </div>
        </section>

        <section className="help-card">
          <div className="help-icon"><MessageCircle size={24} /></div>
          <div><h2>Need More Help?</h2><p>Contact us directly and we&apos;ll be happy to assist you.</p></div>
          <div className="contact-links">{contactLinks.map((contact) => (
            <a key={contact.label} href={contact.href}><MessageCircle size={17} /> {contact.label}</a>
          ))}</div>
        </section>
      </main>

      <SiteFooter />

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setModalOpen(false) }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reserve-title">
            <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close dialog"><X size={20} /></button>
            {submitted ? (
              <div className="success-state" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="success-icon"><Check size={28} /></div>
                <h2>{ticketInfo && ['paid', 'confirmed'].includes(ticketInfo.status) ? 'Your ticket is confirmed' : 'Payment request sent'}</h2>
                <p>{ticketInfo && ['paid', 'confirmed'].includes(ticketInfo.status) ? `Your ticket has been emailed to ${ticketInfo.email}.` : 'Approve the payment prompt on your phone. Your ticket will be emailed automatically after the provider confirms payment.'}</p>

                {ticketInfo && ['paid', 'confirmed'].includes(ticketInfo.status) && (
                  <div style={{ display: 'grid', gap: '1rem', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px', background: 'rgba(255,255,255,0.03)' }}>
                    {qrCodeDataUrl ? (
                      <img src={qrCodeDataUrl} alt="Event ticket QR code" style={{ width: '180px', height: '180px', margin: '0 auto', background: '#fff', borderRadius: '14px', padding: '0.75rem' }} />
                    ) : (
                      <div style={{ width: '180px', height: '180px', margin: '0 auto', borderRadius: '14px', display: 'grid', placeItems: 'center', background: '#fff', color: '#1d1b2e', fontWeight: 700 }}>QR</div>
                    )}

                    <div style={{ display: 'grid', gap: '0.35rem', textAlign: 'left' }}>
                      <strong>{ticketInfo.fullName}</strong>
                      <span>{ticketInfo.email}</span>
                      <span>{ticketInfo.ticketType}</span>
                      <span>Ticket code: {ticketInfo.ticket.ticketCode}</span>
                    </div>
                  </div>
                )}

                <button className="reserve-button" onClick={() => setModalOpen(false)}>Done</button>
              </div>
            ) : (
              <>
                <div className="modal-kicker">SECURE YOUR PLACE</div>
                <h2 id="reserve-title">Reserve your ticket</h2>
                <p className="modal-copy">Enter your details to continue to mobile money payment.</p>
                <form onSubmit={handleSubmit}>
                  <label>Full name<input required name="name" defaultValue={user.fullName} placeholder="Your full name" /></label>
                  <label>Email address<input required name="email" type="email" defaultValue={user.email} placeholder="you@example.com" /></label>
                  <label>Phone number<input required name="phone" type="tel" inputMode="tel" placeholder="+256 700 000 000" /></label>
                  <label>Ticket type<select name="ticket" defaultValue={ticketType}>{eventData.ticketOptions.map((ticket) => <option key={ticket.label} value={`${ticket.label} — ${ticket.price}`}>{ticket.label} — {ticket.price}</option>)}</select></label>
                  <button className="reserve-button" type="submit">Continue to Payment</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <button className="modal-close" onClick={() => setCheckoutOpen(false)} aria-label="Close payment dialog"><X size={20} /></button>
            <div className="modal-kicker">PAYMENT</div>
            <h2 id="payment-title">Pay for your ticket</h2>
            <p className="modal-copy"><strong>{ticketType}</strong><br />Choose your mobile money network. You will receive a payment prompt on your phone.</p>
            <form onSubmit={completePayment}>
              <fieldset className="payment-options">
                <legend>Payment method</legend>
                <label className="payment-option"><input required type="radio" name="network" value="MTN Mobile Money" checked={paymentMethod === 'MTN Mobile Money'} onChange={() => setPaymentMethod('MTN Mobile Money')} /><span><strong>MTN Mobile Money</strong><small>Pay securely with MTN</small></span></label>
                <label className="payment-option"><input required type="radio" name="network" value="Airtel Money" checked={paymentMethod === 'Airtel Money'} onChange={() => setPaymentMethod('Airtel Money')} /><span><strong>Airtel Money</strong><small>Pay securely with Airtel</small></span></label>
              </fieldset>
              <label>Mobile money number<input required name="paymentPhone" type="tel" inputMode="tel" defaultValue={reservation?.phone} placeholder="+256 700 000 000" /></label>
              {paymentError && <div className="form-error" role="alert"><p>{paymentError}</p><a href={whatsappLink('Hello, I need help reserving a Singles to Mingle ticket.')} target="_blank" rel="noreferrer">Contact us on WhatsApp</a></div>}
              <button className="reserve-button" type="submit" disabled={isPaying}>{isPaying ? 'Sending payment request…' : `Pay via ${paymentMethod}`}</button>
            </form>
            <p className="payment-note">Your payment request will be sent through {paymentMethod} for manual confirmation and secure checkout processing.</p>
          </div>
        </div>
      )}
    </div>
  )
}
