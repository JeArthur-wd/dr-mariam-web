import type { MobileMoneyNetwork } from '../lib/user-auth'

/** Network marks drawn in each provider's colours; swap in the official logo files if you have permission to use them. */
export function MobileMoneyMark({ network }: { network: MobileMoneyNetwork }) {
  if (network === 'MTN Mobile Money') {
    return (
      <span className="momo-mark mtn" aria-hidden="true">
        <svg viewBox="0 0 48 32" width="48" height="32">
          <ellipse cx="24" cy="16" rx="21" ry="12" fill="none" stroke="#1d1d1b" strokeWidth="2.5" />
          <text x="24" y="20.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="12" fontWeight="800" fill="#1d1d1b">MTN</text>
        </svg>
      </span>
    )
  }

  return (
    <span className="momo-mark airtel" aria-hidden="true">
      <svg viewBox="0 0 48 32" width="48" height="32">
        <path d="M24 7c-6 0-10 4-10 8.5 0 3.6 2.6 6.5 6.4 6.5 3.4 0 5.6-2.3 5.6-5.1 0-2.2-1.6-3.9-3.7-3.9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <text x="24" y="29" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="7.5" fontWeight="800" fill="#fff">airtel</text>
      </svg>
    </span>
  )
}
