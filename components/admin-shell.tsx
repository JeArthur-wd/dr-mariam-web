'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarPlus, LayoutDashboard, LogOut, ScanLine, Users } from 'lucide-react'
import { logoutAdmin, readAdminSession, type UserSession } from '../lib/user-auth'

const adminNav = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Events', href: '/admin/events', icon: CalendarPlus },
  { label: 'Guests', href: '/admin/guests', icon: Users },
  { label: 'Check-in', href: '/admin/scanner', icon: ScanLine },
] as const

type AdminShellProps = {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function AdminShell({ title, actions, children }: AdminShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [admin, setAdmin] = useState<UserSession | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setAdmin(readAdminSession())
    setChecked(true)
  }, [])

  async function handleLogout() {
    await logoutAdmin()
    router.replace('/admin/login')
  }

  if (!checked) return null

  if (!admin) {
    return (
      <div className="site-shell">
        <main className="page-main user-auth-gate">
          <section className="planner-login-card user-gate-card">
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
          {adminNav.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className={pathname === href ? 'active' : ''} aria-current={pathname === href ? 'page' : undefined}>
              <Icon size={17} /> {label}
            </Link>
          ))}
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

      <main className="admin-main">
        <header className="admin-topbar">
          <h1>{title}</h1>
          {actions ? <div className="admin-topbar-actions">{actions}</div> : null}
        </header>
        {children}
      </main>
    </div>
  )
}
