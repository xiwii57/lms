import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''

    let where: any = { status: { in: ['IN_PROGRESS', 'AUTO_SUBMITTED', 'SUBMITTED', 'EXPIRED'] } }
    if (search) {
      where = {
        AND: [
          { status: { in: ['IN_PROGRESS', 'AUTO_SUBMITTED', 'SUBMITTED', 'EXPIRED'] } },
          {
            OR: [
              { mahasiswa: { name: { contains: search, mode: 'insensitive' } } },
              { mahasiswa: { nim: { contains: search, mode: 'insensitive' } } },
              { mahasiswa: { email: { contains: search, mode: 'insensitive' } } },
              { ujian: { title: { contains: search, mode: 'insensitive' } } },
              { ujian: { dosenAjar: { mataKuliah: { name: { contains: search, mode: 'insensitive' } } } } },
            ]
          }
        ]
      }
    }

    const sessions = await db.ujianSession.findMany({
      where,
      include: {
        mahasiswa: { select: { id: true, name: true, nim: true, email: true } },
        ujian: {
          select: {
            id: true, title: true, type: true, durationMin: true,
            dosenAjar: { include: { mataKuliah: { select: { name: true } } } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    })

    return NextResponse.json({ sessions })
  } catch (e: any) {
    console.error('Operator sessions error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}