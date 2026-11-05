import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const dosenId = session.id
    const todayName = DAY_NAMES[new Date().getDay()]
    const now = new Date()

    const [dosenAjar, todaySchedule, recentTugas, upcomingUjian, totalKelas, totalMataKuliah] =
      await Promise.all([
        db.dosenAjar.findMany({
          where: { dosenId },
          include: {
            mataKuliah: { include: { prodi: true } },
            kelas: { include: { prodi: true } },
          },
        }),
        db.dosenAjar.findMany({
          where: { dosenId, scheduleDay: todayName },
          include: {
            mataKuliah: true,
            kelas: true,
          },
          orderBy: { scheduleTime: 'asc' },
        }),
        db.tugas.findMany({
          where: { dosenId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            dosenAjar: { include: { mataKuliah: true, kelas: true } },
            _count: { select: { submissions: true } },
          },
        }),
        db.ujian.findMany({
          where: { dosenId, endTime: { gte: now } },
          orderBy: { startTime: 'asc' },
          take: 5,
          include: {
            dosenAjar: { include: { mataKuliah: true, kelas: true } },
          },
        }),
        db.dosenAjar.groupBy({
          by: ['kelasId'],
          where: { dosenId },
        }).then((r) => r.length),
        db.dosenAjar.groupBy({
          by: ['mataKuliahId'],
          where: { dosenId },
        }).then((r) => r.length),
      ])

    return NextResponse.json({
      dosenAjar,
      todaySchedule,
      recentTugas,
      upcomingUjian,
      stats: {
        totalKelas,
        totalMataKuliah,
        totalDosenAjar: dosenAjar.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
