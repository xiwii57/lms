'use client'
// Hook for managing camera and screen share streams
// Validates that screen share is the ENTIRE screen (monitor), not a window/tab
// Handles browsers/environments where getDisplayMedia is not available
import { useCallback, useRef, useState } from 'react'

interface UseMediaResult {
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  cameraError: string | null
  screenError: string | null
  cameraReady: boolean
  screenReady: boolean
  screenShareType: 'monitor' | 'window' | 'tab' | 'unknown' | null
  screenShareSupported: boolean
  cameraSupported: boolean
  startCamera: () => Promise<void>
  startScreenShare: () => Promise<void>
  stopAll: () => void
}

// Detect if media APIs are available
function detectScreenShareSupport(): boolean {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return false
  return typeof navigator.mediaDevices.getDisplayMedia === 'function'
}

function detectCameraSupport(): boolean {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return false
  return typeof navigator.mediaDevices.getUserMedia === 'function'
}

// Check if running in iframe (which may restrict screen share)
function isInIframe(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

// Check if context is secure (HTTPS or localhost)
function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext !== undefined) return window.isSecureContext
  const proto = window.location.protocol
  const host = window.location.hostname
  return proto === 'https:' || host === 'localhost' || host === '127.0.0.1'
}

export function useMedia(): UseMediaResult {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [screenReady, setScreenReady] = useState(false)
  const [screenShareType, setScreenShareType] = useState<'monitor' | 'window' | 'tab' | 'unknown' | null>(null)
  const streamsRef = useRef<{ camera?: MediaStream; screen?: MediaStream }>({})

  // Detect support at hook initialization
  const screenShareSupported = detectScreenShareSupport()
  const cameraSupported = detectCameraSupport()

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      // Check support first
      if (!cameraSupported) {
        setCameraError(
          'Browser Anda tidak mendukung akses kamera (getUserMedia). ' +
          'Silakan gunakan browser modern seperti Chrome, Firefox, atau Edge versi terbaru.'
        )
        setCameraReady(false)
        return
      }
      // Check secure context
      if (!isSecureContext()) {
        setCameraError(
          'Akses kamera memerlukan koneksi aman (HTTPS). Halaman ini diakses via HTTP yang tidak mendukung akses kamera. ' +
          'Silakan akses via HTTPS atau localhost.'
        )
        setCameraReady(false)
        return
      }
      // Stop existing
      if (streamsRef.current.camera) {
        streamsRef.current.camera.getTracks().forEach((t) => t.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      })
      streamsRef.current.camera = stream
      setCameraStream(stream)
      setCameraReady(true)
    } catch (e: any) {
      let msg = e.message || 'Gagal mengakses kamera'
      // Provide better error messages for common cases
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg = 'Izin kamera ditolak. Silakan izinkan kamera di pengaturan browser Anda (klik ikon kamera di address bar).'
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        msg = 'Kamera tidak ditemukan. Pastikan kamera terhubung dan tidak digunakan aplikasi lain.'
      } else if (e.name === 'NotReadableError') {
        msg = 'Kamera sedang digunakan aplikasi lain. Tutup aplikasi yang menggunakan kamera lalu coba lagi.'
      }
      setCameraError(msg)
      setCameraReady(false)
    }
  }, [cameraSupported])

  const startScreenShare = useCallback(async () => {
    setScreenError(null)
    setScreenReady(false)
    try {
      // Check if getDisplayMedia is supported
      if (!screenShareSupported) {
        const inIframe = isInIframe()
        const secure = isSecureContext()
        let msg = 'Browser/environment tidak mendukung screen share (getDisplayMedia). '
        if (inIframe) {
          msg += 'Halaman ini berjalan di dalam iframe. Silakan klik tombol "Open in New Tab" untuk membuka di tab baru, lalu coba lagi.'
        } else if (!secure) {
          msg += 'Koneksi tidak aman (HTTP). Screen share memerlukan HTTPS atau localhost.'
        } else {
          msg += 'Silakan gunakan browser modern seperti Chrome, Firefox, atau Edge versi terbaru di desktop.'
        }
        setScreenError(msg)
        setScreenReady(false)
        return
      }
      // Check secure context
      if (!isSecureContext()) {
        setScreenError(
          'Screen share memerlukan koneksi aman (HTTPS). Halaman ini diakses via HTTP. ' +
          'Silakan akses via HTTPS atau localhost.'
        )
        setScreenReady(false)
        return
      }
      if (streamsRef.current.screen) {
        streamsRef.current.screen.getTracks().forEach((t) => t.stop())
      }
      // Use prefer monitor constraint to nudge user to pick entire screen
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 5,
          // @ts-ignore - prefer monitor is supported in Chrome
          displaySurface: 'monitor',
        } as any,
        audio: false,
      })
      // Validate: must be entire screen (monitor), not window/tab
      const track = stream.getVideoTracks()[0]
      if (track) {
        const settings = track.getSettings()
        const surface = (settings as any).displaySurface as string | undefined
        setScreenShareType((surface as any) || 'unknown')
        if (surface && surface !== 'monitor') {
          // Reject - must share entire screen
          stream.getTracks().forEach((t) => t.stop())
          const surfaceLabel =
            surface === 'window' ? 'jendela aplikasi' :
            surface === 'tab' ? 'tab browser' :
            surface === 'application' ? 'aplikasi' : 'window'
          setScreenError(
            `Anda memilih "${surfaceLabel}". Anda WAJIB memilih "Seluruh Layar / Entire Screen" untuk berbagi layar penuh. ` +
            `Silakan coba lagi dan pilih opsi "Entire Screen" (bukan Window/Application/Tab).`
          )
          setScreenReady(false)
          setScreenStream(null)
          streamsRef.current.screen = undefined
          return
        }
      }
      streamsRef.current.screen = stream
      setScreenStream(stream)
      setScreenReady(true)
    } catch (e: any) {
      let msg = e.message || 'Gagal mengakses screen share'
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg = 'Izin screen share ditolak. Silakan klik "Bagikan Layar Penuh" lagi dan izinkan akses.'
      } else if (e.name === 'NotFoundError') {
        msg = 'Tidak ada layar yang tersedia untuk dibagikan.'
      } else if (e.message && e.message.includes('not a function')) {
        msg = 'Browser Anda tidak mendukung screen share. Silakan gunakan Chrome/Firefox/Edge desktop, atau buka halaman di tab baru (klik "Open in New Tab" di preview panel).'
      }
      setScreenError(msg)
      setScreenReady(false)
    }
  }, [screenShareSupported])

  const stopAll = useCallback(() => {
    if (streamsRef.current.camera) {
      streamsRef.current.camera.getTracks().forEach((t) => t.stop())
      streamsRef.current.camera = undefined
    }
    if (streamsRef.current.screen) {
      streamsRef.current.screen.getTracks().forEach((t) => t.stop())
      streamsRef.current.screen = undefined
    }
    setCameraStream(null)
    setScreenStream(null)
    setCameraReady(false)
    setScreenReady(false)
    setScreenShareType(null)
  }, [])

  return {
    cameraStream,
    screenStream,
    cameraError,
    screenError,
    cameraReady,
    screenReady,
    screenShareType,
    screenShareSupported,
    cameraSupported,
    startCamera,
    startScreenShare,
    stopAll,
  }
}
