import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    // Auto-expire if past expiresAt
    const existing = await db.absensi.findUnique({ where: { id }, select: { id: true, status: true, expiresAt: true } })
    if (existing && existing.status === 'OPEN' && existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
      await db.absensi.update({
        where: { id: existing.id },
        data: { status: 'EXPIRED', closedAt: new Date() },
      })
    }

    const absensi = await db.absensi.findUnique({
      where: { id },
      include: {
        dosenAjar: {
          include: { mataKuliah: true, kelas: true },
        },
        records: {
          include: {
            mahasiswa: {
              select: { id: true, name: true, nim: true, email: true },
            },
          },
          orderBy: { mahasiswa: { name: 'asc' } },
        },
      },
    })
    if (!absensi) return NextResponse.json({ error: 'Absensi tidak ditemukan' }, { status: 404 })
    if (absensi.dosenAjar.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ absensi })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
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
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    const existing = await db.absensi.findUnique({
      where: { id },
      include: { dosenAjar: true },
    })
    if (!existing) return NextResponse.json({ error: 'Absensi tidak ditemukan' }, { status: 404 })
    if (existing.dosenAjar.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (action === 'close') {
      const updated = await db.absensi.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
        },
      })
      await logAction(session.id, 'CLOSE_ABSENSI', `Close absensi ${id}`, 'INFO')
      return NextResponse.json({ absensi: updated })
    }

    const body = await req.json()
    const { topic } = body
    const data: any = {}
    if (topic !== undefined) data.topic = topic || null

    const updated = await db.absensi.update({ where: { id }, data })
    await logAction(session.id, 'UPDATE_ABSENSI', `Update absensi ${id}`, 'INFO')
    return NextResponse.json({ absensi: updated })
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
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const existing = await db.absensi.findUnique({
      where: { id },
      include: { dosenAjar: true },
    })
    if (!existing) return NextResponse.json({ error: 'Absensi tidak ditemukan' }, { status: 404 })
    if (existing.dosenAjar.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.absensi.delete({ where: { id } })
    await logAction(session.id, 'DELETE_ABSENSI', `Delete absensi ${id}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
