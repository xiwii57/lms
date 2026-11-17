'use client'
// ============================================================================
// Anti-cheat hook untuk exam mode
// ----------------------------------------------------------------------------
// Pakai helper dari:
//   - @/lib/exam/fullscreen  (cross-browser Fullscreen API)
//   - @/lib/exam/detection   (split screen & aspect ratio detection)
//
// Deteksi:
//   1. Tab visibility change       — semua browser
//   2. Window blur + retry         — semua browser
//   3. Page hide / browser exit    — semua browser
//   4. Split screen (resize + periodic)  — Android 7+, iOS, desktop
//   5. Orientation change (landscape untuk cheat) — mobile
//   6. Fullscreen exit + periodic  — cross-browser
//   7. Periodic document.hasFocus() — overlay backup
//   8. Pointer leave viewport      — overlay indikator
//   9. Keyboard shortcut block     — semua browser
//  10. Copy/paste/cut + context menu + selection block
//  11. Notification permission change
//
// Grace period 3 detik + 2 retry untuk hindari false positive.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getFullscreenElement,
  requestFullscreenCrossBrowser,
  exitFullscreenCrossBrowser,
  addFullscreenChangeListeners,
} from '@/lib/exam/fullscreen'
import {
  isSplitScreen,
  isAspectChanged,
  isLandscapeForCheat,
  currentAspect,
} from '@/lib/exam/detection'

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
  detectSplitScreen?: boolean
  enforceFullscreen?: boolean
}

const GRACE_MS = 3000
const MAX_RETRY = 2

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

  useEffect(() => {
    if (enabled) firedRef.current = false
  }, [enabled])

  // ==========================================================================
  // DETEKSI UTAMA (semua event listeners + periodic check)
  // ==========================================================================
  useEffect(() => {
    if (!enabled) return

    const initialInnerW = window.innerWidth
    const initialInnerH = window.innerHeight
    const baselineAspect = currentAspect()
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

    // --- 2. Window blur + grace + retry ---
    const handleBlur = () => {
      if (Date.now() - startTime < GRACE_MS) return
      blurRetry++
      setTimeout(() => {
        if (document.hasFocus()) {
          blurRetry = 0
        } else if (blurRetry >= MAX_RETRY) {
          reportViolation(
            'WINDOW_BLUR',
            'Window kehilangan fokus — alt+tab, split screen, atau buka app lain',
          )
        }
      }, 500)
    }

    // --- 3. Page hide / browser exit ---
    const handlePageHide = () => {
      reportViolation('BROWSER_EXIT', 'Halaman disembunyikan / browser ditutup')
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      reportViolation('BROWSER_EXIT', 'Mencoba menutup/refresh halaman ujian')
    }

    // --- 4. Resize & split screen ---
    const handleResize = () => {
      if (Date.now() - startTime < GRACE_MS) return
      if (detectSplitScreen && isSplitScreen()) {
        reportViolation(
          'SPLIT_SCREEN',
          'Split screen terdeteksi — layar di-bagi dengan app lain',
        )
        return
      }
      // Aspect ratio berubah signifikan (rotation, split, dll)
      if (isAspectChanged(baselineAspect)) {
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

    // --- 5. Orientation change ---
    const handleOrientationChange = () => {
      if (isLandscapeForCheat()) {
        reportViolation(
          'ORIENTATION_CHANGE',
          'Rotasi ke landscape dengan rasio mencurigakan — kemungkinan split atau lihat materi',
        )
      }
    }

    // --- 6. Fullscreen exit ---
    const handleFullscreenChange = () => {
      if (!enforceFullscreen || Date.now() - startTime < GRACE_MS) return
      if (!getFullscreenElement()) {
        reportViolation(
          'EXIT_FULLSCREEN',
          'Keluar dari mode fullscreen — kemungkinan buka app/tab lain',
        )
      }
    }

    // --- 7-12. Keyboard, context menu, clipboard, selection ---
    const handleKeyDown = (e: KeyboardEvent) => {
      // Refresh: F5, Ctrl+R, Ctrl+Shift+R
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault()
        reportViolation('BROWSER_EXIT', `Mencoba refresh (${e.ctrlKey ? 'Ctrl+' : ''}${e.key})`)
        return
      }
      // New tab/window: Ctrl+T/N/W
      if (e.ctrlKey && ['t', 'T', 'n', 'N', 'w', 'W'].includes(e.key)) {
        e.preventDefault()
        reportViolation('TAB_SWITCH', `Mencoba buka tab/jendela baru (Ctrl+${e.key.toUpperCase()})`)
        return
      }
      // Address bar: Ctrl+L
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        reportViolation('WINDOW_BLUR', 'Mencoba akses address bar (Ctrl+L)')
        return
      }
      // Function keys F1-F12 (kecuali F11)
      if (e.key.startsWith('F') && e.key !== 'F11') {
        const num = parseInt(e.key.slice(1))
        if (num >= 1 && num <= 12) {
          e.preventDefault()
          reportViolation('WINDOW_BLUR', `Tombol fungsi ditekan (${e.key})`)
          return
        }
      }
      // Copy/paste/cut/select all: Ctrl+C/V/X/A
      if (e.ctrlKey && ['c', 'C', 'v', 'V', 'x', 'X', 'a', 'A'].includes(e.key)) {
        e.preventDefault()
        return
      }
      // View source: Ctrl+U
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault()
        reportViolation('WINDOW_BLUR', 'Mencoba view source (Ctrl+U)')
        return
      }
      // DevTools: Ctrl+Shift+I/J/C
      if (e.ctrlKey && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) {
        e.preventDefault()
        reportViolation('WINDOW_BLUR', 'Mencoba buka DevTools')
        return
      }
    }

    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    const handleCopy = (e: ClipboardEvent) => e.preventDefault()
    const handleCut = (e: ClipboardEvent) => e.preventDefault()
    const handlePaste = (e: ClipboardEvent) => e.preventDefault()
    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault()
      }
    }

    // --- 8. Pointer leave (overlay indicator) ---
    const handlePointerLeave = (e: PointerEvent) => {
      if (Date.now() - startTime < GRACE_MS) return
      if (
        e.clientY <= 0 ||
        e.clientY >= window.innerHeight ||
        e.clientX <= 0 ||
        e.clientX >= window.innerWidth
      ) {
        blurRetry++
        if (blurRetry >= MAX_RETRY + 1) {
          reportViolation(
            'OVERLAY_DETECTED',
            'Pointer meninggalkan viewport — kemungkinan overlay app lain',
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

    // --- Periodic backup check (1 detik) ---
    // Backup kalau event tidak fire (Android Chrome kadang tidak trigger resize saat split)
    const focusInterval = setInterval(() => {
      if (firedRef.current || Date.now() - startTime < GRACE_MS) return
      const now = Date.now()
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

      // Aktif cek split screen (Android kadang tidak fire resize)
      if (detectSplitScreen && isSplitScreen()) {
        reportViolation(
          'SPLIT_SCREEN',
          'Split screen terdeteksi via periodic check — layar di-bagi dengan app lain',
        )
      }

      // Aktif cek fullscreen exit
      if (enforceFullscreen && !getFullscreenElement()) {
        reportViolation(
          'EXIT_FULLSCREEN',
          'Keluar dari fullscreen via periodic check — kemungkinan buka app lain',
        )
      }
    }, 1000)

    // --- Notification permission ---
    let originalPermission: string | undefined
    if ('Notification' in window) {
      originalPermission = Notification.permission
    }
    const notifCheck = setInterval(() => {
      if (
        'Notification' in window &&
        originalPermission &&
        Notification.permission !== originalPermission
      ) {
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
  // Request fullscreen saat enabled
  // ==========================================================================
  useEffect(() => {
    if (!enabled || !enforceFullscreen) return
    let cancelled = false
    const tryFs = async () => {
      await new Promise((r) => setTimeout(r, 100))
      if (cancelled || firedRef.current) return
      if (!getFullscreenElement()) {
        await requestFullscreenCrossBrowser(document.documentElement)
      }
    }
    tryFs()
    return () => {
      cancelled = true
    }
  }, [enabled, enforceFullscreen])

  return { violations }
}

// Export helpers supaya exam-runner bisa pakai tanpa import tambahan
export { requestFullscreenCrossBrowser, exitFullscreenCrossBrowser } 