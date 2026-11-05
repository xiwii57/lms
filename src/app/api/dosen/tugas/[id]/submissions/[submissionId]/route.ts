import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, submissionId } = await params
    const body = await req.json()
    const { nilai, feedback } = body

    const submission = await db.tugasSubmission.findUnique({
      where: { id: submissionId },
      include: { tugas: true },
    })
    if (!submission) return NextResponse.json({ error: 'Submission tidak ditemukan' }, { status: 404 })
    if (submission.tugasId !== id) {
      return NextResponse.json({ error: 'Submission tidak milik tugas ini' }, { status: 400 })
    }
    if (submission.tugas.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data: any = {}
    if (nilai !== undefined) {
      const n = Number(nilai)
      if (isNaN(n) || n < 0 || n > 100) {
        return NextResponse.json({ error: 'nilai harus 0-100' }, { status: 400 })
      }
      data.nilai = n
    }
    if (feedback !== undefined) data.feedback = feedback || null
    data.gradedAt = new Date()

    const updated = await db.tugasSubmission.update({
      where: { id: submissionId },
      data,
      include: {
        mahasiswa: { select: { id: true, name: true, nim: true } },
      },
    })

    await logAction(
      session.id,
      'GRADE_TUGAS',
      `Grade submission ${submissionId} nilai=${data.nilai ?? submission.nilai}`,
      'INFO'
    )
    return NextResponse.json({ submission: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
