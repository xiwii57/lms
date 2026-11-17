// ============================================================================
// Cross-browser Fullscreen API helpers
// ----------------------------------------------------------------------------
// Support: Chrome, Firefox, Safari (webkit), Edge (ms), iOS Safari, Samsung
// Internet, Android Chrome 51+
//
// Browser support matrix:
//   - requestFullscreen()    — Chrome 71+, Firefox 64+, Safari 16.4+
//   - webkitRequestFullscreen — Safari 15-, iOS Safari, older Android Chrome
//   - msRequestFullscreen     — IE 11+, legacy Edge
//   - mozRequestFullScreen    — Firefox older
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

/**
 * Ambil element yang sedang fullscreen saat ini (cross-browser).
 * Return null kalau tidak ada fullscreen aktif.
 */
export function getFullscreenElement(): Element | null {
  const d = document as AnyDocument
  return (
    d.fullscreenElement ||
    d.webkitFullscreenElement ||
    d.msFullscreenElement ||
    d.mozFullScreenElement ||
    null
  )
}

/**
 * Request fullscreen untuk element (default: documentElement).
 * Cross-browser: pakai prefix webkit/ms/moz kalau standard API tidak ada.
 *
 * @returns true kalau berhasil, false kalau ditolak atau tidak didukung
 */
export async function requestFullscreenCrossBrowser(
  el: HTMLElement = document.documentElement,
): Promise<boolean> {
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

/**
 * Exit fullscreen (cross-browser).
 * No-op kalau tidak sedang fullscreen.
 */
export function exitFullscreenCrossBrowser(): void {
  const d = document as AnyDocument
  const fn =
    document.exitFullscreen ||
    d.webkitExitFullscreen ||
    d.msExitFullscreen ||
    d.mozCancelFullScreen
  if (fn) {
    try {
      fn.call(document)
    } catch {
      /* ignore — best effort */
    }
  }
}

/**
 * Tambah listener untuk fullscreenchange event (cross-browser).
 *
 * @returns cleanup function untuk hapus semua listener
 */
export function addFullscreenChangeListeners(handler: () => void): () => void {
  const events = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'msfullscreenchange',
    'mozfullscreenchange',
  ]
  events.forEach((e) => document.addEventListener(e, handler))
  return () => events.forEach((e) => document.removeEventListener(e, handler))
}

/**
 * Cek apakah browser mendukung Fullscreen API.
 * Untuk iOS Safari < 16.4, return false (tidak support fullscreen).
 */
export function isFullscreenSupported(): boolean {
  const el = document.documentElement as AnyHTMLElement
  return !!(
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen ||
    el.mozRequestFullScreen
  )
} 