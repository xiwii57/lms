import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jawabanId: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, jawabanId } = await params
    const body = await req.json()
    const { nilai, catatan } = body

    const jawaban = await db.jawabanUjian.findUnique({
      where: { id: jawabanId },
      include: { ujian: { select: { id: true, dosenId: true, title: true } } },
    })
    if (!jawaban) return NextResponse.json({ error: 'Jawaban tidak ditemukan' }, { status: 404 })
    if (jawaban.ujianId !== id) {
      return NextResponse.json({ error: 'Jawaban tidak milik ujian ini' }, { status: 400 })
    }
    if (jawaban.ujian.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data: any = {}
    if (nilai !== undefined) {
      const n = Number(nilai)
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'nilai tidak valid' }, { status: 400 })
      }
      data.nilai = n
    }
    if (catatan !== undefined) data.catatan = catatan || null

    const updated = await db.jawabanUjian.update({
      where: { id: jawabanId },
      data,
      include: {
        mahasiswa: { select: { id: true, name: true, nim: true } },
        soal: { select: { id: true, pertanyaan: true, points: true } },
      },
    })

    await logAction(
      session.id,
      'GRADE_UJIAN_JAWABAN',
      `Grade jawaban ${jawabanId} nilai=${data.nilai ?? jawaban.nilai}`,
      'INFO'
    )
    return NextResponse.json({ jawaban: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
