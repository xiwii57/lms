import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, sessionId } = await params
    const body = await req.json().catch(() => ({}))
    const reason = (body?.reason as string) || 'Reopened by dosen'

    const ujian = await db.ujian.findUnique({
      where: { id },
      select: { id: true, dosenId: true, durationMin: true },
    })
    if (!ujian) return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    if (ujian.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existing = await db.ujianSession.findUnique({ where: { id: sessionId } })
    if (!existing) return NextResponse.json({ error: 'Session tidak ditemukan' }, { status: 404 })
    if (existing.ujianId !== id) {
      return NextResponse.json({ error: 'Session tidak milik ujian ini' }, { status: 400 })
    }

    // Compute remaining duration in minutes
    const now = new Date()
    let remainingMin = ujian.durationMin
    if (existing.submittedAt && existing.startTime) {
      const elapsedMs = existing.submittedAt.getTime() - existing.startTime.getTime()
      const elapsedMin = Math.floor(elapsedMs / 60000)
      remainingMin = Math.max(1, ujian.durationMin - elapsedMin)
    } else if (existing.endTime > now) {
      const leftMs = existing.endTime.getTime() - now.getTime()
      remainingMin = Math.max(1, Math.floor(leftMs / 60000))
    }

    const newEndTime = new Date(now.getTime() + remainingMin * 60000)

    const updated = await db.ujianSession.update({
      where: { id: sessionId },
      data: {
        status: 'IN_PROGRESS',
        submittedAt: null,
        startTime: now,
        endTime: newEndTime,
        autoSubmitted: false,
        reason,
      },
      include: {
        mahasiswa: { select: { id: true, name: true, nim: true } },
      },
    })

    await logAction(
      session.id,
      'REOPEN_UJIAN_SESSION',
      `Reopen session ${sessionId} for ujian ${id} - reason: ${reason}, new endTime: ${newEndTime.toISOString()}`,
      'INFO'
    )

    return NextResponse.json({ session: updated, remainingMin })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
