import { NextResponse } from 'next/server'
import { getSession, clearSessionCookie } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function POST() {
  const session = await getSession()
  if (session) {
    await logAction(session.id, 'LOGOUT', `User ${session.email} logout`, 'INFO')
  }
  await clearSessionCookie()
  return NextResponse.json({ success: true })
}
