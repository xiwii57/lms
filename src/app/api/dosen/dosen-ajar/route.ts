import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const dosenAjar = await db.dosenAjar.findMany({
      where: { dosenId: session.id },
      orderBy: [{ scheduleDay: 'asc' }, { scheduleTime: 'asc' }],
      include: {
        mataKuliah: { include: { prodi: true } },
        kelas: { include: { prodi: true } },
        _count: {
          select: { tugas: true, absensi: true, ujian: true },
        },
      },
    })

    return NextResponse.json({ dosenAjar })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
