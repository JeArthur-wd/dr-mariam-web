'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { registerMember, saveSession } from '../../../lib/user-auth'

export default function UserSignupPage() {
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
      setError('Please enter your full name.')
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
      const member = await registerMember({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password })
      saveSession({ fullName: member.fullName, email: member.email, token: member.token })
      router.push('/user')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Registration failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="planner-shell">
      <div className="planner-login-card user-auth-card">
        <div className="planner-login-brand">
          <div className="planner-badge"><UserPlus size={20} /></div>
          <div>
            <p className="planner-kicker">Member signup</p>
            <h1>Create your account</h1>
          </div>
        </div>

        <form className="planner-form" onSubmit={handleSubmit}>
          <label>
            Full name
            <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Jane Doe" required />
          </label>
          <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
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
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="user-auth-footer">
          <span>Already have an account?</span>
          <Link href="/user/login">Login here</Link>
        </div>
      </div>
    </div>
  )
}
