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
    const { name, code } = body

    const existing = await db.prodi.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Prodi tidak ditemukan' }, { status: 404 })

    if (code && String(code).toUpperCase() !== existing.code) {
      const dup = await db.prodi.findFirst({ where: { code: String(code).toUpperCase() } })
      if (dup) return NextResponse.json({ error: 'Kode prodi sudah ada' }, { status: 400 })
    }

    const data: any = {}
    if (name) data.name = name
    if (code) data.code = String(code).toUpperCase()

    const prodi = await db.prodi.update({ where: { id }, data })
    await logAction(session.id, 'UPDATE_PRODI', `Update prodi ${prodi.id}`, 'INFO')
    return NextResponse.json({ prodi })
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
    const existing = await db.prodi.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Prodi tidak ditemukan' }, { status: 404 })

    await db.prodi.delete({ where: { id } })
    await logAction(session.id, 'DELETE_PRODI', `Delete prodi ${existing.code}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
