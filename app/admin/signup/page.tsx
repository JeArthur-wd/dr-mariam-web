'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { registerAdmin, saveAdminSession } from '../../../lib/user-auth'
import { BackLink } from '../../../components/back-link'

export default function AdminSignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!fullName.trim()) {
      setError('Please enter the admin full name.')
      return
    }

    if (password.length < 6) {
      setError('Password should be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please confirm them again.')
      return
    }

    setIsSubmitting(true)

    try {
      const admin = await registerAdmin({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password })
      saveAdminSession({ fullName: admin.fullName, email: admin.email, token: admin.token })
      router.push('/admin')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to create the admin account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="planner-shell">
      <div className="planner-login-card user-auth-card">
        <BackLink fallbackHref="/" />
        <div className="planner-login-brand">
          <div className="planner-badge"><UserPlus size={20} /></div>
          <div>
            <p className="planner-kicker">Admin signup</p>
            <h1>Create your admin account</h1>
          </div>
        </div>

        <form className="planner-form" onSubmit={handleSubmit}>
          <label>
            Full name
            <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Jane Doe" required />
          </label>

          <label>
            Work email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@drmariam.com" required />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" required />
          </label>

          <label>
            Confirm password
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" required />
          </label>

          {error && <div className="planner-error">{error}</div>}

          <button type="submit" className="planner-primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create admin account'}
          </button>
        </form>

        <div className="user-auth-footer">
          <span>Already have an admin account?</span>
          <Link href="/admin/login">Login here</Link>
        </div>
      </div>
    </div>
  )
}
