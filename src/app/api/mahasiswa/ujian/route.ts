import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// List ujian available to mahasiswa
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const mhsKelas = await db.mahasiswaKelas.findMany({
    where: { mahasiswaId: session.id },
    select: { kelasId: true },
  })
  const kelasIds = mhsKelas.map((mk) => mk.kelasId)
  const dosenAjar = await db.dosenAjar.findMany({
    where: { kelasId: { in: kelasIds } },
    select: { id: true },
  })
  const dosenAjarIds = dosenAjar.map((da) => da.id)

  const ujian = await db.ujian.findMany({
    where: { dosenAjarId: { in: dosenAjarIds }, status: { in: ['PUBLISHED', 'ONGOING'] } },
    include: {
      dosenAjar: { include: { mataKuliah: true, kelas: true } },
      sessions: { where: { mahasiswaId: session.id } },
      _count: { select: { soal: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  // Filter out expired ones (endTime passed)
  const now = new Date()
  const activeUjian = ujian.filter((u) => new Date(u.endTime) > now)

  return NextResponse.json({ ujian: activeUjian })
}
