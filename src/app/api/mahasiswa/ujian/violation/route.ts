import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'

// Record a violation (tab switch, lost focus, notification) - body { ujianId, type, detail }
// Returns updated session with violationCount
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { ujianId, type, detail } = await req.json()
    if (!ujianId || !type) {
      return NextResponse.json({ error: 'ujianId dan type wajib' }, { status: 400 })
    }

    const ujianSession = await db.ujianSession.findUnique({
      where: { ujianId_mahasiswaId: { ujianId, mahasiswaId: session.id } },
    })
    if (!ujianSession || ujianSession.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Sesi ujian tidak aktif' }, { status: 400 })
    }

    const newCount = ujianSession.violationCount + 1
    const updated = await db.ujianSession.update({
      where: { id: ujianSession.id },
      data: {
        violationCount: newCount,
        lastViolation: type,
      },
    })

    await logAction(
      session.id,
      'UJIAN_VIOLATION',
      `Pelanggaran ujian (${type}): ${detail || ''} - Total: ${newCount}`,
      'WARN'
    )

    // For first violation we just record; second+ we still record
    // Auto-submit decision is made by frontend based on type/severity
    return NextResponse.json({
      session: updated,
      violationCount: newCount,
      shouldAutoSubmit: type === 'TAB_SWITCH' || type === 'WINDOW_BLUR' || type === 'BROWSER_EXIT' || type === 'NOTIFICATION',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
