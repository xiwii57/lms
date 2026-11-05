import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { dosenId, mataKuliahId, kelasId, scheduleDay, scheduleTime, room } = body

    const existing = await db.dosenAjar.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'DosenAjar tidak ditemukan' }, { status: 404 })

    if (dosenId) {
      const dosen = await db.user.findUnique({ where: { id: dosenId } })
      if (!dosen || dosen.role !== 'DOSEN') {
        return NextResponse.json({ error: 'User bukan dosen' }, { status: 400 })
      }
    }

    const data: any = {}
    if (dosenId) data.dosenId = dosenId
    if (mataKuliahId) data.mataKuliahId = mataKuliahId
    if (kelasId) data.kelasId = kelasId
    if (scheduleDay) data.scheduleDay = scheduleDay
    if (scheduleTime) data.scheduleTime = scheduleTime
    if (room !== undefined) data.room = room || null

    const da = await db.dosenAjar.update({ where: { id }, data })
    await logAction(session.id, 'UPDATE_DOSENAJAR', `Update dosenAjar ${da.id}`, 'INFO')
    return NextResponse.json({ dosenAjar: da })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const existing = await db.dosenAjar.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'DosenAjar tidak ditemukan' }, { status: 404 })

    await db.dosenAjar.delete({ where: { id } })
    await logAction(session.id, 'DELETE_DOSENAJAR', `Delete dosenAjar ${id}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
