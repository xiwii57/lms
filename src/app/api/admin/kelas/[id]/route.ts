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
    const { name, prodiId } = body

    const existing = await db.kelas.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Kelas tidak ditemukan' }, { status: 404 })

    const data: any = {}
    if (name) data.name = name
    if (prodiId) {
      const prodi = await db.prodi.findUnique({ where: { id: prodiId } })
      if (!prodi) return NextResponse.json({ error: 'Prodi tidak ditemukan' }, { status: 400 })
      data.prodiId = prodiId
    }

    const kelas = await db.kelas.update({ where: { id }, data })
    await logAction(session.id, 'UPDATE_KELAS', `Update kelas ${kelas.id}`, 'INFO')
    return NextResponse.json({ kelas })
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
    const existing = await db.kelas.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Kelas tidak ditemukan' }, { status: 404 })

    await db.kelas.delete({ where: { id } })
    await logAction(session.id, 'DELETE_KELAS', `Delete kelas ${existing.name}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
