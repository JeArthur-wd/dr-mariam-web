'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, QrCode, ScanLine, ShieldAlert } from 'lucide-react'
import type { ScanEvent, ScanResponse } from '../lib/user-auth'

type ScanOutcome = { tone: 'success' | 'warning' | 'danger'; title: string; detail: string; color?: string; ticket?: string }

const SAME_CODE_COOLDOWN_MS = 4000

function describe(response: ScanResponse): ScanOutcome {
  const outcome = describeResult(response)
  // The ticket colour lets door staff confirm the ticket type at a glance.
  return response.guest ? { ...outcome, color: response.guest.ticketColor, ticket: response.guest.ticket } : outcome
}

function describeResult(response: ScanResponse): ScanOutcome {
  const guest = response.guest
  const who = guest ? `${guest.name} · ${guest.ticket}` : ''
  switch (response.result) {
    case 'checked_in':
      return { tone: 'success', title: `Welcome, ${guest?.name ?? 'guest'}`, detail: `${guest?.ticket ?? ''} · ${guest?.ticketCode ?? ''}` }
    case 'valid':
      return { tone: 'success', title: 'Valid ticket', detail: who }
    case 'already_checked_in':
      return { tone: 'warning', title: 'Already used', detail: `${who}${guest?.checkedInAt ? ` · checked in at ${new Date(guest.checkedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}` }
    case 'unpaid':
      return { tone: 'danger', title: 'Not paid', detail: `${who} · payment has not been confirmed` }
    case 'wrong_event':
      return { tone: 'danger', title: 'Wrong event', detail: `${who} · ticket is for ${guest?.eventTitle || 'another event'}` }
    default:
      return { tone: 'danger', title: 'Ticket not found', detail: response.error ?? 'This code is not in the guest list.' }
  }
}

type TicketScannerProps = {
  onScan: (code: string) => Promise<ScanResponse>
  event?: ScanEvent | null
}

export function TicketScanner({ onScan, event }: TicketScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const busyRef = useRef(false)
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null)

  const [manualCode, setManualCode] = useState('')
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [counts, setCounts] = useState<ScanEvent | null>(event ?? null)

  useEffect(() => {
    if (event) setCounts(event)
  }, [event])

  const submit = useCallback(async (raw: string) => {
    const code = raw.trim()
    if (!code || busyRef.current) return
    // A QR held in front of the camera is read many times a second; only act on it once.
    const last = lastCodeRef.current
    if (last && last.code === code && Date.now() - last.at < SAME_CODE_COOLDOWN_MS) return
    lastCodeRef.current = { code, at: Date.now() }

    busyRef.current = true
    try {
      const response = await onScan(code)
      setOutcome(describe(response))
      if (response.event) setCounts(response.event)
      if (response.result === 'checked_in' && 'vibrate' in navigator) navigator.vibrate(120)
    } catch (error) {
      setOutcome({ tone: 'danger', title: 'Could not check ticket', detail: error instanceof Error ? error.message : 'Check the connection and try again.' })
    } finally {
      busyRef.current = false
    }
  }, [onScan])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot use the camera. Type the ticket code below instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraError('')
      setCameraOn(true)
    } catch {
      setCameraError('Camera access was blocked. Allow camera access in the browser settings, or type the ticket code below.')
    }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  useEffect(() => {
    if (!cameraOn) return
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null
    let jsQR: typeof import('jsqr').default | null = null
    if (!detector) void import('jsqr').then((module) => { jsQR = module.default })

    const intervalId = window.setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || busyRef.current) return
      try {
        if (detector) {
          const found = (await detector.detect(video))[0]?.rawValue
          if (found) await submit(found)
          return
        }
        // Safari has no BarcodeDetector: decode a downscaled frame with jsQR instead.
        const canvas = canvasRef.current
        if (!jsQR || !canvas) return
        const scale = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = context.getImageData(0, 0, canvas.width, canvas.height)
        const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data
        if (found) await submit(found)
      } catch {
        // A frame that fails to decode is normal; keep scanning.
      }
    }, 350)

    return () => window.clearInterval(intervalId)
  }, [cameraOn, submit])

  const OutcomeIcon = outcome?.tone === 'success' ? CheckCircle2 : outcome?.tone === 'warning' ? CircleAlert : ShieldAlert

  return (
    <div className="scanner-layout">
      <section className="scanner-camera-panel">
        <div className="scanner-camera-frame">
          <video ref={videoRef} autoPlay muted playsInline className={cameraOn ? 'is-live' : ''} />
          <canvas ref={canvasRef} hidden />
          <div className="scanner-focus" />
          {!cameraOn ? <div className="scanner-qr-box"><QrCode size={54} /></div> : null}
        </div>
        {cameraError ? <p className="scanner-error">{cameraError}</p> : null}
        <button type="button" className="primary-button" onClick={cameraOn ? stopCamera : () => void startCamera()}>
          <ScanLine size={16} /> {cameraOn ? 'Stop camera' : 'Start camera'}
        </button>
      </section>

      <aside className="scanner-sidebar">
        <div className={`scan-banner ${outcome ? outcome.tone : 'idle'}`} role="status" aria-live="assertive">
          {outcome?.color ? <span className="scan-ticket-color" style={{ background: outcome.color }}>{outcome.ticket}</span> : null}
          {outcome ? (
            <>
              <OutcomeIcon size={30} />
              <div>
                <strong>{outcome.title}</strong>
                <span>{outcome.detail}</span>
              </div>
            </>
          ) : (
            <div>
              <strong>Ready to scan</strong>
              <span>Point the camera at a ticket QR code.</span>
            </div>
          )}
        </div>

        {counts ? (
          <div className="scanner-panel-card scanner-counts">
            <div><strong>{counts.checkedIn}</strong><span>checked in</span></div>
            <div><strong>{Math.max(counts.ticketsSold - counts.checkedIn, 0)}</strong><span>still to arrive</span></div>
          </div>
        ) : null}

        <form className="scanner-panel-card" onSubmit={(formEvent) => { formEvent.preventDefault(); lastCodeRef.current = null; void submit(manualCode) }}>
          <label className="scanner-field">
            Type a ticket code
            <input value={manualCode} onChange={(changeEvent) => setManualCode(changeEvent.target.value.toUpperCase())} placeholder="STM26-EB-4F2A9C" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          </label>
          <button type="submit" className="primary-button" disabled={!manualCode.trim()}>Check in</button>
        </form>
      </aside>
    </div>
  )
}
