// ============================================================================
// Client-side fetch cache dengan TTL (supaya pindah halaman tidak lambat)
// ----------------------------------------------------------------------------
// Strategi:
//   1. Saat fetch sukses, simpan response ke localStorage dengan timestamp
//   2. Saat fetch berikutnya, langsung pakai cache untuk instant render
//   3. Background refetch untuk update data (stale-while-revalidate pattern)
//
// Manfaat:
//   - Pindah halaman sidebar: instant (data dari cache, 0ms)
//   - Refresh halaman: render dari cache dulu, lalu refetch background
//   - Tidak bebankan server: cache TTL 30 detik untuk data dinamis
// ============================================================================

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // milliseconds
}

const PREFIX = 'lms_cache:'

/**
 * Ambil data dari cache. Return null kalau cache tidak ada atau expired.
 */
export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.timestamp > entry.ttl) {
      // Expired — tetap return data (stale) supaya instant render,
      // tapi caller harus refetch di background
      return entry.data
    }
    return entry.data
  } catch {
    return null
  }
}

/**
 * Cek apakah cache masih fresh (belum expired).
 */
export function isCacheFresh(key: string): boolean {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return false
    const entry: CacheEntry<unknown> = JSON.parse(raw)
    return Date.now() - entry.timestamp < entry.ttl
  } catch {
    return false
  }
}

/**
 * Simpan data ke cache dengan TTL.
 */
export function setCached<T>(key: string, data: T, ttlMs = 30_000): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl: ttlMs }
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // localStorage penuh atau disabled — ignore
  }
}

/**
 * Hapus cache tertentu.
 */
export function clearCached(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

/**
 * Hapus SEMUA cache LMS (misalnya saat logout).
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

/**
 * Fetch dengan cache: stale-while-revalidate pattern.
 *
 * @param key cache key (unik per endpoint + user)
 * @param url URL yang di-fetch
 * @param options fetch options
 * @param ttlMs TTL cache (default 30 detik)
 * @param onStaleUpdate callback kalau data fresh diterima dari server (untuk re-render)
 *
 * @returns { data: T | null, isStale: boolean }
 *   - data: dari cache (instant) atau null kalau tidak ada cache
 *   - isStale: true kalau data dari cache expired (caller harus refetch background)
 */
export async function fetchWithCache<T>(
  key: string,
  url: string,
  options?: RequestInit,
  ttlMs = 30_000,
): Promise<{ data: T | null; isStale: boolean; fresh: T | null }> {
  // 1. Cek cache dulu
  const cached = getCached<T>(key)
  const fresh = isCacheFresh(key)
  if (cached && fresh) {
    // Cache masih fresh — return langsung, tidak perlu fetch
    return { data: cached, isStale: false, fresh: null }
  }

  // 2. Cache expired atau tidak ada — fetch dari server
  try {
    const res = await fetch(url, { credentials: 'include', ...options })
    const d = await res.json()
    if (d.error) throw new Error(d.error)
    setCached(key, d, ttlMs)
    return { data: d, isStale: false, fresh: d }
  } catch (e) {
    // Fetch gagal — return cache stale kalau ada, supaya UI tidak blank
    if (cached) {
      return { data: cached, isStale: true, fresh: null }
    }
    throw e
  }
}
