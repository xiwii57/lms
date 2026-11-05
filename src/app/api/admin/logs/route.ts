import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const level = searchParams.get('level')
    const action = searchParams.get('action')
    const userId = searchParams.get('userId')
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    const where: any = {}
    if (level) where.level = level.toUpperCase()
    if (action) where.action = { contains: action }
    if (userId) where.userId = userId

    const limit = limitParam ? Number(limitParam) : 50
    const offset = offsetParam ? Number(offsetParam) : 0

    const [logs, total] = await Promise.all([
      db.logHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      db.logHistory.count({ where }),
    ])

    return NextResponse.json({ logs, total, limit, offset })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
