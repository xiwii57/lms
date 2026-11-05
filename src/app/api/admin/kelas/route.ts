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
    const prodiId = searchParams.get('prodiId')

    const where: any = {}
    if (prodiId) where.prodiId = prodiId

    const kelas = await db.kelas.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        prodi: true,
        _count: { select: { mahasiswaKelas: true, dosenAjar: true } },
      },
    })
    return NextResponse.json({ kelas })
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
    const { name, prodiId } = body
    if (!name || !prodiId) {
      return NextResponse.json({ error: 'name dan prodiId wajib diisi' }, { status: 400 })
    }

    const prodi = await db.prodi.findUnique({ where: { id: prodiId } })
    if (!prodi) return NextResponse.json({ error: 'Prodi tidak ditemukan' }, { status: 400 })

    const kelas = await db.kelas.create({ data: { name, prodiId } })
    await logAction(session.id, 'CREATE_KELAS', `Create kelas ${kelas.name}`, 'INFO')
    return NextResponse.json({ kelas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
