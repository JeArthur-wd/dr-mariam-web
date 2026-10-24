'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/** Returns to the previous page in this site, or to `fallbackHref` when opened directly. */
export function BackLink({ fallbackHref, label = 'Back', className = 'back-link' }: { fallbackHref: string; label?: string; className?: string }) {
  const router = useRouter()

  function goBack(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const cameFromThisSite = document.referrer.startsWith(window.location.origin)
    if (cameFromThisSite && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <a href={fallbackHref} className={className} onClick={goBack}>
      <ArrowLeft size={17} /> {label}
    </a>
  )
}
