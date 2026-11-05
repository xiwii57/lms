import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// List all ujian sessions for this mahasiswa (history)
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessions = await db.ujianSession.findMany({
    where: { mahasiswaId: session.id },
    include: {
      ujian: {
        include: {
          dosenAjar: { include: { mataKuliah: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ sessions })
}
