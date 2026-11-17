import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// ============================================================================
// List tugas available to mahasiswa — OPTIMIZED
// ----------------------------------------------------------------------------
// Before: 3 sequential queries (mhsKelas → dosenAjar → tugas)
// After:  1 query dengan nested filter `some` + select hanya field yang dipakai
// ============================================================================
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'MAHASISWA') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1 query: ambil tugas yang dosenAjar-nya mengajar di kelas mahasiswa
    const tugas = await db.tugas.findMany({
      where: {
        dosenAjar: {
          kelas: {
            mahasiswaKelas: { some: { mahasiswaId: session.id } },
          },
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        deadline: true,
        fileName: true,
        filePath: true,
        fileSize: true,
        fileType: true,
        createdAt: true,
        dosenAjar: {
          select: {
            mataKuliah: { select: { name: true, code: true } },
            kelas: { select: { name: true } },
            dosen: { select: { name: true } },
          },
        },
        submissions: {
          where: { mahasiswaId: session.id },
          select: {
            id: true,
            fileName: true,
            filePath: true,
            fileSize: true,
            submittedAt: true,
            nilai: true,
            feedback: true,
          },
        },
      },
      orderBy: { deadline: 'asc' },
    })

    return NextResponse.json({ tugas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gagal memuat tugas' }, { status: 500 })
  }
} 