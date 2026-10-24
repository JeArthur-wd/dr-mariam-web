'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LockKeyhole, UserRound } from 'lucide-react'
import { loginMember, saveSession } from '../../../lib/user-auth'
import { BackLink } from '../../../components/back-link'

export default function UserLoginPage() {
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
      const member = await loginMember({ email, password })
      saveSession({ fullName: member.fullName, email: member.email, token: member.token })
      router.push('/user')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Incorrect email or password. Please try again or create a new account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="planner-shell">
      <div className="planner-login-card user-auth-card">
        <BackLink fallbackHref="/" />
        <div className="planner-login-brand">
          <div className="planner-badge"><UserRound size={20} /></div>
          <div>
            <p className="planner-kicker">Member login</p>
            <h1>Welcome back</h1>
          </div>
        </div>

        <form className="planner-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required />
          </label>

          {error && <div className="planner-error">{error}</div>}

          <button type="submit" className="planner-primary-button" disabled={isSubmitting}>
            <LockKeyhole size={18} /> {isSubmitting ? 'Logging in…' : 'Login to my dashboard'}
          </button>
        </form>

        <div className="user-auth-footer">
          <span>New here?</span>
          <Link href="/user/signup">Create an account</Link>
        </div>
      </div>
    </div>
  )
}
