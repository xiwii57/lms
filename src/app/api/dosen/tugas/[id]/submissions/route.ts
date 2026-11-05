import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const tugas = await db.tugas.findUnique({ where: { id } })
    if (!tugas) return NextResponse.json({ error: 'Tugas tidak ditemukan' }, { status: 404 })
    if (tugas.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const submissions = await db.tugasSubmission.findMany({
      where: { tugasId: id },
      orderBy: { submittedAt: 'desc' },
      include: {
        mahasiswa: {
          select: {
            id: true,
            name: true,
            email: true,
            nim: true,
          },
        },
      },
    })

    return NextResponse.json({ submissions })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
