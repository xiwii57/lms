import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// ============================================================================
// List absensi for mahasiswa's kelas — OPTIMIZED
// ----------------------------------------------------------------------------
// Before: 4 queries (mhsKelas → dosenAjar → openSessions for expire → absensi)
//         + write to DB (updateMany) setiap GET request = heavy write load
// After:  1 query dengan nested filter + auto-expire dihapus dari GET
//         (auto-expire sekarang lazy check saat scan QR atau saat view detail)
// ============================================================================
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1 query: ambil absensi yang dosenAjar-nya mengajar di kelas mahasiswa
  // Filter records hanya untuk mahasiswa ini
  const absensi = await db.absensi.findMany({
    where: {
      dosenAjar: {
        kelas: {
          mahasiswaKelas: { some: { mahasiswaId: session.id } },
        },
      },
    },
    select: {
      id: true,
      tanggal: true,
      pertemuan: true,
      topic: true,
      status: true,
      openedAt: true,
      closedAt: true,
      expiresAt: true,
      durationMin: true,
      dosenAjar: {
        select: {
          mataKuliah: { select: { name: true, code: true } },
          kelas: { select: { name: true } },
          dosen: { select: { name: true } },
        },
      },
      records: {
        where: { mahasiswaId: session.id },
        select: {
          id: true,
          status: true,
          note: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          recordedAt: true,
        },
      },
    },
    orderBy: { tanggal: 'desc' },
  })

  // Compute isExpired di JS (kalau status OPEN tapi expiresAt lewat → anggap EXPIRED untuk display)
  // Tidak update DB di sini untuk hindari write load saat GET
  const now = new Date()
  const computed = absensi.map((a) => ({
    ...a,
    effectiveStatus:
      a.status === 'OPEN' && a.expiresAt && new Date(a.expiresAt) < now ? 'EXPIRED' : a.status,
  }))

  return NextResponse.json({ absensi: computed })
} 