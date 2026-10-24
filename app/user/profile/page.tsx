'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogOut, Mail, ShieldCheck } from 'lucide-react'
import { BackLink } from '../../../components/back-link'
import { SiteFooter, SiteHeader } from '../../../components/site-shell'
import { clearSession, fetchCurrentMember, logoutMember, readSession, USER_SESSION_EVENT, type UserSession } from '../../../lib/user-auth'

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export default function UserProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)

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

  if (!user) {
    return (
      <div className="site-shell">
        <SiteHeader />

        <main className="page-main user-auth-gate">
          <section className="user-auth-card user-gate-card">
            <div className="eyebrow">MEMBER PROFILE</div>
            <h1>Please log in to view your profile</h1>
            <p>Access your account details, wellness profile and member dashboard from here.</p>

            <div className="user-auth-actions">
              <Link href="/user/login" className="secondary-button">Login</Link>
              <Link href="/user/signup" className="user-secondary-button">Create account</Link>
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

      <main className="page-main user-profile-shell">
        <BackLink fallbackHref="/user" />

        <section className="user-profile-card">
          <div className="user-profile-header">
            <div className="user-profile-meta">
              <div className="user-profile-avatar">{getInitials(user.fullName)}</div>
              <div>
                <div className="eyebrow">PROFILE</div>
                <h1>{user.fullName}</h1>
                <p>Member account</p>
              </div>
            </div>

            <button type="button" className="planner-ghost-button user-logout" onClick={handleLogout}>
              <LogOut size={16} /> Logout
            </button>
          </div>

          <div className="user-profile-grid">
            <div className="user-profile-detail">
              <span>Full name</span>
              <strong>{user.fullName}</strong>
            </div>

            <div className="user-profile-detail">
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>

            <div className="user-profile-detail">
              <span>Role</span>
              <strong>Member</strong>
            </div>

            <div className="user-profile-detail">
              <span>Access</span>
              <strong>Dashboard enabled</strong>
            </div>
          </div>

          <div className="user-profile-actions">
            <Link href="/user" className="secondary-button">
              <ShieldCheck size={16} /> Go to dashboard
            </Link>
            <a href={`mailto:${user.email}`} className="secondary-button">
              <Mail size={16} /> Email profile
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
