import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

interface SoalInput {
  id?: string
  pertanyaan: string
  type: string
  options?: any
  answerKey?: string | null
  points: number
  order: number
}

function safeParse(str: string | null): any {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const ujian = await db.ujian.findUnique({
      where: { id },
      include: {
        dosenAjar: { include: { mataKuliah: true, kelas: true } },
        soal: { orderBy: { order: 'asc' } },
        _count: { select: { sessions: true, jawaban: true } },
      },
    })
    if (!ujian) return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    if (ujian.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const soalParsed = ujian.soal.map((s) => ({
      ...s,
      options: safeParse(s.options),
    }))

    return NextResponse.json({ ujian: { ...ujian, soal: soalParsed } })
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
    const existing = await db.ujian.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    if (existing.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      title,
      type,
      description,
      startTime,
      endTime,
      durationMin,
      instruction,
      shuffleSoal,
      status,
      soal,
    } = body

    const data: any = {}
    if (title) data.title = title
    if (type) {
      const typeUpper = String(type).toUpperCase()
      if (!['UTS', 'UAS', 'QUIZ'].includes(typeUpper)) {
        return NextResponse.json({ error: 'type tidak valid' }, { status: 400 })
      }
      data.type = typeUpper
    }
    if (description !== undefined) data.description = description || null
    if (startTime) {
      const start = new Date(startTime)
      if (isNaN(start.getTime())) {
        return NextResponse.json({ error: 'startTime tidak valid' }, { status: 400 })
      }
      data.startTime = start
    }
    if (endTime) {
      const end = new Date(endTime)
      if (isNaN(end.getTime())) {
        return NextResponse.json({ error: 'endTime tidak valid' }, { status: 400 })
      }
      data.endTime = end
    }
    if (durationMin !== undefined) {
      const d = Number(durationMin)
      if (isNaN(d) || d <= 0) {
        return NextResponse.json({ error: 'durationMin tidak valid' }, { status: 400 })
      }
      data.durationMin = d
    }
    if (instruction !== undefined) data.instruction = instruction || null
    if (shuffleSoal !== undefined) data.shuffleSoal = !!shuffleSoal
    if (status) {
      const sUpper = String(status).toUpperCase()
      if (!['DRAFT', 'PUBLISHED', 'ONGOING', 'FINISHED'].includes(sUpper)) {
        return NextResponse.json({ error: 'status tidak valid' }, { status: 400 })
      }
      data.status = sUpper
    }

    // If soal provided, replace all (delete existing, create new)
    const shouldReplaceSoal = Array.isArray(soal)
    if (shouldReplaceSoal) {
      if ((soal as SoalInput[]).length === 0) {
        return NextResponse.json({ error: 'Minimal 1 soal' }, { status: 400 })
      }
    }

    // Transaction: update ujian, replace soal if requested
    const updated = await db.$transaction(async (tx) => {
      if (shouldReplaceSoal) {
        // Delete existing soal (cascade will delete jawaban)
        await tx.soalUjian.deleteMany({ where: { ujianId: id } })
        // Create new soal
        const soalData = (soal as SoalInput[]).map((s) => {
          const sType = String(s.type).toUpperCase()
          if (!['ESSAY', 'MULTIPLE_CHOICE'].includes(sType)) {
            throw new Error(`type soal tidak valid: ${s.type}`)
          }
          const optionsStr =
            s.options !== undefined && s.options !== null
              ? typeof s.options === 'string'
                ? s.options
                : JSON.stringify(s.options)
              : null
          return {
            ujianId: id,
            pertanyaan: s.pertanyaan,
            type: sType,
            options: optionsStr,
            answerKey: s.answerKey || null,
            points: Number(s.points) || 0,
            order: Number(s.order) || 0,
          }
        })
        await tx.soalUjian.createMany({ data: soalData })
      }
      return tx.ujian.update({
        where: { id },
        data,
        include: {
          dosenAjar: { include: { mataKuliah: true, kelas: true } },
          soal: { orderBy: { order: 'asc' } },
        },
      })
    })

    await logAction(
      session.id,
      'UPDATE_UJIAN',
      `Update ujian ${id}${shouldReplaceSoal ? ` (replaced ${(soal as SoalInput[]).length} soal)` : ''}`,
      'INFO'
    )

    const soalParsed = updated.soal.map((s) => ({
      ...s,
      options: safeParse(s.options),
    }))

    return NextResponse.json({ ujian: { ...updated, soal: soalParsed } })
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
    const existing = await db.ujian.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    if (existing.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.ujian.delete({ where: { id } })
    await logAction(session.id, 'DELETE_UJIAN', `Delete ujian ${existing.title}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
