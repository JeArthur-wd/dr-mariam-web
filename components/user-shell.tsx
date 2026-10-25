'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarHeart, HeartHandshake, Home, LayoutDashboard, LogOut, MessageSquareText, ShoppingBag, Ticket, UserRound } from 'lucide-react'
import { clearSession, fetchCurrentMember, logoutMember, readSession, USER_SESSION_EVENT, type UserSession } from '../lib/user-auth'

const memberNav = [
  { label: 'Dashboard', href: '/user', icon: LayoutDashboard },
  { label: 'My tickets', href: '/user/tickets', icon: Ticket },
  { label: 'Events', href: '/event', icon: CalendarHeart },
  { label: 'Counseling', href: '/counseling', icon: HeartHandshake },
  { label: 'Singles forum', href: '/forum', icon: MessageSquareText },
  { label: 'Products', href: '/products', icon: ShoppingBag },
  { label: 'Profile', href: '/user/profile', icon: UserRound },
] as const

export function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

type UserShellProps = {
  title: string
  actions?: React.ReactNode
  children: (user: UserSession) => React.ReactNode
}

/** Member area layout: sidebar navigation plus a login gate, mirroring the admin portal. */
export function UserShell({ title, actions, children }: UserShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    async function loadUser() {
      if (!readSession()?.token) {
        setUser(null)
        setChecked(true)
        return
      }
      try {
        const member = await fetchCurrentMember()
        if (!member) clearSession()
        setUser(member ? { fullName: member.fullName, email: member.email, token: member.token } : null)
      } catch {
        clearSession()
        setUser(null)
      }
      setChecked(true)
    }

    void loadUser()
    const sync = () => void loadUser()
    window.addEventListener(USER_SESSION_EVENT, sync)
    return () => window.removeEventListener(USER_SESSION_EVENT, sync)
  }, [])

  async function handleLogout() {
    await logoutMember()
    router.replace('/user/login')
  }

  if (!checked) return null

  if (!user) {
    return (
      <div className="site-shell">
        <main className="page-main user-auth-gate">
          <section className="user-auth-card user-gate-card">
            <div className="eyebrow">MEMBER ACCESS</div>
            <h1>Login or create an account</h1>
            <p>Access your personal dashboard, tickets, event updates and wellness resources.</p>
            <div className="user-auth-actions">
              <Link href="/user/login" className="secondary-button">Login</Link>
              <Link href="/user/signup" className="user-secondary-button">Sign up</Link>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-shell member-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>Dr Mariam</strong>
            <span>Member area</span>
          </div>
        </Link>

        <nav className="admin-nav" aria-label="Member navigation">
          {memberNav.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className={pathname === href ? 'active' : ''} aria-current={pathname === href ? 'page' : undefined}>
              <Icon size={17} /> {label}
            </Link>
          ))}
        </nav>

        <div className="admin-profile-card">
          <div className="mini-profile">
            <div className="mini-avatar">{getInitials(user.fullName)}</div>
            <div>
              <strong>{user.fullName}</strong>
              <small>{user.email}</small>
            </div>
          </div>
          <Link href="/" className="admin-logout-button"><Home size={16} /> Back to site</Link>
          <button type="button" className="admin-logout-button" onClick={() => void handleLogout()}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <h1>{title}</h1>
          {actions ? <div className="admin-topbar-actions">{actions}</div> : null}
        </header>
        {children(user)}
      </main>
    </div>
  )
}
