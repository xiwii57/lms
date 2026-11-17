import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// ============================================================================
// Schedule mahasiswa — OPTIMIZED
// ----------------------------------------------------------------------------
// Before: 1 query dengan nested deep include (prodi, dosenAjar, mataKuliah,
//         kelas, dosen)
// After:  1 query dengan flat select hanya field yang dipakai di frontend
// ============================================================================
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1 query: ambil semua dosenAjar yang mengajar di kelas mahasiswa
  const dosenAjar = await db.dosenAjar.findMany({
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
      mataKuliah: {
        select: {
          id: true,
          name: true,
          code: true,
          sks: true,
          semester: true,
        },
      },
      kelas: {
        select: {
          id: true,
          name: true,
          prodi: { select: { id: true, name: true, code: true } },
        },
      },
      dosen: { select: { id: true, name: true } },
    },
    orderBy: [{ scheduleDay: 'asc' }, { scheduleTime: 'asc' }],
  })

  // Ambil kelas unik (mahasiswa bisa beberapa kelas)
  const kelasMap = new Map<string, any>()
  dosenAjar.forEach((d) => {
    if (!kelasMap.has(d.kelas.id)) {
      kelasMap.set(d.kelas.id, d.kelas)
    }
  })
  const kelas = Array.from(kelasMap.values())

  return NextResponse.json({ dosenAjar, kelas })
} 