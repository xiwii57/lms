import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// GET - list absensi for mahasiswa's kelas (with their attendance record)
// Also auto-expires OPEN sessions past expiresAt
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
  if (kelasIds.length === 0) {
    return NextResponse.json({ absensi: [] })
  }

  const dosenAjar = await db.dosenAjar.findMany({
    where: { kelasId: { in: kelasIds } },
    select: { id: true },
  })
  const dosenAjarIds = dosenAjar.map((da) => da.id)

  // Auto-expire OPEN sessions past expiresAt
  // Fetch OPEN sessions first, then filter in JS, then update individually
  const now = new Date()
  const openSessions = await db.absensi.findMany({
    where: { dosenAjarId: { in: dosenAjarIds }, status: 'OPEN' },
    select: { id: true, expiresAt: true },
  })
  const toExpireIds = openSessions
    .filter((s) => s.expiresAt && new Date(s.expiresAt) < now)
    .map((s) => s.id)
  if (toExpireIds.length > 0) {
    await db.absensi.updateMany({
      where: { id: { in: toExpireIds } },
      data: { status: 'EXPIRED', closedAt: now },
    })
  }

  const absensi = await db.absensi.findMany({
    where: { dosenAjarId: { in: dosenAjarIds } },
    include: {
      dosenAjar: {
        include: {
          mataKuliah: true,
          kelas: true,
          dosen: { select: { name: true } },
        },
      },
      records: {
        where: { mahasiswaId: session.id },
      },
    },
    orderBy: { tanggal: 'desc' },
  })

  return NextResponse.json({ absensi })
}
