import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mhsKelas = await db.mahasiswaKelas.findMany({
    where: { mahasiswaId: session.id },
    include: {
      kelas: {
        include: {
          prodi: true,
          dosenAjar: {
            include: {
              mataKuliah: true,
              kelas: true,
              dosen: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })

  const dosenAjarIds: string[] = []
  mhsKelas.forEach((mk) => {
    mk.kelas.dosenAjar.forEach((da) => dosenAjarIds.push(da.id))
  })

  const tugas = await db.tugas.findMany({
    where: { dosenAjarId: { in: dosenAjarIds } },
    include: {
      dosenAjar: { include: { mataKuliah: true, kelas: true } },
      submissions: { where: { mahasiswaId: session.id } },
    },
    orderBy: { deadline: 'asc' },
    take: 10,
  })

  const ujian = await db.ujian.findMany({
    where: {
      dosenAjarId: { in: dosenAjarIds },
      status: { in: ['PUBLISHED', 'ONGOING'] },
      endTime: { gte: new Date() },
    },
    include: {
      dosenAjar: { include: { mataKuliah: true } },
      sessions: { where: { mahasiswaId: session.id } },
    },
    orderBy: { startTime: 'asc' },
  })

  const schedule: Record<string, any[]> = {}
  mhsKelas.forEach((mk) => {
    mk.kelas.dosenAjar.forEach((da) => {
      if (!schedule[da.scheduleDay]) schedule[da.scheduleDay] = []
      schedule[da.scheduleDay].push({
        ...da,
        time: da.scheduleTime,
        room: da.room,
      })
    })
  })

  return NextResponse.json({
    kelas: mhsKelas.map((mk) => mk.kelas),
    tugas,
    ujian,
    schedule,
  })
}