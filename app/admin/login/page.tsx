'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { loginAdmin, saveAdminSession } from '../../../lib/user-auth'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const admin = await loginAdmin({ email: email.trim().toLowerCase(), password })
      saveAdminSession({ fullName: admin.fullName, email: admin.email, token: admin.token })
      router.push('/admin')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to sign in with the provided credentials.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="planner-shell">
      <div className="planner-login-card user-auth-card">
        <div className="planner-login-brand">
          <div className="planner-badge"><ShieldCheck size={20} /></div>
          <div>
            <p className="planner-kicker">Admin login</p>
            <h1>Welcome back, admin</h1>
          </div>
        </div>

        <form className="planner-form" onSubmit={handleSubmit}>
          <label>
            Work email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@drmariam.com" required />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required />
          </label>

          {error && <div className="planner-error">{error}</div>}

          <button type="submit" className="planner-primary-button" disabled={isSubmitting}>
            <LockKeyhole size={18} /> {isSubmitting ? 'Signing in…' : 'Login to admin dashboard'}
          </button>
        </form>

        <div className="user-auth-footer">
          <span>Need an account?</span>
          <Link href="/admin/signup">Create admin account</Link>
        </div>
      </div>
    </div>
  )
}
