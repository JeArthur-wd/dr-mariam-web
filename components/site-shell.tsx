'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Heart, LogOut, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { navItems } from '../lib/site-data'
import { logoutMember, readSession, USER_SESSION_EVENT, type UserSession } from '../lib/user-auth'

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function SiteHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<UserSession | null>(null)

  useEffect(() => {
    const syncSession = () => setSession(readSession())
    syncSession()

    window.addEventListener('storage', syncSession)
    window.addEventListener(USER_SESSION_EVENT, syncSession)
    return () => {
      window.removeEventListener('storage', syncSession)
      window.removeEventListener(USER_SESSION_EVENT, syncSession)
    }
  }, [pathname])

  async function handleLogout() {
    await logoutMember()
    setSession(null)
    router.push('/user')
  }

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Dr Mariam Nagujja Ladies Guide home">
        <span className="brand-mark"><Heart size={17} fill="currentColor" strokeWidth={0} /></span>
        <span>Dr Mariam Nagujja Ladies Guide</span>
      </Link>

      <button
        className="menu-button"
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((previous) => !previous)}
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <div className="header-actions">
        <nav className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={pathname === item.href ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-auth-actions">
          {session ? (
            <>
              <Link href="/user/profile" className="header-profile-button" onClick={() => setMenuOpen(false)}>
                <span className="header-profile-avatar">{getInitials(session.fullName)}</span>
                <span className="header-button-label">{session.fullName.split(' ')[0]}</span>
              </Link>
              <button type="button" className="header-logout-button" onClick={handleLogout}>
                <LogOut size={15} /> <span className="header-button-label">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/user/login" className="header-login-button" onClick={() => setMenuOpen(false)}>
                Login
              </Link>
              <Link href="/user/signup" className="header-signup-button" onClick={() => setMenuOpen(false)}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer>
      <span>© 2026 Dr Mariam Nagujja Ladies Guide</span>
      <span>Love, connection &amp; meaningful conversations</span>
    </footer>
  )
}
