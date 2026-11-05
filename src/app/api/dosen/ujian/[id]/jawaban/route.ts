import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const ujian = await db.ujian.findUnique({
      where: { id },
      select: { id: true, dosenId: true },
    })
    if (!ujian) return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    if (ujian.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const mahasiswaId = searchParams.get('mahasiswaId')

    const where: any = { ujianId: id }
    if (mahasiswaId) where.mahasiswaId = mahasiswaId

    const allJawaban = await db.jawabanUjian.findMany({
      where,
      orderBy: [{ mahasiswaId: 'asc' }, { soal: { order: 'asc' } }],
      include: {
        mahasiswa: {
          select: { id: true, name: true, nim: true, email: true },
        },
        soal: {
          select: { id: true, pertanyaan: true, type: true, points: true, order: true, answerKey: true },
        },
      },
    })

    // Group by mahasiswa
    const grouped: Record<string, any> = {}
    for (const j of allJawaban) {
      const mId = j.mahasiswaId
      if (!grouped[mId]) {
        grouped[mId] = {
          mahasiswa: j.mahasiswa,
          jawaban: [],
        }
      }
      grouped[mId].jawaban.push(j)
    }

    const result = Object.values(grouped).map((g: any) => {
      const totalNilai = g.jawaban.reduce(
        (sum: number, j: any) => sum + (j.nilai ?? 0),
        0
      )
      const totalPoints = g.jawaban.reduce(
        (sum: number, j: any) => sum + (j.soal?.points ?? 0),
        0
      )
      return {
        ...g,
        totalNilai,
        totalPoints,
        answeredCount: g.jawaban.length,
      }
    })

    return NextResponse.json({ grouped: result, jawaban: allJawaban })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
