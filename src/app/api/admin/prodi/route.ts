import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const prodi = await db.prodi.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { kelas: true, mataKuliah: true } },
      },
    })
    return NextResponse.json({ prodi })
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
    const { name, code } = body
    if (!name || !code) {
      return NextResponse.json({ error: 'name dan code wajib diisi' }, { status: 400 })
    }

    const existing = await db.prodi.findFirst({ where: { code: String(code).toUpperCase() } })
    if (existing) {
      return NextResponse.json({ error: 'Kode prodi sudah ada' }, { status: 400 })
    }

    const prodi = await db.prodi.create({
      data: { name, code: String(code).toUpperCase() },
    })

    await logAction(session.id, 'CREATE_PRODI', `Create prodi ${prodi.name} (${prodi.code})`, 'INFO')
    return NextResponse.json({ prodi })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
