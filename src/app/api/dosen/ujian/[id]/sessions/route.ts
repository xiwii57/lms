import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const ujian = await db.ujian.findUnique({
      where: { id },
      include: {
        soal: { select: { id: true, points: true } },
      },
    })
    if (!ujian) return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    if (ujian.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const totalPoints = ujian.soal.reduce((sum, s) => sum + (s.points || 0), 0)
    const totalSoal = ujian.soal.length

    const sessions = await db.ujianSession.findMany({
      where: { ujianId: id },
      include: {
        mahasiswa: {
          select: { id: true, name: true, nim: true, email: true },
        },
      },
      orderBy: { mahasiswa: { name: 'asc' } },
    })

    // For each session, count answered jawaban and sum nilai
    const enrichedSessions = await Promise.all(
      sessions.map(async (s) => {
        const jawabanAgg = await db.jawabanUjian.aggregate({
          where: { ujianId: id, mahasiswaId: s.mahasiswaId },
          _sum: { nilai: true },
          _count: { _all: true },
        })
        return {
          ...s,
          jawabanAnswered: jawabanAgg._count._all,
          totalSoal,
          totalPointsPossible: totalPoints,
          totalNilai: jawabanAgg._sum.nilai ?? 0,
        }
      })
    )

    return NextResponse.json({
      sessions: enrichedSessions,
      totalPointsPossible: totalPoints,
      totalSoal,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
