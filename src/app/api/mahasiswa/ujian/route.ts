import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// ============================================================================
// List ujian available to mahasiswa — OPTIMIZED
// ----------------------------------------------------------------------------
// Before: 3 sequential queries (mhsKelas → dosenAjar → ujian)
// After:  1 query dengan nested filter `some` + select field yang dipakai
// ============================================================================
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1 query: ambil ujian yang dosenAjar-nya mengajar di kelas mahasiswa
  const ujian = await db.ujian.findMany({
    where: {
      dosenAjar: {
        kelas: {
          mahasiswaKelas: { some: { mahasiswaId: session.id } },
        },
      },
      status: { in: ['PUBLISHED', 'ONGOING'] },
      endTime: { gte: new Date() },
    },
    select: {
      id: true,
      title: true,
      type: true,
      description: true,
      instruction: true,
      durationMin: true,
      startTime: true,
      endTime: true,
      shuffleSoal: true,
      dosenAjar: {
        select: {
          mataKuliah: { select: { name: true, code: true } },
          kelas: { select: { name: true } },
        },
      },
      sessions: {
        where: { mahasiswaId: session.id },
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
          autoSubmitted: true,
        },
      },
      _count: { select: { soal: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  return NextResponse.json({ ujian })
} 