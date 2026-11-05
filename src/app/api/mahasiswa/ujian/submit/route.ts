import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'

// Submit ujian - body { ujianId, reason? } - manual or auto submit
// If reason provided, it means auto-submitted due to violation
// On submit: auto-grade MULTIPLE_CHOICE questions (correct = full points, wrong = null for manual review)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { ujianId, reason, violationType } = await req.json()
    if (!ujianId) {
      return NextResponse.json({ error: 'ujianId wajib' }, { status: 400 })
    }

    const ujianSession = await db.ujianSession.findUnique({
      where: { ujianId_mahasiswaId: { ujianId, mahasiswaId: session.id } },
    })
    if (!ujianSession) {
      return NextResponse.json({ error: 'Sesi ujian tidak ditemukan' }, { status: 404 })
    }
    if (ujianSession.status === 'SUBMITTED' || ujianSession.status === 'AUTO_SUBMITTED' || ujianSession.status === 'EXPIRED') {
      return NextResponse.json({ error: 'Ujian sudah di-submit', session: ujianSession }, { status: 400 })
    }

    const isAuto = !!reason
    const updated = await db.ujianSession.update({
      where: { id: ujianSession.id },
      data: {
        status: isAuto ? 'AUTO_SUBMITTED' : 'SUBMITTED',
        autoSubmitted: isAuto,
        reason: reason || null,
        lastViolation: violationType || ujianSession.lastViolation,
        submittedAt: new Date(),
      },
    })

    // === AUTO-GRADE MULTIPLE_CHOICE QUESTIONS ===
    // For each PG soal: if mahasiswa's answer matches answerKey → set nilai = points (full)
    // If wrong → leave nilai null (dosen must manually review, may give partial credit or 0)
    const jawabanList = await db.jawabanUjian.findMany({
      where: { ujianId, mahasiswaId: session.id },
      include: { soal: true },
    })
    let autoGradedCount = 0
    let autoGradedPoints = 0
    for (const j of jawabanList) {
      // Only auto-grade MULTIPLE_CHOICE that haven't been graded yet
      if (j.soal.type === 'MULTIPLE_CHOICE' && j.nilai === null) {
        const correctAnswer = (j.soal.answerKey || '').trim().toUpperCase()
        const studentAnswer = (j.answer || '').trim().toUpperCase()
        if (correctAnswer && studentAnswer === correctAnswer) {
          // Correct → auto-grade with full points
          await db.jawabanUjian.update({
            where: { id: j.id },
            data: { nilai: j.soal.points, catatan: 'Auto-graded: jawaban benar (PG)' },
          })
          autoGradedCount++
          autoGradedPoints += j.soal.points
        }
        // If wrong, leave nilai null - dosen must grade manually
      }
    }

    const ujian = await db.ujian.findUnique({ where: { id: ujianId }, select: { title: true } })
    await logAction(
      session.id,
      isAuto ? 'AUTO_SUBMIT_UJIAN' : 'SUBMIT_UJIAN',
      `${isAuto ? 'Auto-submit' : 'Submit'} ujian "${ujian?.title}"${reason ? ` - Alasan: ${reason}` : ''}. Auto-grade PG: ${autoGradedCount} benar (${autoGradedPoints} poin)`,
      isAuto ? 'WARN' : 'INFO'
    )

    return NextResponse.json({
      session: updated,
      autoGraded: { count: autoGradedCount, points: autoGradedPoints },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
