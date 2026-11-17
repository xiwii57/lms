// ============================================================================
// Exam anti-cheat detection helpers
// ----------------------------------------------------------------------------
// Deteksi pelanggaran ujian:
//   - splitScreen()       — split screen aktif (Android/iPadOS)
//   - suspiciousAspect()  — rasio aspect berubah signifikan (rotate/split)
//   - isLandscapeMobile() — HP di-rotate ke landscape untuk contekan
// ============================================================================

/**
 * Deteksi split screen aktif.
 *
 * Saat split screen aktif:
 *   - window.innerWidth << window.screen.availWidth (horizontal split)
 *   - window.innerHeight << window.screen.availHeight (vertical split)
 *   - window.outerWidth << window.screen.availWidth
 *
 * Threshold 75% dipakai karena:
 *   - Split 50/50: 50% < 75% ✓ terdeteksi
 *   - Split 70/30: 70% < 75%? — borderline, false negative mungkin
 *   - Resize akibat keyboard mobile: biasanya 80%+, tidak terdeteksi
 *
 * @returns true kalau split screen terdeteksi
 */
export function isSplitScreen(): boolean {
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

/**
 * Hitung aspect ratio viewport saat ini.
 */
export function currentAspect(): number {
  return window.innerWidth / window.innerHeight
}

/**
 * Cek apakah aspect ratio berubah signifikan dari baseline.
 *
 * @param baselineAspect aspect ratio awal sebelum ujian dimulai
 * @param threshold ambang batas perubahan (default 0.3 = 30%)
 * @returns true kalau aspect berubah signifikan
 */
export function isAspectChanged(
  baselineAspect: number,
  threshold = 0.3,
): boolean {
  const newAspect = currentAspect()
  return Math.abs(newAspect - baselineAspect) > threshold
}

/**
 * Cek apakah device dalam orientasi landscape dengan aspect ratio mencurigakan.
 *
 * Di mobile, rotate ke landscape dengan rasio > 1.8 biasanya untuk:
 *   - Split screen landscape
 *   - Lihat materi di samping ujian
 *   - Mirroring ke monitor eksternal
 *
 * @returns true kalau landscape dengan aspect > 1.8
 */
export function isLandscapeForCheat(): boolean {
  const orient = window.screen?.orientation?.type || ''
  if (!orient.includes('landscape')) return false
  return currentAspect() > 1.8
}

/**
 * Cek apakah window saat ini tidak fokus.
 * Backup untuk event blur yang kadang tidak fire di Android Chrome.
 */
export function isWindowBlurred(): boolean {
  return !document.hasFocus()
} 