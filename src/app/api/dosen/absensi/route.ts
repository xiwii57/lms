import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const dosenAjarId = searchParams.get('dosenAjarId')

    const dosenAjarList = await db.dosenAjar.findMany({
      where: { dosenId: session.id },
      select: { id: true },
    })
    const dosenAjarIds = dosenAjarList.map((d) => d.id)

    const where: any = { dosenAjarId: { in: dosenAjarIds } }
    if (dosenAjarId) {
      if (!dosenAjarIds.includes(dosenAjarId)) {
        return NextResponse.json({ error: 'dosenAjar tidak milik dosen ini' }, { status: 403 })
      }
      where.dosenAjarId = dosenAjarId
    }

    // Auto-expire: mark OPEN sessions past expiresAt as EXPIRED
    const now = new Date()
    const openSessions = await db.absensi.findMany({
      where: { ...where, status: 'OPEN' },
      select: { id: true, expiresAt: true },
    })
    const toExpireIds = openSessions
      .filter((s) => s.expiresAt && new Date(s.expiresAt) < now)
      .map((s) => s.id)
    if (toExpireIds.length > 0) {
      await db.absensi.updateMany({
        where: { id: { in: toExpireIds } },
        data: { status: 'EXPIRED', closedAt: now },
      })
    }

    const absensi = await db.absensi.findMany({
      where,
      orderBy: [{ tanggal: 'desc' }, { pertemuan: 'asc' }],
      include: {
        dosenAjar: {
          include: { mataKuliah: true, kelas: true },
        },
        _count: { select: { records: true } },
      },
    })

    return NextResponse.json({ absensi })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { dosenAjarId, tanggal, pertemuan, topic, durationMin } = body
    if (!dosenAjarId || !tanggal || pertemuan === undefined) {
      return NextResponse.json(
        { error: 'dosenAjarId, tanggal, pertemuan wajib diisi' },
        { status: 400 }
      )
    }

    const da = await db.dosenAjar.findUnique({ where: { id: dosenAjarId } })
    if (!da || da.dosenId !== session.id) {
      return NextResponse.json({ error: 'dosenAjar tidak ditemukan' }, { status: 403 })
    }

    const tanggalDate = new Date(tanggal)
    if (isNaN(tanggalDate.getTime())) {
      return NextResponse.json({ error: 'tanggal tidak valid' }, { status: 400 })
    }

    const now = new Date()
    // Calculate expiresAt from durationMin (default 60 min if not provided)
    const dur = Number(durationMin) || 60
    const expiresAt = new Date(now.getTime() + dur * 60 * 1000)

    const absensi = await db.absensi.create({
      data: {
        dosenAjarId,
        tanggal: tanggalDate,
        pertemuan: Number(pertemuan),
        topic: topic || null,
        status: 'OPEN',
        openedAt: now,
        expiresAt,
        durationMin: dur,
      },
      include: {
        dosenAjar: { include: { mataKuliah: true, kelas: true } },
      },
    })

    await logAction(
      session.id,
      'CREATE_ABSENSI',
      `Open absensi pertemuan ${absensi.pertemuan} for dosenAjar ${dosenAjarId} (auto-expire in ${dur} min)`,
      'INFO'
    )
    return NextResponse.json({ absensi })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
