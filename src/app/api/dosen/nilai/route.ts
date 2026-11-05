import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const dosenId = session.id

    // Get all dosenAjar ids for this dosen
    const dosenAjarList = await db.dosenAjar.findMany({
      where: { dosenId },
      select: { id: true, mataKuliahId: true, kelasId: true },
    })
    const dosenAjarIds = dosenAjarList.map((d) => d.id)

    // Tugas submissions with nilai for this dosen's tugas
    const tugasSubmissions = await db.tugasSubmission.findMany({
      where: {
        tugas: {
          dosenId,
        },
        nilai: { not: null },
      },
      include: {
        tugas: {
          select: {
            id: true,
            title: true,
            dosenAjarId: true,
            dosenAjar: { include: { mataKuliah: true, kelas: true } },
          },
        },
        mahasiswa: {
          select: { id: true, name: true, nim: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    })

    // Ujian jawaban with nilai for this dosen's ujian
    const ujianJawaban = await db.jawabanUjian.findMany({
      where: {
        ujian: {
          dosenId,
        },
        nilai: { not: null },
      },
      include: {
        ujian: {
          select: {
            id: true,
            title: true,
            type: true,
            dosenAjarId: true,
            dosenAjar: { include: { mataKuliah: true, kelas: true } },
          },
        },
        soal: {
          select: { id: true, pertanyaan: true, points: true },
        },
        mahasiswa: {
          select: { id: true, name: true, nim: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({
      dosenAjarIds,
      tugasSubmissions,
      ujianJawaban,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
