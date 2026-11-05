import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'
import { deleteCapture } from '@/lib/capture-store'

// POST - bulk reopen all auto-submitted/expired sessions
export async function POST() {
  const session = await getSession()
  if (!session || session.role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Find all sessions that are SUBMITTED, AUTO_SUBMITTED, or EXPIRED
    const sessions = await db.ujianSession.findMany({
      where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'] } },
      include: { ujian: { select: { title: true, durationMin: true } } },
    })

    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Tidak ada sesi yang perlu dibuka kembali' }, { status: 400 })
    }

    const now = new Date()
    let reopenedCount = 0

    for (const s of sessions) {
      const elapsed = now.getTime() - new Date(s.startTime).getTime()
      const remaining = Math.max(1, s.ujian.durationMin * 60000 - elapsed)
      const newEndTime = new Date(now.getTime() + Math.min(remaining, s.ujian.durationMin * 60000))

      await db.ujianSession.update({
        where: { id: s.id },
        data: {
          status: 'IN_PROGRESS',
          autoSubmitted: false,
          reason: null,
          submittedAt: null,
          endTime: newEndTime,
        },
      })
      deleteCapture(s.id)
      reopenedCount++
    }

    await logAction(session.id, 'BULK_REOPEN', `Operator bulk reopen ${reopenedCount} sesi`, 'WARN')

    return NextResponse.json({ reopened: reopenedCount, total: sessions.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
