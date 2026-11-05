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
    const semester = searchParams.get('semester')

    const where: any = {}
    if (prodiId) where.prodiId = prodiId
    if (semester) where.semester = Number(semester)

    const mataKuliah = await db.mataKuliah.findMany({
      where,
      orderBy: [{ semester: 'asc' }, { name: 'asc' }],
      include: {
        prodi: true,
        _count: { select: { dosenAjar: true } },
      },
    })
    return NextResponse.json({ mataKuliah })
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
    const { name, code, sks, semester, prodiId } = body
    if (!name || !code || !prodiId) {
      return NextResponse.json({ error: 'name, code, prodiId wajib diisi' }, { status: 400 })
    }
    if (sks === undefined || semester === undefined) {
      return NextResponse.json({ error: 'sks, semester wajib diisi' }, { status: 400 })
    }

    const prodi = await db.prodi.findUnique({ where: { id: prodiId } })
    if (!prodi) return NextResponse.json({ error: 'Prodi tidak ditemukan' }, { status: 400 })

    const dup = await db.mataKuliah.findFirst({ where: { code: String(code).toUpperCase() } })
    if (dup) return NextResponse.json({ error: 'Kode mata kuliah sudah ada' }, { status: 400 })

    const mk = await db.mataKuliah.create({
      data: {
        name,
        code: String(code).toUpperCase(),
        sks: Number(sks),
        semester: Number(semester),
        prodiId,
      },
    })
    await logAction(session.id, 'CREATE_MATAKULIAH', `Create mata kuliah ${mk.name} (${mk.code})`, 'INFO')
    return NextResponse.json({ mataKuliah: mk })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
