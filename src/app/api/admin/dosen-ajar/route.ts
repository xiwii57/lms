import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const dosenId = searchParams.get('dosenId')
    const kelasId = searchParams.get('kelasId')
    const mataKuliahId = searchParams.get('mataKuliahId')

    const where: any = {}
    if (dosenId) where.dosenId = dosenId
    if (kelasId) where.kelasId = kelasId
    if (mataKuliahId) where.mataKuliahId = mataKuliahId

    const dosenAjar = await db.dosenAjar.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        dosen: { select: { id: true, name: true, email: true, nip: true } },
        mataKuliah: { include: { prodi: true } },
        kelas: { include: { prodi: true } },
      },
    })
    return NextResponse.json({ dosenAjar })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { dosenId, mataKuliahId, kelasId, scheduleDay, scheduleTime, room } = body
    if (!dosenId || !mataKuliahId || !kelasId || !scheduleDay || !scheduleTime) {
      return NextResponse.json({ error: 'dosenId, mataKuliahId, kelasId, scheduleDay, scheduleTime wajib diisi' }, { status: 400 })
    }

    // Validate dosen role
    const dosen = await db.user.findUnique({ where: { id: dosenId } })
    if (!dosen || dosen.role !== 'DOSEN') {
      return NextResponse.json({ error: 'User bukan dosen' }, { status: 400 })
    }

    const dup = await db.dosenAjar.findFirst({
      where: { dosenId, mataKuliahId, kelasId },
    })
    if (dup) {
      return NextResponse.json({ error: 'Dosen sudah mengajar mata kuliah ini di kelas tersebut' }, { status: 400 })
    }

    const da = await db.dosenAjar.create({
      data: {
        dosenId,
        mataKuliahId,
        kelasId,
        scheduleDay,
        scheduleTime,
        room: room || null,
      },
    })
    await logAction(session.id, 'CREATE_DOSENAJAR', `Assign dosen ${dosenId} to MK ${mataKuliahId} kelas ${kelasId}`, 'INFO')
    return NextResponse.json({ dosenAjar: da })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
