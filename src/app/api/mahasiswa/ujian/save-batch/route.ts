import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// ============================================================================
// BATCH SAVE jawaban (auto-save optimasi)
// ----------------------------------------------------------------------------
// Body: { ujianId, answers: [{ soalId, answer }] }
//   - Maksimal 50 jawaban per request
//   - Semua upsert dalam 1 transaction → 1 round-trip ke Supabase
//   - Reduce dari N request (1 per soal) → 1 request
//
// Response: { saved: number, expired?: boolean }
// ============================================================================
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { ujianId, answers } = await req.json()
    if (!ujianId || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'ujianId dan answers[] wajib' }, { status: 400 })
    }
    if (answers.length === 0) {
      return NextResponse.json({ saved: 0 })
    }
    if (answers.length > 50) {
      return NextResponse.json({ error: 'Maksimal 50 jawaban per batch' }, { status: 400 })
    }

    // 1 query: cek session
    const ujianSession = await db.ujianSession.findUnique({
      where: { ujianId_mahasiswaId: { ujianId, mahasiswaId: session.id } },
      select: { id: true, status: true, endTime: true },
    })
    if (!ujianSession || ujianSession.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Sesi ujian tidak aktif' }, { status: 400 })
    }
    // Cek waktu habis
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
      return NextResponse.json({ error: 'Waktu ujian habis', expired: true }, { status: 400 })
    }

    // 1 transaction: upsert semua jawaban
    const result = await db.$transaction(
      answers.map((a: { soalId: string; answer: string }) =>
        db.jawabanUjian.upsert({
          where: { soalId_mahasiswaId: { soalId: a.soalId, mahasiswaId: session.id } },
          update: { answer: a.answer, updatedAt: new Date() },
          create: {
            ujianId,
            soalId: a.soalId,
            mahasiswaId: session.id,
            answer: a.answer,
          },
          select: { id: true },
        }),
      ),
    )

    return NextResponse.json({ saved: result.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
} 