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
              dosen: { select: { id: true, name: true } },
              kelas: true,
            },
          },
        },
      },
    },
  })
  const allDosenAjar: any[] = []
  mhsKelas.forEach((mk) => {
    mk.kelas.dosenAjar.forEach((da) => allDosenAjar.push(da))
  })
  return NextResponse.json({ dosenAjar: allDosenAjar, kelas: mhsKelas.map((mk) => mk.kelas) })
}
