import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// ============================================================================
// Dashboard mahasiswa — OPTIMIZED
// ----------------------------------------------------------------------------
// Before: 3 sequential queries + nested deep include + write to DB (slow)
// After:  2 paralel queries (Promise.all) + flat select + compute schedule di JS
//
// Output: { kelas, tugas, ujian, schedule }
// ============================================================================
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1 query: ambil semua dosenAjar untuk mahasiswa ini (via nested filter some)
  // Sekaligus ambil schedule + info kelas + matkul + dosen name
  const dosenAjarList = await db.dosenAjar.findMany({
    where: {
      kelas: {
        mahasiswaKelas: { some: { mahasiswaId: session.id } },
      },
    },
    select: {
      id: true,
      scheduleDay: true,
      scheduleTime: true,
      room: true,
      mataKuliah: { select: { id: true, name: true, code: true, sks: true } },
      kelas: { select: { id: true, name: true, prodi: { select: { id: true, name: true } } } },
      dosen: { select: { id: true, name: true } },
    },
  })

  const dosenAjarIds = dosenAjarList.map((d) => d.id)

  // Ambil kelas unik (mahasiswa bisa punya beberapa kelas)
  const kelasMap = new Map<string, any>()
  dosenAjarList.forEach((d) => {
    if (!kelasMap.has(d.kelas.id)) {
      kelasMap.set(d.kelas.id, d.kelas)
    }
  })
  const kelas = Array.from(kelasMap.values())

  // Paralel fetch tugas + ujian
  const now = new Date()
  const [tugas, ujian] = await Promise.all([
    db.tugas.findMany({
      where: { dosenAjarId: { in: dosenAjarIds } },
      select: {
        id: true,
        title: true,
        description: true,
        deadline: true,
        dosenAjar: {
          select: {
            mataKuliah: { select: { name: true } },
            kelas: { select: { name: true } },
          },
        },
        submissions: {
          where: { mahasiswaId: session.id },
          select: { id: true, submittedAt: true, nilai: true },
        },
      },
      orderBy: { deadline: 'asc' },
      take: 10,
    }),
    db.ujian.findMany({
      where: {
        dosenAjarId: { in: dosenAjarIds },
        status: { in: ['PUBLISHED', 'ONGOING'] },
        endTime: { gte: now },
      },
      select: {
        id: true,
        title: true,
        type: true,
        startTime: true,
        endTime: true,
        durationMin: true,
        dosenAjar: {
          select: { mataKuliah: { select: { name: true } } },
        },
        sessions: {
          where: { mahasiswaId: session.id },
          select: { id: true, status: true },
        },
        _count: { select: { soal: true } },
      },
      orderBy: { startTime: 'asc' },
    }),
  ])

  // Compute schedule di server (group by day)
  const schedule: Record<string, any[]> = {}
  dosenAjarList.forEach((d) => {
    if (!schedule[d.scheduleDay]) schedule[d.scheduleDay] = []
    schedule[d.scheduleDay].push({
      id: d.id,
      mataKuliah: d.mataKuliah,
      kelas: d.kelas,
      dosen: d.dosen,
      scheduleTime: d.scheduleTime,
      room: d.room,
    })
  })

  return NextResponse.json({
    kelas,
    tugas,
    ujian,
    schedule,
  })
} 