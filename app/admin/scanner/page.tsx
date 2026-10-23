'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, QrCode, ScanLine, ShieldAlert } from 'lucide-react'
import { adminApiRequest } from '../../../lib/user-auth'

type ScanResult = {
  name: string
  ticket: string
  status: string
  rawCode?: string
}

export default function AdminScannerPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [ticketCode, setTicketCode] = useState('SM-2026-VIP-001')
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')

  async function validateTicket(code: string) {
    const cleanCode = code.trim()
    if (!cleanCode) {
      setLastScan({ name: 'Unknown guest', ticket: 'Missing code', status: 'Rejected' })
      return
    }

    try {
      const data = await adminApiRequest<{ guest?: { name?: string; ticket?: string; status?: string } }>('/api/admin/scanner/validate/', {
        method: 'POST',
        body: JSON.stringify({ ticketCode: cleanCode, checkIn: true }),
      })

      const guest = data.guest ?? {}
      const guestStatus = guest.status === 'checked_in' ? 'Checked In' : guest.status || 'Approved'
      const nextScan = {
        name: guest.name ?? 'Guest found',
        ticket: guest.ticket ?? cleanCode,
        status: guestStatus,
        rawCode: cleanCode,
      }

      setLastScan(nextScan)
      setTicketCode(cleanCode)
    } catch {
      setLastScan({ name: 'Unknown guest', ticket: 'Network error', status: 'Rejected', rawCode: cleanCode })
    }
  }

  const ticketMatch = useMemo(
    () => lastScan && lastScan.name !== 'Unknown guest' && lastScan.ticket !== 'Not found' && lastScan.ticket !== 'Network error',
    [lastScan],
  )

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not support live camera scanning. Please enter the ticket code manually.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraReady(true)
      setCameraError('')
      setIsScanning(true)
    } catch {
      setCameraError('Camera access was blocked. You can still scan by entering the ticket code manually.')
      setIsScanning(false)
    }
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (!isScanning || !cameraReady || typeof window === 'undefined') {
      return
    }

    const BarcodeDetectorCtor = (window as any).BarcodeDetector
    if (!BarcodeDetectorCtor) {
      return
    }

    const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] })
    const intervalId = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        return
      }

      try {
        const barcodes = await detector.detect(videoRef.current)
        const found = barcodes[0]?.rawValue?.trim()
        if (found) {
          setTicketCode(found)
          await validateTicket(found)
        }
      } catch {
        // Ignore detection errors and continue scanning.
      }
    }, 1200)

    return () => window.clearInterval(intervalId)
  }, [cameraReady, isScanning])

  return (
    <div className="scanner-page-shell">
      <div className="scanner-header">
        <Link href="/admin" className="secondary-button small-button">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
        <div>
          <p className="eyebrow">ENTRANCE CHECK-IN</p>
          <h1>QR ticket scanner</h1>
        </div>
      </div>

      <div className="scanner-layout">
        <section className="scanner-camera-panel">
          <div className="scanner-camera-frame">
            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: cameraReady ? 1 : 0.75 }} />
            <div className="scanner-focus" />
            {!cameraReady ? (
              <div className="scanner-qr-box">
                <QrCode size={54} />
              </div>
            ) : null}
          </div>
          {cameraError ? <p className="scanner-error">{cameraError}</p> : null}
          <button type="button" className="primary-button" onClick={startCamera}>
            <ScanLine size={16} /> {cameraReady ? 'Restart camera' : 'Start camera'}
          </button>
        </section>

        <aside className="scanner-sidebar">
          <div className="scanner-panel-card">
            <span className="mini-label">Live validation</span>
            <h2>Scan a guest ticket</h2>

            <label className="scanner-field">
              Ticket code
              <input value={ticketCode} onChange={(event) => setTicketCode(event.target.value)} placeholder="SM-2026-VIP-001" />
            </label>

            <button type="button" className="primary-button" onClick={() => void validateTicket(ticketCode)}>
              <ScanLine size={16} /> Validate entry
            </button>

            <div className={`scan-result ${ticketMatch ? 'success' : 'warning'}`}>
              {ticketMatch ? (
                <>
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>{lastScan?.name}</strong>
                    <span>{lastScan?.ticket} · {lastScan?.status}</span>
                  </div>
                </>
              ) : (
                <>
                  <ShieldAlert size={18} />
                  <div>
                    <strong>{lastScan?.name ?? 'Ticket not found'}</strong>
                    <span>{lastScan?.ticket ?? 'Guest is not in the verified list.'}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="scanner-panel-card">
            <span className="mini-label">Latest scan</span>
            <h3>{lastScan?.name ?? 'No scan yet'}</h3>
            <p>{lastScan?.ticket ?? 'Awaiting guest validation'}</p>
            <span className={`attendance-status ${lastScan?.status === 'Checked In' ? 'paid' : 'pending'}`}>
              {lastScan?.status ?? 'Pending'}
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}
