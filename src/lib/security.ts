// Security utilities for LMS
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

// Verify password against hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Support both old plain-text and new bcrypt hashes
  // If hash starts with $2, it's bcrypt; otherwise it's plain text (legacy)
  if (hash.startsWith('$2')) {
    return bcrypt.compare(password, hash)
  }
  // Legacy plain text comparison (for migration)
  return password === hash
}

// Check if password needs rehashing (plain text → bcrypt)
export function needsRehash(hash: string): boolean {
  return !hash.startsWith('$2')
}

// Session secret from environment variable (not hardcoded!)
// Falls back to a development-only secret
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production environment (min 32 chars)')
    }
    // Development only - random per restart
    return 'dev-only-secret-' + Math.random().toString(36).substring(2)
  }
  return secret
}

// Generate cryptographically secure random password
export function generateSecurePassword(length: number = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length]
  }
  return out
}

// Validate file type for uploads
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed',
  'text/plain',
  'text/markdown',
]

const ALLOWED_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.txt', '.md',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File terlalu besar (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }
  }

  // Check file size (empty)
  if (file.size === 0) {
    return { valid: false, error: 'File kosong' }
  }

  // Check MIME type
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    // Some browsers don't set MIME type correctly, check extension as fallback
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `Tipe file tidak diizinkan: ${file.type || ext}. Gunakan: PDF, JPG, PNG, DOC, ZIP, dll.` }
    }
  }

  return { valid: true }
}

// Sanitize filename to prevent path traversal
export function sanitizeFilename(filename: string): string {
  // Remove any path components
  const safe = filename.replace(/[^a-zA-Z0-9.\-]/g, '_')
  // Limit length
  return safe.substring(0, 100)
}

// Rate limiting (simple in-memory)
interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 10 // max 10 attempts per IP per window

export function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW }
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now }
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetIn: entry.resetTime - now }
}

// CSRF token generation
export function generateCSRFToken(): string {
  return crypto.randomUUID() + crypto.randomUUID()
}
