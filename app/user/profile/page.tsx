'use client'

import Link from 'next/link'
import { Ticket } from 'lucide-react'
import { getInitials, UserShell } from '../../../components/user-shell'

export default function UserProfilePage() {
  return (
    <UserShell title="Profile">
      {(user) => (
        <section className="user-profile-card">
          <div className="user-profile-header">
            <div className="user-profile-meta">
              <div className="user-profile-avatar">{getInitials(user.fullName)}</div>
              <div>
                <div className="eyebrow">PROFILE</div>
                <h2>{user.fullName}</h2>
                <p>Member account</p>
              </div>
            </div>
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
              <span>Ticket delivery</span>
              <strong>Tickets are emailed to {user.email} after payment</strong>
            </div>
            <div className="user-profile-detail">
              <span>Role</span>
              <strong>Member</strong>
            </div>
          </div>

          <div className="user-profile-actions">
            <Link href="/user/tickets" className="secondary-button"><Ticket size={16} /> My tickets</Link>
          </div>
        </section>
      )}
    </UserShell>
  )
}
