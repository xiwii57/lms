import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'
import { deleteCapture } from '@/lib/capture-store'

// POST - reopen a single auto-submitted/expired session
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await params
    const ujianSession = await db.ujianSession.findUnique({
      where: { id },
      include: { ujian: { select: { title: true, durationMin: true } } },
    })
    if (!ujianSession) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 })
    }
    if (ujianSession.status === 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Sesi masih berjalan, tidak perlu dibuka kembali' }, { status: 400 })
    }

    // Calculate remaining time: original endTime - now, capped at duration
    const now = new Date()
    const elapsed = now.getTime() - new Date(ujianSession.startTime).getTime()
    const remaining = Math.max(1, ujianSession.ujian.durationMin * 60000 - elapsed)
    const newEndTime = new Date(now.getTime() + Math.min(remaining, ujianSession.ujian.durationMin * 60000))

    const updated = await db.ujianSession.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        autoSubmitted: false,
        reason: null,
        submittedAt: null,
        endTime: newEndTime,
      },
    })

    deleteCapture(id)
    await logAction(session.id, 'REOPEN_SESSION', `Operator membuka kembali sesi ${id} (${ujianSession.ujian.title})`, 'INFO')

    return NextResponse.json({ session: updated, remainingMin: Math.round(remaining / 60000) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
