import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

interface RecordInput {
  mahasiswaId: string
  status: string
  note?: string | null
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const absensi = await db.absensi.findUnique({
      where: { id },
      include: { dosenAjar: true },
    })
    if (!absensi) return NextResponse.json({ error: 'Absensi tidak ditemukan' }, { status: 404 })
    if (absensi.dosenAjar.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { records } = body as { records: RecordInput[] }
    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'records harus array' }, { status: 400 })
    }

    const validStatuses = ['HADIR', 'IZIN', 'SAKIT', 'ALFA']

    // Process each record with upsert
    const results = []
    for (const r of records) {
      if (!r.mahasiswaId || !r.status) continue
      const status = String(r.status).toUpperCase()
      if (!validStatuses.includes(status)) continue

      const rec = await db.absensiRecord.upsert({
        where: {
          absensiId_mahasiswaId: {
            absensiId: id,
            mahasiswaId: r.mahasiswaId,
          },
        },
        update: {
          status,
          note: r.note || null,
        },
        create: {
          absensiId: id,
          mahasiswaId: r.mahasiswaId,
          status,
          note: r.note || null,
        },
      })
      results.push(rec)
    }

    await logAction(
      session.id,
      'UPDATE_ABSENSI_RECORDS',
      `Bulk update ${results.length} records for absensi ${id}`,
      'INFO'
    )
    return NextResponse.json({ records: results, count: results.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
