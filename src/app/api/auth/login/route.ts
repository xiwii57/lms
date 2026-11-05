import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSessionToken, setSessionCookie } from '@/lib/session'
import { logAction } from '@/lib/logger'
import { verifyPassword, hashPassword, needsRehash, checkRateLimit } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const rateCheck = checkRateLimit(`login:${clientIP}`)
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(rateCheck.resetIn / 1000)} detik.` }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.resetIn / 1000)) } })
    }

    const { email, password } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 })

    const cleanEmail = email.toLowerCase().trim()
    if (cleanEmail.length > 255 || password.length > 255) return NextResponse.json({ error: 'Input terlalu panjang' }, { status: 400 })

    const user = await db.user.findUnique({ where: { email: cleanEmail } })
    const dummyHash = '$2a$10$N9qo8uLOickgx2ZMRZoMy.MQDqlKZIxLrVJQxQxQxQxQxQxQxQxQ'
    const isValid = user ? await verifyPassword(password, user.password) : await verifyPassword(password, dummyHash)

    if (!user || !isValid) return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 })

    // Auto-upgrade plain text → bcrypt
    if (needsRehash(user.password)) {
      const hashed = await hashPassword(password)
      await db.user.update({ where: { id: user.id }, data: { password: hashed } })
    }

    const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role as 'ADMIN' | 'DOSEN' | 'MAHASISWA', nip: user.nip, nim: user.nim }
    const token = createSessionToken(sessionUser)
    await setSessionCookie(token)
    await logAction(user.id, 'LOGIN', `User ${user.email} login sebagai ${user.role}`, 'INFO')
    return NextResponse.json({ user: sessionUser })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Login gagal' }, { status: 500 })
  }
}