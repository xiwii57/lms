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
    const { name, code, sks, semester, prodiId } = body

    const existing = await db.mataKuliah.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Mata kuliah tidak ditemukan' }, { status: 404 })

    if (code && String(code).toUpperCase() !== existing.code) {
      const dup = await db.mataKuliah.findFirst({ where: { code: String(code).toUpperCase() } })
      if (dup) return NextResponse.json({ error: 'Kode mata kuliah sudah ada' }, { status: 400 })
    }
    if (prodiId) {
      const prodi = await db.prodi.findUnique({ where: { id: prodiId } })
      if (!prodi) return NextResponse.json({ error: 'Prodi tidak ditemukan' }, { status: 400 })
    }

    const data: any = {}
    if (name) data.name = name
    if (code) data.code = String(code).toUpperCase()
    if (sks !== undefined) data.sks = Number(sks)
    if (semester !== undefined) data.semester = Number(semester)
    if (prodiId) data.prodiId = prodiId

    const mk = await db.mataKuliah.update({ where: { id }, data })
    await logAction(session.id, 'UPDATE_MATAKULIAH', `Update mata kuliah ${mk.id}`, 'INFO')
    return NextResponse.json({ mataKuliah: mk })
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
    const existing = await db.mataKuliah.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Mata kuliah tidak ditemukan' }, { status: 404 })

    await db.mataKuliah.delete({ where: { id } })
    await logAction(session.id, 'DELETE_MATAKULIAH', `Delete mata kuliah ${existing.code}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
