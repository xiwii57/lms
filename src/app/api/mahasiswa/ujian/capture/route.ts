import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { setCapture } from '@/lib/capture-store'

// POST - mahasiswa sends camera + screen capture frames (base64 JPEG)
// Body: { sessionId, cameraFrame, screenFrame }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { sessionId, cameraFrame, screenFrame } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId wajib' }, { status: 400 })
    }

    // Verify session belongs to mahasiswa and is IN_PROGRESS
    const ujianSession = await db.ujianSession.findUnique({
      where: { id: sessionId },
      include: {
        ujian: { select: { title: true } },
      },
    })
    if (!ujianSession || ujianSession.mahasiswaId !== session.id) {
      return NextResponse.json({ error: 'Sesi tidak valid' }, { status: 403 })
    }
    if (ujianSession.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Sesi tidak aktif' }, { status: 400 })
    }

    // Store capture
    setCapture({
      sessionId,
      mahasiswaId: session.id,
      mahasiswaName: session.name,
      ujianTitle: ujianSession.ujian.title,
      cameraFrame: cameraFrame || null,
      screenFrame: screenFrame || null,
      timestamp: Date.now(),
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
