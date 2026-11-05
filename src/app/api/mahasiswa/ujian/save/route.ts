import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// Save jawaban (auto-save) - body { ujianId, soalId, answer }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { ujianId, soalId, answer } = await req.json()
    if (!ujianId || !soalId) {
      return NextResponse.json({ error: 'ujianId dan soalId wajib' }, { status: 400 })
    }
    // Verify session is IN_PROGRESS
    const ujianSession = await db.ujianSession.findUnique({
      where: { ujianId_mahasiswaId: { ujianId, mahasiswaId: session.id } },
    })
    if (!ujianSession || ujianSession.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Sesi ujian tidak aktif' }, { status: 400 })
    }
    // Check time not exceeded
    if (new Date() > new Date(ujianSession.endTime)) {
      await db.ujianSession.update({
        where: { id: ujianSession.id },
        data: {
          status: 'EXPIRED',
          autoSubmitted: true,
          reason: 'Waktu habis saat menyimpan jawaban',
          submittedAt: new Date(),
        },
      })
      return NextResponse.json({ error: 'Waktu ujian habis' }, { status: 400 })
    }

    const jawaban = await db.jawabanUjian.upsert({
      where: { soalId_mahasiswaId: { soalId, mahasiswaId: session.id } },
      update: { answer, updatedAt: new Date() },
      create: { ujianId, soalId, mahasiswaId: session.id, answer },
    })

    return NextResponse.json({ jawaban })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
