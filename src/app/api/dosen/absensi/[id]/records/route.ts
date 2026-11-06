import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'DOSEN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await params
    const body = await req.json()
    const records = body.records
    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'records harus array' }, { status: 400 })
    }

    const validStatuses = ['HADIR', 'IZIN', 'SAKIT', 'ALFA']
    for (const r of records) {
      if (!validStatuses.includes(r.status)) {
        return NextResponse.json({ error: 'Status tidak valid: ' + r.status }, { status: 400 })
      }
    }

    const absensi = await db.absensi.findUnique({
      where: { id },
      include: { dosenAjar: true },
    })
    if (!absensi || absensi.dosenAjar.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const results: any[] = []
    for (const r of records) {
      const record = await db.absensiRecord.upsert({
        where: { absensiId_mahasiswaId: { absensiId: id, mahasiswaId: r.mahasiswaId } },
        update: { status: r.status, note: r.note || null },
        create: { absensiId: id, mahasiswaId: r.mahasiswaId, status: r.status, note: r.note || null },
      })
      results.push(record)
    }

    await logAction(session.id, 'UPDATE_ABSENSI_RECORDS', 'Update ' + results.length + ' records', 'INFO')
    return NextResponse.json({ records: results, count: results.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}