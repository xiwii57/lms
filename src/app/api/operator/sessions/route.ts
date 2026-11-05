import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { getAllCaptures } from '@/lib/capture-store'

// GET - list all active exam sessions with captures
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Get all sessions that are IN_PROGRESS or AUTO_SUBMITTED
    const sessions = await db.ujianSession.findMany({
      where: { status: { in: ['IN_PROGRESS', 'AUTO_SUBMITTED', 'SUBMITTED', 'EXPIRED'] } },
      include: {
        mahasiswa: { select: { id: true, name: true, nim: true, email: true } },
        ujian: {
          select: {
            id: true, title: true, type: true, durationMin: true,
            dosenAjar: { include: { mataKuliah: { select: { name: true } } } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    })

    // Merge with captures (only metadata, NOT base64 frames)
    const captures = getAllCaptures()
    const capturesMap = new Map(captures.map(c => [c.sessionId, c]))

    const enriched = sessions.map(s => {
      const cap = capturesMap.get(s.id)
      return {
        ...s,
        hasCapture: !!cap,
        captureTime: cap?.timestamp || null,
        isLive: cap ? (Date.now() - cap.timestamp < 15000) : false,
      }
    })

    return NextResponse.json({ sessions: enriched })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
