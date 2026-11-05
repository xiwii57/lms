// Simple session library using HTTP-only cookie
import { cookies } from 'next/headers'
import { db } from './db'
import crypto from 'crypto'

// Session secret from environment variable (NOT hardcoded)
// In production, set SESSION_SECRET in .env (min 32 characters)
const SESSION_SECRET = process.env.SESSION_SECRET || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('SESSION_SECRET must be set in production') })()
    : 'dev-only-secret-do-not-use-in-prod'
)
const SESSION_COOKIE = 'lms_session'

export interface SessionUser {
  id: string
  email: string
  name: string
    role: 'ADMIN' | 'DOSEN' | 'MAHASISWA' | 'OPERATOR'
  nip?: string | null
  nim?: string | null
}

export function createSessionToken(user: SessionUser): string {
  const payload = `${user.id}:${user.role}:${user.email}`
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${hmac}`).toString('base64')
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const [id, role, email, hmac] = decoded.split(':')
    if (!id || !role || !email || !hmac) return null
    const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(`${id}:${role}:${email}`).digest('hex')
    if (hmac !== expectedHmac) return null
    return { id, role: role as SessionUser['role'], email, name: '' }
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  const payload = verifySessionToken(token)
  if (!payload) return null
  // Fetch fresh user from DB
  const user = await db.user.findUnique({ where: { id: payload.id } })
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as SessionUser['role'],
    nip: user.nip,
    nim: user.nim,
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE

// Helper for client-side: fetch with credentials
export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.error || `HTTP ${res.status}`)
  }
  return data as T
}
