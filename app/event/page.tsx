'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarDays, Check, Clock3, MapPin, MessageCircle, Minus, Plus, Shirt, Ticket, X, Zap } from 'lucide-react'
import { BackLink } from '../../components/back-link'
import { MobileMoneyMark } from '../../components/mobile-money-mark'
import { SiteFooter, SiteHeader } from '../../components/site-shell'
import { DEFAULT_TICKET_COLOR, TicketPass } from '../../components/ticket-pass'
import { contactLinks, whatsappLink } from '../../lib/site-data'
import { fetchCurrentMember, fetchEventDetails, fetchReservation, initiatePayment, mediaUrl, readSession, reserveTicket, type EventDetails, type MobileMoneyNetwork, type ReservationPayload, type TicketOption, type UserSession } from '../../lib/user-auth'

const MAX_TICKETS = 10
const NETWORKS: MobileMoneyNetwork[] = ['MTN Mobile Money', 'Airtel Money']
const PAID = ['paid', 'confirmed', 'checked_in']

type Step = 'details' | 'payment' | 'done'

function formatUgx(amount: number) {
  return `UGX ${amount.toLocaleString('en-US')}`
}

export default function EventPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)
  const [eventData, setEventData] = useState<EventDetails | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [guestNames, setGuestNames] = useState<string[]>([''])
  const [contact, setContact] = useState({ phone: '' })
  const [network, setNetwork] = useState<MobileMoneyNetwork>('MTN Mobile Money')
  const [paymentPhone, setPaymentPhone] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [order, setOrder] = useState<ReservationPayload | null>(null)

  const ticketOptions = eventData?.ticketOptions ?? []
  const onSale = Boolean(eventData?.id) && ticketOptions.some((option) => option.id !== null)
  const selectedTicket: TicketOption | undefined = ticketOptions.find((option) => option.id === selectedTicketId) ?? ticketOptions[0]
  const remaining = eventData?.ticketsRemaining ?? MAX_TICKETS
  const maxQuantity = Math.max(Math.min(MAX_TICKETS, remaining), 1)
  const total = (selectedTicket?.amount ?? 0) * quantity
  const orderPaid = order ? PAID.includes(order.status) : false

  useEffect(() => {
    async function verifyAccess() {
      if (!readSession()?.token) {
        router.replace('/user/login')
        return
      }

      try {
        const backendUser = await fetchCurrentMember()
        if (!backendUser) {
          router.replace('/user/login')
          return
        }
        setUser({ fullName: backendUser.fullName, email: backendUser.email, token: backendUser.token })
      } catch {
        router.replace('/user/login')
        return
      }

      try {
        const details = await fetchEventDetails()
        setEventData(details)
        setSelectedTicketId(details.ticketOptions.find((option) => option.highlight)?.id ?? details.ticketOptions[0]?.id ?? null)
      } catch {
        setEventData(null)
      }
      setCheckingAccess(false)
    }

    void verifyAccess()
  }, [router])

  // Keep checking while the member approves the mobile money prompt.
  useEffect(() => {
    if (!order || order.status !== 'pending' || step !== 'done') return
    const interval = window.setInterval(async () => {
      try {
        const response = await fetchReservation(order.id)
        setOrder(response.reservation)
      } catch {
        // The provider may still be processing; try again on the next tick.
      }
    }, 5000)
    return () => window.clearInterval(interval)
  }, [order, step])

  if (checkingAccess || !user) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="page-main user-auth-gate">
          <section className="user-auth-card user-gate-card">
            <h1>Checking member access…</h1>
            <p>Please wait while we verify your account before you can view the event.</p>
          </section>
        </main>
        <SiteFooter />
      </div>
    )
  }

  function changeQuantity(next: number) {
    const clamped = Math.min(Math.max(next, 1), maxQuantity)
    setQuantity(clamped)
    setGuestNames((names) => Array.from({ length: clamped }, (_, index) => names[index] ?? ''))
  }

  function openReservation(ticketId?: number | null) {
    if (ticketId !== undefined) setSelectedTicketId(ticketId)
    setQuantity(1)
    setGuestNames([user?.fullName ?? ''])
    setContact({ phone: '' })
    setOrder(null)
    setFormError('')
    setStep('details')
  }

  function closeModal() {
    setStep(null)
    setFormError('')
  }

  function continueToPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guestNames.some((name) => !name.trim())) {
      setFormError('Enter a name for every ticket. Each guest’s name is printed in their QR code.')
      return
    }
    setPaymentPhone((current) => current || contact.phone)
    setFormError('')
    setStep('payment')
  }

  async function completePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTicket?.id || !user) return
    setFormError('')
    setIsSubmitting(true)

    try {
      // Reuse the reservation if only the payment step failed, so a retry does not book twice.
      let activeOrder = order
      if (!activeOrder) {
        const response = await reserveTicket({
          fullName: user.fullName,
          email: user.email,
          phone: contact.phone.trim(),
          ticketTypeId: selectedTicket.id,
          quantity,
          guestNames: guestNames.map((name) => name.trim()),
          paymentMethod: network,
          paymentPhone,
        })
        activeOrder = response.reservation
        setOrder(activeOrder)
      }

      await initiatePayment({ reservationId: activeOrder.id, phoneNumber: paymentPhone, paymentMethod: network })
      setStep('done')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'We could not send your payment request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="page-main event-page-main">
        <BackLink fallbackHref="/user" />

        <section className="event-intro" id="event">
          <div className="eyebrow">THE ULTIMATE SINGLES EXPERIENCE</div>
          <h1>{eventData?.title ?? 'Singles Event'}</h1>
          <p className="intro-copy">{onSale ? 'Choose your ticket and reserve your place.' : 'Tickets are not on sale yet. Check back soon.'}</p>
        </section>

        <section className="event-layout" aria-label="Event details">
          <div className="poster-wrap">
            <div className="poster-glow" />
            <img src={mediaUrl(eventData?.imageUrl) ?? '/event-poster.jpg'} alt={eventData?.title ?? 'Event poster'} className="poster" />
          </div>
          <div className="details-column">
            {eventData ? (
              <div className="details-card">
                <div className="detail-item"><span className="detail-icon"><CalendarDays size={20} /></span><div><span className="detail-label">DATE</span><strong>{eventData.date}</strong></div></div>
                <div className="detail-item"><span className="detail-icon"><MapPin size={20} /></span><div><span className="detail-label">VENUE</span><strong>{eventData.venue}</strong></div></div>
                <div className="detail-item"><span className="detail-icon"><Clock3 size={20} /></span><div><span className="detail-label">TIME</span><strong>{eventData.time}</strong></div></div>
                <div className="detail-item"><span className="detail-icon"><Shirt size={20} /></span><div><span className="detail-label">DRESS CODE</span><strong>{eventData.dressCode}</strong></div></div>
              </div>
            ) : (
              <div className="form-error" role="alert"><p>We could not load the event details. Please refresh the page.</p></div>
            )}

            <div className="ticket-heading"><Ticket size={20} /> <h2>Choose a ticket</h2></div>
            <div className="ticket-grid" role="radiogroup" aria-label="Ticket type">
              {ticketOptions.map((ticket) => {
                const isSelected = onSale && ticket.id === selectedTicket?.id
                return (
                  <button
                    key={ticket.id ?? ticket.label}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!onSale}
                    className={`ticket-card ticket-option${ticket.highlight ? ' featured' : ''}${isSelected ? ' selected' : ''}`}
                    style={{ '--ticket-color': ticket.color || DEFAULT_TICKET_COLOR } as React.CSSProperties}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <span className="ticket-badge">
                      {ticket.highlight ? <Zap size={13} fill="currentColor" /> : <Clock3 size={13} />} {ticket.label.toUpperCase()}
                    </span>
                    <span className="ticket-check" aria-hidden="true">{isSelected ? <Check size={14} /> : null}</span>
                    <span className="currency">UGX</span>
                    <strong className="price">{ticket.price.replace('UGX ', '')}</strong>
                  </button>
                )
              })}
            </div>
            {onSale && remaining <= 20 ? <p className="tickets-left">{remaining > 0 ? `Only ${remaining} ticket${remaining === 1 ? '' : 's'} left` : 'Sold out'}</p> : null}
            <button className="reserve-button" onClick={() => openReservation()} disabled={!onSale || remaining <= 0}>
              <Ticket size={18} /> {onSale ? `Reserve ${selectedTicket?.label ?? 'ticket'}` : 'Tickets coming soon'}
            </button>
          </div>
        </section>

        <section className="help-card">
          <div className="help-icon"><MessageCircle size={24} /></div>
          <div><h2>Need More Help?</h2><p>Contact us directly and we&apos;ll be happy to assist you.</p></div>
          <div className="contact-links">{contactLinks.map((contactLink) => (
            <a key={contactLink.label} href={contactLink.href}><MessageCircle size={17} /> {contactLink.label}</a>
          ))}</div>
        </section>
      </main>

      <SiteFooter />

      {step && selectedTicket ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && step !== 'payment') closeModal() }}>
          <div className="modal reserve-modal" role="dialog" aria-modal="true" aria-labelledby="reserve-title">
            <button className="modal-close" onClick={closeModal} aria-label="Close dialog"><X size={20} /></button>

            {step === 'details' ? (
              <>
                <h2 id="reserve-title">Reserve your tickets</h2>
                <form onSubmit={continueToPayment}>
                  <label>Ticket type
                    <select value={selectedTicket.id ?? ''} onChange={(event) => setSelectedTicketId(Number(event.target.value))}>
                      {ticketOptions.map((ticket) => <option key={ticket.id} value={ticket.id ?? ''}>{ticket.label} — {ticket.price}</option>)}
                    </select>
                  </label>

                  <div className="quantity-row">
                    <span id="quantity-label">Number of tickets</span>
                    <div className="quantity-stepper" role="group" aria-labelledby="quantity-label">
                      <button type="button" onClick={() => changeQuantity(quantity - 1)} disabled={quantity <= 1} aria-label="Remove a ticket"><Minus size={16} /></button>
                      <output aria-live="polite">{quantity}</output>
                      <button type="button" onClick={() => changeQuantity(quantity + 1)} disabled={quantity >= maxQuantity} aria-label="Add a ticket"><Plus size={16} /></button>
                    </div>
                  </div>

                  <fieldset className="guest-names">
                    <legend>Name on each ticket</legend>
                    {guestNames.map((name, index) => (
                      <label key={index}>
                        <span>Ticket {index + 1}{index === 0 ? ' (you)' : ''}</span>
                        <input
                          required
                          value={name}
                          onChange={(event) => setGuestNames((names) => names.map((current, position) => (position === index ? event.target.value : current)))}
                          placeholder="Guest full name"
                          autoComplete={index === 0 ? 'name' : 'off'}
                        />
                      </label>
                    ))}
                  </fieldset>

                  <p className="ticket-delivery-note">Tickets are emailed to <strong>{user.email}</strong>, the address on your account, as soon as payment is confirmed.</p>
                  <label>Phone number<input required type="tel" inputMode="tel" value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} placeholder="+256 700 000 000" /></label>

                  <div className="order-total"><span>{quantity} × {selectedTicket.label}</span><strong>{formatUgx(total)}</strong></div>
                  {formError ? <div className="form-error" role="alert"><p>{formError}</p></div> : null}
                  <button className="reserve-button" type="submit">Continue to payment</button>
                </form>
              </>
            ) : null}

            {step === 'payment' ? (
              <>
                <h2 id="reserve-title">Pay {formatUgx(total)}</h2>
                <p className="modal-copy">{quantity} × {selectedTicket.label}. You will get a payment prompt on your phone.</p>
                <form onSubmit={completePayment}>
                  <fieldset className="payment-options">
                    <legend>Mobile money network</legend>
                    {NETWORKS.map((option) => (
                      <label key={option} className="payment-option">
                        <input required type="radio" name="network" value={option} checked={network === option} onChange={() => setNetwork(option)} />
                        <MobileMoneyMark network={option} />
                        <span><strong>{option}</strong><small>Approve the prompt with your PIN</small></span>
                      </label>
                    ))}
                  </fieldset>
                  <label>Mobile money number<input required type="tel" inputMode="tel" value={paymentPhone} onChange={(event) => setPaymentPhone(event.target.value)} placeholder="+256 700 000 000" /></label>
                  {formError ? <div className="form-error" role="alert"><p>{formError}</p><a href={whatsappLink(`Hello, I need help reserving ${quantity} ${selectedTicket.label} ticket(s).`)} target="_blank" rel="noreferrer">Contact us on WhatsApp</a></div> : null}
                  <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={() => setStep('details')} disabled={isSubmitting || Boolean(order)}>Back</button>
                    <button className="reserve-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending payment request…' : `Pay with ${network.replace(' Mobile Money', ' MoMo')}`}</button>
                  </div>
                </form>
              </>
            ) : null}

            {step === 'done' && order ? (
              <div className="success-state">
                <div className="success-icon"><Check size={28} /></div>
                <h2 id="reserve-title">{orderPaid ? `Your ticket${order.quantity > 1 ? 's are' : ' is'} confirmed` : 'Approve the payment on your phone'}</h2>
                <p>{orderPaid ? `We also emailed ${order.quantity > 1 ? 'them' : 'it'} to ${order.email}. Each guest shows their own QR code at the entrance. You can find them any time under My tickets.` : `Enter your PIN to pay ${order.totalAmount}. This page updates as soon as the payment is confirmed, and your tickets are emailed to ${order.email}.`}</p>

                {orderPaid ? (
                  <div className="issued-tickets">
                    {order.tickets.map((ticket) => (
                      <TicketPass key={ticket.ticketCode} ticket={ticket} ticketType={order.ticketType} color={order.ticketColor} />
                    ))}
                  </div>
                ) : null}

                <button className="reserve-button" onClick={closeModal}>Done</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
