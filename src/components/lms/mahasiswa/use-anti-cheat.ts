'use client'
// ============================================================================
// Anti-cheat hook untuk exam mode (CROSS-BROWSER, ANDROID 7+, iOS Safari)
// ----------------------------------------------------------------------------
// Deteksi yang diimplementasi:
//   1. Tab visibility change (visibilitychange)       — semua browser
//   2. Window blur (window.blur)                       — semua browser
//   3. Page hide / browser exit (pagehide/beforeunload)— semua browser
//   4. Window resize (split screen detection)          — semua browser
//   5. Orientation change (rotasi ke landscape)        — mobile browser
//   6. Fullscreen exit (fullscreenchange + prefix)     — cross-browser
//   7. Periodic document.hasFocus() (overlay detect)   — semua browser
//   8. Pointer leave viewport (overlay indikator)      — semua browser
//   9. Keyboard shortcut block (Ctrl+T/N/W/R, F5, dll) — semua browser
//  10. Context menu block (klik kanan)                 — semua browser
//  11. Copy/paste/cut block (clipboard)                — semua browser
//  12. Selection block (text selection disable)        — semua browser
//
// Grace period 3 detik + 2 retry untuk hindari false positive saat
// inisialisasi, orientation transien, atau notification singkat.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'

export type ViolationType =
  | 'TAB_SWITCH'
  | 'WINDOW_BLUR'
  | 'BROWSER_EXIT'
  | 'SPLIT_SCREEN'
  | 'OVERLAY_DETECTED'
  | 'EXIT_FULLSCREEN'
  | 'ORIENTATION_CHANGE'
  | 'NOTIFICATION'

export interface Violation {
  type: ViolationType
  detail: string
  timestamp: Date
}

interface UseAntiCheatOptions {
  enabled: boolean
  onViolation: (violation: Violation) => void
  // Mobile-specific: deteksi split screen lebih agresif
  detectSplitScreen?: boolean
  // Desktop-specific: paksa fullscreen & deteksi exit
  enforceFullscreen?: boolean
}

// ============================================================================
// CROSS-BROWSER FULLSCREEN API HELPERS
// ============================================================================
type AnyDocument = Document & {
  webkitFullscreenElement?: Element | null
  msFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
}

type AnyHTMLElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
}

function getFullscreenElement(): Element | null {
  const d = document as AnyDocument
  return (
    d.fullscreenElement ||
    d.webkitFullscreenElement ||
    d.msFullscreenElement ||
    d.mozFullScreenElement ||
    null
  )
}

async function requestFullscreenCrossBrowser(el: HTMLElement): Promise<boolean> {
  const anyEl = el as AnyHTMLElement
  const fn =
    anyEl.requestFullscreen ||
    anyEl.webkitRequestFullscreen ||
    anyEl.msRequestFullscreen ||
    anyEl.mozRequestFullScreen
  if (!fn) return false
  try {
    await fn.call(el)
    return true
  } catch {
    return false
  }
}

function addFullscreenChangeListeners(handler: () => void): () => void {
  const events = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'msfullscreenchange',
    'mozfullscreenchange',
  ]
  events.forEach((e) => document.addEventListener(e, handler))
  return () => events.forEach((e) => document.removeEventListener(e, handler))
}

// ============================================================================
// SPLIT SCREEN DETECTION (ANDROID + iOS)
// ============================================================================
// Saat split screen aktif:
//   - window.innerWidth << window.screen.availWidth (horizontal split)
//   - window.innerHeight << window.screen.availHeight (vertical split)
//   - rasio aspect berubah signifikan
function detectSplitScreen(): boolean {
  const screenW = window.screen?.availWidth ?? window.innerWidth
  const screenH = window.screen?.availHeight ?? window.innerHeight
  const outerW = window.outerWidth
  const outerH = window.outerHeight
  const innerW = window.innerWidth
  const innerH = window.innerHeight

  // Horizontal split (kiri-kanan): width turun < 75% screen
  if (innerW < screenW * 0.75) return true
  // Vertical split (atas-bawah): height turun < 75% screen
  if (innerH < screenH * 0.75) return true
  // Outer window jauh lebih kecil dari screen available
  if (outerW > 0 && outerW < screenW * 0.75) return true
  if (outerH > 0 && outerH < screenH * 0.75) return true

  return false
}

// ============================================================================
// HOOK UTAMA
// ============================================================================
export function useAntiCheat({
  enabled,
  onViolation,
  detectSplitScreen = true,
  enforceFullscreen = true,
}: UseAntiCheatOptions) {
  const [violations, setViolations] = useState<Violation[]>([])
  const onViolationRef = useRef(onViolation)
  useEffect(() => {
    onViolationRef.current = onViolation
  }, [onViolation])

  // Cegah multiple fire
  const firedRef = useRef(false)

  const reportViolation = useCallback((type: ViolationType, detail: string) => {
    if (firedRef.current) return
    firedRef.current = true
    const v: Violation = { type, detail, timestamp: new Date() }
    queueMicrotask(() => {
      setViolations((prev) => [...prev, v])
      onViolationRef.current(v)
    })
  }, [])

  // Reset saat enabled
  useEffect(() => {
    if (enabled) {
      firedRef.current = false
    }
  }, [enabled])

  // ==========================================================================
  // DETEKSI 1-11: Tab visibility, blur, pagehide, resize, orientation,
  // fullscreen exit, keyboard, context menu, copy/paste, selection
  // ==========================================================================
  useEffect(() => {
    if (!enabled) return

    // Snapshot awal untuk komparasi resize
    const initialInnerW = window.innerWidth
    const initialInnerH = window.innerHeight
    const initialAspect = initialInnerW / initialInnerH

    // Grace period 3 detik + retry counter untuk false positive
    const GRACE_MS = 3000
    const MAX_RETRY = 2
    const startTime = Date.now()
    let blurRetry = 0
    let resizeRetry = 0
    let focusRetry = 0
    let lastFocusCheck = Date.now()

    // --- 1. Tab visibility ---
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation('TAB_SWITCH', 'Tab/window disembunyikan — pindah app atau switch tab')
      }
    }

    // --- 2. Window blur + grace period + retry ---
    const handleBlur = () => {
      if (Date.now() - startTime < GRACE_MS) return
      blurRetry++
      // Cek ulang 500ms kemudian — kalau fokus kembali, reset retry
      setTimeout(() => {
        if (document.hasFocus()) {
          blurRetry = 0
        } else if (blurRetry >= MAX_RETRY) {
          reportViolation(
            'WINDOW_BLUR',
            'Window kehilangan fokus — kemungkinan alt+tab, split screen, atau buka app lain',
          )
        }
      }, 500)
    }

    // --- 3. Page hide / browser exit ---
    const handlePageHide = () => {
      reportViolation('BROWSER_EXIT', 'Halaman disembunyikan / browser ditutup')
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Tidak bisa cegah sepenuhnya, tapi tampilkan warning
      e.preventDefault()
      e.returnValue = ''
      reportViolation('BROWSER_EXIT', 'Mencoba menutup/refresh halaman ujian')
    }

    // --- 4 + 5. Resize & orientation change (SPLIT SCREEN detection) ---
    const handleResize = () => {
      if (Date.now() - startTime < GRACE_MS) return
      if (!detectSplitScreen) {
        // Tanpa split detection, cuma cek resize ekstrem
        const w = window.innerWidth
        const h = window.innerHeight
        if (w < initialInnerW * 0.7 || h < initialInnerH * 0.7) {
          resizeRetry++
          if (resizeRetry >= MAX_RETRY) {
            reportViolation('SPLIT_SCREEN', 'Layar dikecilkan signifikan — kemungkinan contekan')
          }
        }
        return
      }

      // Full split screen detection
      if (detectSplitScreenFn()) {
        resizeRetry++
        if (resizeRetry >= 1) {
          reportViolation(
            'SPLIT_SCREEN',
            'Split screen terdeteksi — layar di-bagi dengan app lain. Auto-submit.',
          )
        }
        return
      }

      // Aspect ratio berubah signifikan (rotation, split, dll)
      const newAspect = window.innerWidth / window.innerHeight
      if (Math.abs(newAspect - initialAspect) > 0.3) {
        resizeRetry++
        if (resizeRetry >= MAX_RETRY) {
          reportViolation(
            'SPLIT_SCREEN',
            'Rasio layar berubah signifikan — kemungkinan split atau rotate',
          )
        }
      } else {
        resizeRetry = 0
      }
    }

    const handleOrientationChange = () => {
      // Rotasi ke landscape di mobile sering dipakai untuk split screen
      const orient = window.screen?.orientation?.type || ''
      if (orient.includes('landscape')) {
        // Landscape di mobile = kemungkinan rotate untuk nyontek
        // Hanya violation kalau aspect ratio mencurigakan
        const newAspect = window.innerWidth / window.innerHeight
        if (newAspect > 1.8) {
          reportViolation(
            'ORIENTATION_CHANGE',
            'Rotasi ke landscape — kemungkinan untuk split screen atau lihat materi',
          )
        }
      }
    }

    // --- 6. Fullscreen exit ---
    const handleFullscreenChange = () => {
      if (!enforceFullscreen) return
      if (Date.now() - startTime < GRACE_MS) return
      const fsEl = getFullscreenElement()
      if (!fsEl) {
        // Exit fullscreen = strong signal of cheating attempt
        reportViolation(
          'EXIT_FULLSCREEN',
          'Keluar dari mode fullscreen — kemungkinan buka app/tab lain',
        )
      }
    }

    // --- 7. Keyboard shortcut block ---
    const handleKeyDown = (e: KeyboardEvent) => {
      // F5, Ctrl+R, Ctrl+Shift+R = refresh
      if (e.key === 'F5' || (e.ctrlKey && !e.shiftKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault()
        reportViolation('BROWSER_EXIT', 'Mencoba refresh halaman (F5/Ctrl+R)')
        return
      }
      // Ctrl+Shift+R = hard refresh
      if (e.ctrlKey && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        reportViolation('BROWSER_EXIT', 'Mencoba hard refresh (Ctrl+Shift+R)')
        return
      }
      // Ctrl+T/N/W = new tab/window
      if (e.ctrlKey && (e.key === 't' || e.key === 'T' || e.key === 'n' || e.key === 'N' || e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        reportViolation('TAB_SWITCH', `Mencoba buka tab/jendela baru (Ctrl+${e.key.toUpperCase()})`)
        return
      }
      // Ctrl+L = address bar focus
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        reportViolation('WINDOW_BLUR', 'Mencoba akses address bar (Ctrl+L)')
        return
      }
      // Alt+Tab (tidak bisa dicegah, tapi detect via blur)
      // F1-F12 (kecuali F11 fullscreen)
      if (e.key.startsWith('F') && e.key !== 'F11') {
        const num = parseInt(e.key.slice(1))
        if (num >= 1 && num <= 12) {
          e.preventDefault()
          reportViolation('WINDOW_BLUR', `Tombol fungsi ditekan (${e.key})`)
          return
        }
      }
      // Ctrl+C/V/X/A = copy/paste/cut/select all
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V' || e.key === 'x' || e.key === 'X' || e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        return
      }
      // Ctrl+U = view source
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault()
        reportViolation('WINDOW_BLUR', 'Mencoba view source (Ctrl+U)')
        return
      }
      // Ctrl+Shift+I/J/C = DevTools
      if (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J' || e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        reportViolation('WINDOW_BLUR', 'Mencoba buka DevTools')
        return
      }
    }

    // --- 10. Context menu block ---
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    // --- 11. Copy/paste/cut block ---
    const handleCopy = (e: ClipboardEvent) => e.preventDefault()
    const handleCut = (e: ClipboardEvent) => e.preventDefault()
    const handlePaste = (e: ClipboardEvent) => e.preventDefault()

    // --- 12. Selection block ---
    const handleSelectStart = (e: Event) => {
      // Hanya block di area soal, izinkan di input/textarea
      const target = e.target as HTMLElement
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault()
      }
    }

    // --- 8. Pointer leave viewport (overlay indicator) ---
    const handlePointerLeave = (e: PointerEvent) => {
      // pointerleave di document = pointer keluar viewport
      // Bisa karena overlay menutupi, atau user pindah ke address bar
      if (Date.now() - startTime < GRACE_MS) return
      // Hanya trigger kalau pointer benar-benar di luar viewport
      if (e.clientY <= 0 || e.clientY >= window.innerHeight || e.clientX <= 0 || e.clientX >= window.innerWidth) {
        blurRetry++
        if (blurRetry >= MAX_RETRY + 1) {
          reportViolation(
            'OVERLAY_DETECTED',
            'Pointer meninggalkan area viewport — kemungkinan overlay app lain',
          )
        }
      }
    }

    // Daftar semua listener
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleOrientationChange)
    document.addEventListener('pointerleave', handlePointerLeave)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCut)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('selectstart', handleSelectStart)
    const removeFsListener = addFullscreenChangeListeners(handleFullscreenChange)

    // --- Periodic focus check (overlay / split screen backup) ---
    // Setiap 1 detik cek document.hasFocus() — kalau false, hitung retry
    const focusInterval = setInterval(() => {
      if (firedRef.current) return
      if (Date.now() - startTime < GRACE_MS) return
      const now = Date.now()
      // Throttle: cek maksimum 500ms gap
      if (now - lastFocusCheck < 500) return
      lastFocusCheck = now

      if (!document.hasFocus()) {
        focusRetry++
        if (focusRetry >= MAX_RETRY) {
          reportViolation(
            'WINDOW_BLUR',
            'Window tidak fokus setelah verifikasi — kemungkinan overlay atau split screen',
          )
        }
      } else {
        focusRetry = 0
      }

      // Cek split screen secara aktif (Android kadang tidak fire resize event)
      if (detectSplitScreen && !firedRef.current) {
        if (detectSplitScreenFn()) {
          reportViolation(
            'SPLIT_SCREEN',
            'Split screen terdeteksi via periodic check — layar di-bagi dengan app lain',
          )
        }
      }

      // Cek fullscreen exit secara aktif
      if (enforceFullscreen && !firedRef.current) {
        if (!getFullscreenElement()) {
          reportViolation(
            'EXIT_FULLSCREEN',
            'Keluar dari fullscreen via periodic check — kemungkinan buka app lain',
          )
        }
      }
    }, 1000)

    // --- Notification permission change ---
    let originalPermission: string | undefined
    if ('Notification' in window) {
      originalPermission = Notification.permission
    }
    const notifCheck = setInterval(() => {
      if ('Notification' in window && originalPermission && Notification.permission !== originalPermission) {
        reportViolation('NOTIFICATION', 'Izin notifikasi berubah saat ujian')
      }
    }, 3000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientationChange)
      document.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('selectstart', handleSelectStart)
      removeFsListener()
      clearInterval(focusInterval)
      clearInterval(notifCheck)
    }
  }, [enabled, detectSplitScreen, enforceFullscreen, reportViolation])

  // ==========================================================================
  // Request fullscreen saat enabled (cross-browser)
  // ==========================================================================
  useEffect(() => {
    if (!enabled || !enforceFullscreen) return
    let cancelled = false
    const tryFullscreen = async () => {
      // Delay sedikit supaya user gesture tercatat (mobile butuh user interaction)
      await new Promise((r) => setTimeout(r, 100))
      if (cancelled || firedRef.current) return
      if (!getFullscreenElement()) {
        await requestFullscreenCrossBrowser(document.documentElement)
      }
    }
    tryFullscreen()
    return () => {
      cancelled = true
    }
  }, [enabled, enforceFullscreen])

  return { violations }
}

// Helper untuk dipakai di useEffect (closure scope)
function detectSplitScreenFn(): boolean {
  return detectSplitScreen()
} 