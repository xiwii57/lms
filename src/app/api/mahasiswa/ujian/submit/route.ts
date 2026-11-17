import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'

// ============================================================================
// Submit ujian (dengan optimasi inline jawaban)
// ----------------------------------------------------------------------------
// Body: { ujianId, reason?, violationType?, answers?: [{ soalId, answer }] }
//
// Flow:
//   1. Verify session aktif (IN_PROGRESS)
//   2. JIKA answers[] ada: upsert SEMUA jawaban dalam 1 transaction (sebelum submit)
//   3. Update session → SUBMITTED atau AUTO_SUBMITTED
//   4. Auto-grade MULTIPLE_CHOICE (correct = full points, wrong = null)
//   5. Log action
//
// Performance:
//   - Sebelumnya: 35 fetch save + 1 fetch submit + 1 fetch violation = 37 request
//   - Sekarang: 1 fetch submit (dengan answers inline) + 1 fetch violation = 2 request
//   - Atau: 1 fetch submit saja (tanpa violation kalau manual submit)
//
// Total query ke Supabase per submit:
//   - 1 findUnique (session)
//   - 1 update (session status)
//   - 1 findMany (jawabanList + include soal) — untuk auto-grade
//   - N update (auto-grade per correct PG) — bisa di-batch juga kalau perlu
//   - 1 findUnique (ujian title) — bisa di-eliminate kalau tidak perlu
//   - 1 insert (log)
//   - Kalau ada answers[]: + 1 transaction (N upsert)
// ============================================================================
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { ujianId, reason, violationType, answers } = await req.json()
    if (!ujianId) {
      return NextResponse.json({ error: 'ujianId wajib' }, { status: 400 })
    }

    // 1 query: cek session
    const ujianSession = await db.ujianSession.findUnique({
      where: { ujianId_mahasiswaId: { ujianId, mahasiswaId: session.id } },
      select: { id: true, status: true, endTime: true, lastViolation: true },
    })
    if (!ujianSession) {
      return NextResponse.json({ error: 'Sesi ujian tidak ditemukan' }, { status: 404 })
    }
    if (
      ujianSession.status === 'SUBMITTED' ||
      ujianSession.status === 'AUTO_SUBMITTED' ||
      ujianSession.status === 'EXPIRED'
    ) {
      return NextResponse.json({ error: 'Ujian sudah di-submit', session: ujianSession }, { status: 400 })
    }

    const isAuto = !!reason

    // Inline jawaban: upsert semua dulu dalam 1 transaction
    let savedCount = 0
    if (Array.isArray(answers) && answers.length > 0) {
      const limited = answers.slice(0, 50) // safety limit
      const txResult = await db.$transaction(
        limited.map((a: { soalId: string; answer: string }) =>
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
      savedCount = txResult.length
    }

    // Update session status
    const updated = await db.ujianSession.update({
      where: { id: ujianSession.id },
      data: {
        status: isAuto ? 'AUTO_SUBMITTED' : 'SUBMITTED',
        autoSubmitted: isAuto,
        reason: reason || null,
        lastViolation: violationType || ujianSession.lastViolation,
        submittedAt: new Date(),
      },
      select: { id: true, status: true, submittedAt: true },
    })

    // === AUTO-GRADE MULTIPLE_CHOICE ===
    // 1 query dengan nested select soal, lalu loop update yang benar
    const jawabanList = await db.jawabanUjian.findMany({
      where: { ujianId, mahasiswaId: session.id },
      select: {
        id: true,
        answer: true,
        nilai: true,
        soal: { select: { type: true, answerKey: true, points: true } },
      },
    })

    const correctUpdates: { id: string; nilai: number }[] = []
    let autoGradedCount = 0
    let autoGradedPoints = 0

    for (const j of jawabanList) {
      if (j.soal.type === 'MULTIPLE_CHOICE' && j.nilai === null) {
        const correctAnswer = (j.soal.answerKey || '').trim().toUpperCase()
        const studentAnswer = (j.answer || '').trim().toUpperCase()
        if (correctAnswer && studentAnswer === correctAnswer) {
          correctUpdates.push({ id: j.id, nilai: j.soal.points })
          autoGradedCount++
          autoGradedPoints += j.soal.points
        }
      }
    }

    // Batch update nilai untuk semua jawaban benar dalam 1 transaction
    if (correctUpdates.length > 0) {
      await db.$transaction(
        correctUpdates.map((c) =>
          db.jawabanUjian.update({
            where: { id: c.id },
            data: { nilai: c.nilai, catatan: 'Auto-graded: jawaban benar (PG)' },
            select: { id: true },
          }),
        ),
      )
    }

    // Ambil title ujian untuk log (1 query ringan)
    const ujian = await db.ujian.findUnique({
      where: { id: ujianId },
      select: { title: true },
    })
    await logAction(
      session.id,
      isAuto ? 'AUTO_SUBMIT_UJIAN' : 'SUBMIT_UJIAN',
      `${isAuto ? 'Auto-submit' : 'Submit'} ujian "${ujian?.title}"${reason ? ` - Alasan: ${reason}` : ''}. Jawaban tersimpan: ${savedCount}. Auto-grade PG: ${autoGradedCount} benar (${autoGradedPoints} poin)`,
      isAuto ? 'WARN' : 'INFO',
    )

    return NextResponse.json({
      session: updated,
      savedAnswers: savedCount,
      autoGraded: { count: autoGradedCount, points: autoGradedPoints },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
} 