import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const dosenAjarId = searchParams.get('dosenAjarId')

    // Determine which dosenAjar belong to this dosen
    const dosenAjarList = await db.dosenAjar.findMany({
      where: { dosenId: session.id },
      select: { id: true, kelasId: true, mataKuliahId: true },
    })

    if (dosenAjarList.length === 0) {
      return NextResponse.json({ mahasiswa: [] })
    }

    // If dosenAjarId specified, ensure it belongs to this dosen
    let kelasIds: string[]
    if (dosenAjarId) {
      const da = dosenAjarList.find((d) => d.id === dosenAjarId)
      if (!da) {
        return NextResponse.json({ error: 'dosenAjarId tidak milik dosen ini' }, { status: 403 })
      }
      kelasIds = [da.kelasId]
    } else {
      kelasIds = Array.from(new Set(dosenAjarList.map((d) => d.kelasId)))
    }

    const mhsKelas = await db.mahasiswaKelas.findMany({
      where: { kelasId: { in: kelasIds } },
      include: {
        mahasiswa: {
          select: {
            id: true,
            name: true,
            email: true,
            nim: true,
            phone: true,
          },
        },
        kelas: { include: { prodi: true } },
      },
      orderBy: { mahasiswa: { name: 'asc' } },
    })

    return NextResponse.json({ mahasiswa: mhsKelas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
