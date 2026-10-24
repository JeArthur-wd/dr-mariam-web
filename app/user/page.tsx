'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowRight, CalendarCheck2, Clock3, HeartHandshake, LogOut, MessageSquareText, ShoppingBag, Sparkles, Star, TrendingUp } from 'lucide-react'
import { SiteFooter, SiteHeader } from '../../components/site-shell'
import { clearSession, fetchCurrentMember, fetchEventDetails, logoutMember, readSession, USER_SESSION_EVENT, type EventDetails, type UserSession } from '../../lib/user-auth'

const userDashboardCards = [
  { title: 'Counseling', description: 'Book a session and receive personal guidance.', href: '/counseling', icon: HeartHandshake, accent: 'pink' },
  { title: 'Singles Forum', description: 'Join conversations and connect with the community.', href: '/forum', icon: MessageSquareText, accent: 'mauve' },
  { title: 'Singles Event', description: 'View event updates, tickets and RSVP details.', href: '/event', icon: Sparkles, accent: 'rose' },
  { title: 'Products', description: 'Browse wellness products and support resources.', href: '/products', icon: ShoppingBag, accent: 'gold' },
] as const

const defaultEventData: EventDetails = {
  title: 'Singles to Mingle 2026',
  date: '27 November 2026',
  venue: 'Sheraton Hotel',
  time: '4:30 PM',
  dressCode: 'Black, Red, White & Pink',
  ticketOptions: [
    { id: null, label: 'Early Bird', price: 'UGX 150,000', amount: 150000, highlight: true },
    { id: null, label: 'Late Ticket', price: 'UGX 200,000', amount: 200000, highlight: false },
  ],
}

export default function UserDashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)
  const [eventData, setEventData] = useState<EventDetails>(defaultEventData)

  useEffect(() => {
    async function bootstrapUser() {
      const storedSession = readSession()
      if (!storedSession?.token) {
        setUser(null)
        return
      }

      try {
        const backendUser = await fetchCurrentMember()
        if (!backendUser) {
          clearSession()
          setUser(null)
          return
        }

        setUser({
          fullName: backendUser.fullName,
          email: backendUser.email,
          token: backendUser.token,
        })
      } catch {
        clearSession()
        setUser(null)
      }

      try {
        const backendEvent = await fetchEventDetails()
        setEventData(backendEvent)
      } catch {
        setEventData(defaultEventData)
      }
    }

    const syncFromSession = () => {
      const storedSession = readSession()
      if (!storedSession?.token) {
        setUser(null)
        return
      }

      void bootstrapUser()
    }

    bootstrapUser()
    window.addEventListener(USER_SESSION_EVENT, syncFromSession)
    return () => window.removeEventListener(USER_SESSION_EVENT, syncFromSession)
  }, [])

  async function handleLogout() {
    await logoutMember()
    setUser(null)
    router.replace('/user')
  }

  const userMetrics = [
    { label: 'Wellness status', value: 'Active', icon: TrendingUp },
    { label: 'Next event', value: eventData.date, icon: Star },
    { label: 'Event time', value: eventData.time, icon: Clock3 },
    { label: 'Venue', value: eventData.venue, icon: CalendarCheck2 },
  ]

  if (!user) {
    return (
      <div className="site-shell">
        <SiteHeader />

        <main className="page-main user-auth-gate">
          <section className="user-auth-card user-gate-card">
            <div className="eyebrow">MEMBER ACCESS</div>
            <h1>Login or create an account</h1>
            <p>Access your personal dashboard, event updates and wellness resources.</p>

            <div className="user-auth-actions">
              <Link href="/user/login" className="secondary-button">Login</Link>
              <Link href="/user/signup" className="user-secondary-button">Sign up</Link>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    )
  }

  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="page-main user-dashboard-shell">
        <section className="user-dashboard-hero">
          <div>
            <div className="eyebrow">WELCOME BACK</div>
            <h1>Hello, {user.fullName}</h1>
            <p>Your wellness space is ready for today’s next step. Continue your journey with support, community, and meaningful events.</p>
          </div>

          <div className="user-dashboard-hero-card">
            <span className="mini-label">Member overview</span>
            <div className="mini-profile">
              <div className="mini-avatar">{user.fullName.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</div>
              <div>
                <strong>{user.fullName}</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <div className="mini-stats">
              <div>
                <span>Next session</span>
                <strong>Thu, 4:30 PM</strong>
              </div>
              <div>
                <span>Focus</span>
                <strong>Wellness</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="user-metrics-grid">
          {userMetrics.map(({ label, value, icon: Icon }) => (
            <article key={label} className="user-metric-card">
              <div className="metric-topline">
                <span>{label}</span>
                <div className="metric-icon"><Icon size={18} /></div>
              </div>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <section className="user-dashboard-grid">
          <div className="user-main-column">
            <div className="user-panel-header">
              <h2>Explore your dashboard</h2>
              <Link href="/user/profile">Manage profile</Link>
            </div>

            <div className="service-grid user-service-grid">
              {userDashboardCards.map(({ title, description, href, icon: Icon, accent }) => (
                <article key={title} className={`service-card home-card dashboard-card ${accent}`}>
                  <div className="service-icon">
                    <Icon size={22} />
                  </div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                  <Link href={href} className="secondary-button">
                    Open <ArrowRight size={16} />
                  </Link>
                </article>
              ))}
            </div>
          </div>

          <aside className="user-side-panel">
            <div className="user-panel-header compact-header">
              <h2>Today’s rhythm</h2>
            </div>

            <div className="side-spotlight">
              <span className="spotlight-kicker">Featured</span>
              <h3>{eventData.title}</h3>
              <p>{eventData.date} · {eventData.venue}</p>
              <Link href="/event" className="secondary-button full-width-button">View event</Link>
            </div>

            <div className="side-list">
              <div>
                <span>Support</span>
                <strong>1:1 counseling</strong>
              </div>
              <div>
                <span>Community</span>
                <strong>Singles forum</strong>
              </div>
              <div>
                <span>Offers</span>
                <strong>Wellness picks</strong>
              </div>
            </div>
          </aside>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
