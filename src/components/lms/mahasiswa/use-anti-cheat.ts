'use client'
// Anti-cheat hook for exam mode
// Detects: tab switch, window blur, browser exit, notifications, camera off, screen share stopped
// Triggers auto-submit when violation detected
import { useCallback, useEffect, useRef, useState } from 'react'

export type ViolationType =
  | 'TAB_SWITCH'
  | 'WINDOW_BLUR'
  | 'BROWSER_EXIT'
  | 'NOTIFICATION'
  | 'CAMERA_OFF'
  | 'SCREEN_SHARE_STOPPED'

export interface Violation {
  type: ViolationType
  detail: string
  timestamp: Date
}

interface UseAntiCheatOptions {
  enabled: boolean
  onViolation: (violation: Violation) => void
  requireCamera?: boolean
  requireScreenShare?: boolean
  cameraStream?: MediaStream | null
  screenStream?: MediaStream | null
}

export function useAntiCheat({
  enabled,
  onViolation,
  requireCamera = true,
  requireScreenShare = true,
  cameraStream,
  screenStream,
}: UseAntiCheatOptions) {
  const [violations, setViolations] = useState<Violation[]>([])
  const onViolationRef = useRef(onViolation)
  useEffect(() => {
    onViolationRef.current = onViolation
  }, [onViolation])

  // Track if a violation has already fired (prevents multiple submissions)
  const firedRef = useRef(false)

  const reportViolation = useCallback((type: ViolationType, detail: string) => {
    if (firedRef.current) return
    firedRef.current = true
    const v: Violation = { type, detail, timestamp: new Date() }
    // Defer to avoid setState-in-effect lint warning
    queueMicrotask(() => {
      setViolations((prev) => [...prev, v])
      onViolationRef.current(v)
    })
  }, [])

  // Reset firedRef when re-enabled
  useEffect(() => {
    if (enabled) {
      firedRef.current = false
    }
  }, [enabled])

  // 1. Tab visibility + blur + resize + keyboard shortcuts
  useEffect(() => {
    if (!enabled) return

    const initialW = window.innerWidth
    const initialH = window.innerHeight
    let resizeCount = 0

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation('TAB_SWITCH', 'Tab/window tidak terlihat')
      }
    }
    const handleBlur = () => {
      reportViolation('WINDOW_BLUR', 'Window kehilangan fokus - split screen atau alt+tab')
    }
    const handlePageHide = () => {
      reportViolation('BROWSER_EXIT', 'Halangan disembunyikan / browser ditutup')
    }
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      reportViolation('WINDOW_BLUR', 'Klik kanan diblokir')
    }
    // Detect window resize (split screen / minimize)
    const handleResize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w < initialW * 0.75 || h < initialH * 0.75) {
        resizeCount++
        if (resizeCount >= 2) {
          reportViolation('WINDOW_BLUR', 'Layar dikecilkan/di-split - kemungkinan contekan')
        }
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault()
        reportViolation('BROWSER_EXIT', 'Mencoba refresh page (F5/Ctrl+R)')
      }
      if (e.ctrlKey && (e.key === 't' || e.key === 'T' || e.key === 'n' || e.key === 'N' || e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        reportViolation('TAB_SWITCH', `Mencoba buka tab/jendela baru (Ctrl+${e.key.toUpperCase()})`)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('resize', handleResize)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleKeyDown)

    // Notification permission change detection
    let originalPermission: string | undefined
    if ('Notification' in window) {
      originalPermission = Notification.permission
    }
    const notifCheck = setInterval(() => {
      if ('Notification' in window && originalPermission && Notification.permission !== originalPermission) {
        reportViolation('NOTIFICATION', 'Izin notifikasi berubah saat ujian')
      }
    }, 2000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      clearInterval(notifCheck)
    }
  }, [enabled, reportViolation])

  // 2. Monitor camera stream via event listeners
  useEffect(() => {
    if (!enabled || !requireCamera) return
    if (!cameraStream) {
      reportViolation('CAMERA_OFF', 'Kamera tidak aktif atau izin dicabut')
      return
    }
    const track = cameraStream.getVideoTracks()[0]
    if (!track) {
      reportViolation('CAMERA_OFF', 'Track kamera tidak ditemukan')
      return
    }
    const handleEnded = () => reportViolation('CAMERA_OFF', 'Kamera berhenti - kemungkinan user mematikan kamera')
    track.addEventListener('ended', handleEnded)
    // Also set onended as backup
    track.onended = handleEnded
    return () => {
      track.removeEventListener('ended', handleEnded)
      if (track.onended === handleEnded) track.onended = null
    }
  }, [enabled, requireCamera, cameraStream, reportViolation])

  // 3. Monitor screen share stream via event listeners
  useEffect(() => {
    if (!enabled || !requireScreenShare) return
    if (!screenStream) {
      reportViolation('SCREEN_SHARE_STOPPED', 'Screen share tidak aktif')
      return
    }
    const track = screenStream.getVideoTracks()[0]
    if (!track) {
      reportViolation('SCREEN_SHARE_STOPPED', 'Track screen share tidak ditemukan')
      return
    }
    const handleEnded = () => reportViolation('SCREEN_SHARE_STOPPED', 'Screen share dihentikan oleh user')
    track.addEventListener('ended', handleEnded)
    // Also set onended as backup (more reliable in some browsers)
    track.onended = handleEnded
    return () => {
      track.removeEventListener('ended', handleEnded)
      if (track.onended === handleEnded) track.onended = null
    }
  }, [enabled, requireScreenShare, screenStream, reportViolation])

  // 4. Polling backup - check every 3 seconds if tracks are still live
  // This catches cases where event listeners don't fire reliably
  // IMPORTANT: Grace period + retry counter to avoid false positives during track initialization
  useEffect(() => {
    if (!enabled) return
    let cameraFailCount = 0
    let screenFailCount = 0
    const GRACE_PERIOD = 5000 // 5 seconds grace period before checking
    const MAX_FAILS = 3 // require 3 consecutive failures before firing (9 seconds of confirmed failure)
    const startTime = Date.now()

    const poll = setInterval(() => {
      if (firedRef.current) return

      // Skip during grace period
      if (Date.now() - startTime < GRACE_PERIOD) return

      // Check camera
      if (requireCamera && cameraStream) {
        const track = cameraStream.getVideoTracks()[0]
        if (!track || track.readyState === 'ended') {
          cameraFailCount++
          if (cameraFailCount >= MAX_FAILS) {
            reportViolation('CAMERA_OFF', 'Kamera terdeteksi tidak aktif setelah ' + (cameraFailCount * 3) + ' detik')
            return
          }
        } else {
          cameraFailCount = 0 // reset if track is live
        }
      }

      // Check screen share
      if (requireScreenShare && screenStream) {
        const track = screenStream.getVideoTracks()[0]
        if (!track || track.readyState === 'ended') {
          screenFailCount++
          if (screenFailCount >= MAX_FAILS) {
            reportViolation('SCREEN_SHARE_STOPPED', 'Screen share terdeteksi tidak aktif setelah ' + (screenFailCount * 3) + ' detik')
            return
          }
        } else {
          screenFailCount = 0 // reset if track is live
        }
      }
    }, 3000) // check every 3 seconds
    return () => clearInterval(poll)
  }, [enabled, requireCamera, requireScreenShare, cameraStream, screenStream, reportViolation])

  // Request fullscreen for better focus
  useEffect(() => {
    if (!enabled) return
    const requestFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen()
        }
      } catch {
        // User may decline; that's OK
      }
    }
    requestFullscreen()
  }, [enabled])

  return { violations }
}
