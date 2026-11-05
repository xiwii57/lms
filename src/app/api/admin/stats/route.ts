import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [
      adminCount,
      dosenCount,
      mahasiswaCount,
      prodiCount,
      kelasCount,
      mataKuliahCount,
      ujianCount,
      tugasCount,
      dosenAjarCount,
      recentLogs,
    ] = await Promise.all([
      db.user.count({ where: { role: 'ADMIN' } }),
      db.user.count({ where: { role: 'DOSEN' } }),
      db.user.count({ where: { role: 'MAHASISWA' } }),
      db.prodi.count(),
      db.kelas.count(),
      db.mataKuliah.count(),
      db.ujian.count(),
      db.tugas.count(),
      db.dosenAjar.count(),
      db.logHistory.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
    ])

    return NextResponse.json({
      users: {
        ADMIN: adminCount,
        DOSEN: dosenCount,
        MAHASISWA: mahasiswaCount,
        total: adminCount + dosenCount + mahasiswaCount,
      },
      prodi: prodiCount,
      kelas: kelasCount,
      mataKuliah: mataKuliahCount,
      ujian: ujianCount,
      tugas: tugasCount,
      dosenAjar: dosenAjarCount,
      recentLogs,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
