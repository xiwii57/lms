import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET() {
  try {
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
      return NextResponse.json({ tugas: [] })
    }

    const dosenAjar = await db.dosenAjar.findMany({
      where: { kelasId: { in: kelasIds } },
      select: { id: true },
    })
    const dosenAjarIds = dosenAjar.map((da) => da.id)

    if (dosenAjarIds.length === 0) {
      return NextResponse.json({ tugas: [] })
    }

    const tugas = await db.tugas.findMany({
      where: { dosenAjarId: { in: dosenAjarIds } },
      include: {
        dosenAjar: {
          include: { mataKuliah: true, kelas: true, dosen: { select: { name: true } } },
        },
        submissions: { where: { mahasiswaId: session.id } },
      },
      orderBy: { deadline: 'asc' },
    })

    return NextResponse.json({ tugas })
  } catch (e: any) {
    console.error('Tugas API error:', e)
    return NextResponse.json({ error: e.message || 'Gagal memuat tugas' }, { status: 500 })
  }
}