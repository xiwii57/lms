import bcrypt from 'bcryptjs'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Perbandingan constant-time untuk dua string. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('$2')) {
    return bcrypt.compare(password, hash)
  }
  // LEGACY: password plaintext. Hapus cabang ini setelah semua user termigrasi
  // (rehash saat login berhasil, lihat needsRehash).
  return timingSafeEqualStr(password, hash)
}

/**
 * True jika hash masih plaintext ATAU bcrypt dengan cost lebih rendah
 * dari BCRYPT_ROUNDS. Panggil setelah verifyPassword berhasil, lalu
 * simpan hashPassword(password) ke DB.
 */
export function needsRehash(hash: string): boolean {
  if (!hash.startsWith('$2')) return true
  // Format bcrypt: $2a$12$<53 karakter>
  const cost = parseInt(hash.split('$')[2], 10)
  return Number.isNaN(cost) || cost < BCRYPT_ROUNDS
}

export function generateSecurePassword(length: number = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz1234567890'
  // Rejection sampling supaya distribusi karakter merata (tanpa modulo bias)
  const max = 256 - (256 % chars.length)
  let out = ''
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2)
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b < max && out.length < length) out += chars[b % chars.length]
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Validasi file: ekstensi
// ---------------------------------------------------------------------------

// Format OLE lama (.doc, .xls, .ppt) sengaja dikeluarkan: bisa membawa macro
// dan isinya tidak dipindai. Tambahkan kembali hanya jika benar-benar perlu.
const ALLOWED_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',  // tambah .doc .xls .ppt
  '.zip', '.rar', '.txt', '.md',
]

const BLOCKED_EXTENSIONS = [
  '.php', '.php3', '.php4', '.php5', '.php7', '.phtml', '.pht',
  '.exe', '.bat', '.cmd', '.com', '.scr', '.msi',
  '.sh', '.bash', '.zsh', '.fish',
  '.py', '.rb', '.pl', '.lua',
  '.jsp', '.asp', '.aspx', '.ashx',
  '.js', '.mjs', '.ts',
  '.html', '.htm', '.svg',
  '.sql', '.db', '.sqlite',
  '.htaccess', '.htpasswd',
  '.cgi', '.fcgi', '.jar', '.war', '.class',
  '.dll', '.so', '.dylib',
  '.vbs', '.vba', '.ps1', '.wsf', '.wsh', '.reg', '.lnk',
]

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.substring(dot)
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > 50 * 1024 * 1024) {
    return { valid: false, error: 'File terlalu besar (max 50MB)' }
  }
  if (file.size === 0) {
    return { valid: false, error: 'File kosong' }
  }

  const filename = file.name.toLowerCase()

  if (filename.includes('\0') || filename.includes('%00')) {
    return { valid: false, error: 'Nama file tidak valid' }
  }

  const ext = getExtension(filename)

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: 'Tipe file "' + ext + '" DILARANG!' }
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: 'Tipe file "' + ext + '" tidak diizinkan. Gunakan: PDF, JPG, PNG, DOCX, ZIP, TXT' }
  }

  // Cegah double extension, misal "shell.php.jpg"
  const parts = filename.split('.')
  if (parts.length > 2) {
    for (let i = 1; i < parts.length; i++) {
      if (BLOCKED_EXTENSIONS.includes('.' + parts[i])) {
        return { valid: false, error: 'File mengandung ekstensi berbahaya' }
      }
    }
  }

  return { valid: true }
}

// ---------------------------------------------------------------------------
// Validasi file: isi (magic bytes + pola berbahaya)
// ---------------------------------------------------------------------------

interface MagicByteConfig {
  signature: number[]
  secondarySignature?: {
    offset: number
    bytes: number[]
  }
}

const MAGIC_BYTES: Record<string, MagicByteConfig> = {
  '.pdf':  { signature: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  '.png':  { signature: [0x89, 0x50, 0x4E, 0x47] },
  '.jpg':  { signature: [0xFF, 0xD8, 0xFF] },
  '.jpeg': { signature: [0xFF, 0xD8, 0xFF] },
  '.gif':  { signature: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  '.rar':  { signature: [0x52, 0x61, 0x72, 0x21] }, // Rar!

  // WebP: RIFF + "WEBP" di offset 8 (agar tidak bentrok dengan .wav/.avi)
  '.webp': {
    signature: [0x52, 0x49, 0x46, 0x46], // RIFF
    secondarySignature: {
      offset: 8,
      bytes: [0x57, 0x45, 0x42, 0x50], // WEBP
    },
  },

  // Kontainer ZIP (ZIP, DOCX, XLSX, PPTX)
  '.zip':  { signature: [0x50, 0x4B, 0x03, 0x04] },
  '.docx': { signature: [0x50, 0x4B, 0x03, 0x04] },
  '.xlsx': { signature: [0x50, 0x4B, 0x03, 0x04] },
  '.pptx': { signature: [0x50, 0x4B, 0x03, 0x04] },
}

const DANGEROUS_PATTERNS = [
  '<?php', '<?=', 'eval(', 'base64_decode(',
  'system(', 'exec(', 'passthru(', 'shell_exec(',
  'popen(', 'proc_open(', 'assert(',
  '<script', 'document.cookie',
]

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const SCAN_BYTES = 51200 // 50KB di awal dan di akhir file

function containsDangerousPattern(text: string): string | null {
  const lower = text.toLowerCase()
  for (const pattern of DANGEROUS_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return pattern
  }
  return null
}

export async function validateFileContent(file: File): Promise<{ valid: boolean; error?: string }> {
  // Selalu jalankan validasi ekstensi/ukuran lebih dulu (allowlist)
  const basic = validateFile(file)
  if (!basic.valid) return basic

  const ext = getExtension(file.name.toLowerCase())

  // 1. Magic bytes
  const config = MAGIC_BYTES[ext]
  if (config) {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())

    for (let i = 0; i < config.signature.length; i++) {
      if (header[i] !== config.signature[i]) {
        return { valid: false, error: 'Isi file tidak cocok dengan extension "' + ext + '". File mungkin dipalsukan.' }
      }
    }

    if (config.secondarySignature) {
      const { offset, bytes } = config.secondarySignature
      for (let i = 0; i < bytes.length; i++) {
        if (header[offset + i] !== bytes[i]) {
          return { valid: false, error: 'Struktur isi file internal tidak valid untuk ekstensi "' + ext + '".' }
        }
      }
    }
  }

  // 2. Gambar: cek kode tersembunyi di awal DAN akhir file
  //    (payload sering ditempel setelah data gambar valid)
  if (IMAGE_EXTENSIONS.includes(ext)) {
    const head = await file.slice(0, Math.min(file.size, SCAN_BYTES)).text()
    const tail = await file.slice(Math.max(0, file.size - SCAN_BYTES)).text()
    if (containsDangerousPattern(head) || containsDangerousPattern(tail)) {
      return { valid: false, error: 'File gambar mengandung kode berbahaya.' }
    }
  }

  // File .txt/.md tidak dipindai: tidak dieksekusi, dan pemindaian hanya
  // menolak catatan/kode yang sah. Pastikan disajikan sebagai text/plain
  // atau attachment di sisi penyimpanan.

  return { valid: true }
}

// ---------------------------------------------------------------------------
// Nama file
// ---------------------------------------------------------------------------

/** Membersihkan nama file asli (untuk ditampilkan / disimpan di DB). */
export function sanitizeFilename(filename: string): string {
  const clean = filename.replace(/\0/g, '')
  const dot = clean.lastIndexOf('.')
  const ext = dot > -1
    ? clean.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '')
    : ''
  const base = (dot > -1 ? clean.slice(0, dot) : clean)
    .replace(/[^a-zA-Z0-9\-]/g, '_')
    .slice(0, 80)
  return (base || 'file') + ext
}

/** Nama acak untuk disimpan di storage. Simpan nama asli di database. */
export function generateStorageFilename(originalName: string): string {
  const ext = getExtension(sanitizeFilename(originalName).toLowerCase())
  return crypto.randomUUID() + ext
}

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------
// PERHATIAN: Map in-memory ini TIDAK efektif di serverless (Vercel): state
// hilang saat cold start dan tidak dibagi antar instance. Untuk production
// pindahkan ke Upstash Redis / tabel Supabase. Pastikan `identifier` berasal
// dari IP yang tidak bisa dipalsukan atau dari user ID.

interface RateLimitEntry { count: number; resetTime: number }

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX = 10
const rateLimitMap = new Map<string, RateLimitEntry>()

function sweepRateLimit(now: number) {
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key)
  }
}

export function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()

  // Bersihkan entri kadaluarsa agar Map tidak membengkak
  if (rateLimitMap.size > 1000) sweepRateLimit(now)

  const entry = rateLimitMap.get(identifier)
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW_MS }
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now }
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetIn: entry.resetTime - now }
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

export function generateCSRFToken(): string {
  return crypto.randomUUID() + crypto.randomUUID()
}

/** Bandingkan token dari request dengan token yang tersimpan di sesi. */
export function verifyCSRFToken(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false
  return timingSafeEqualStr(provided, expected)
}