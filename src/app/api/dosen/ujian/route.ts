import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

interface SoalInput {
  pertanyaan: string
  type: string // ESSAY | MULTIPLE_CHOICE
  options?: any
  answerKey?: string | null
  points: number
  order: number
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const dosenAjarId = searchParams.get('dosenAjarId')

    const dosenAjarList = await db.dosenAjar.findMany({
      where: { dosenId: session.id },
      select: { id: true },
    })
    const dosenAjarIds = dosenAjarList.map((d) => d.id)

    const where: any = { dosenId: session.id }
    if (dosenAjarId) {
      if (!dosenAjarIds.includes(dosenAjarId)) {
        return NextResponse.json({ error: 'dosenAjar tidak milik dosen ini' }, { status: 403 })
      }
      where.dosenAjarId = dosenAjarId
    }

    const ujian = await db.ujian.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        dosenAjar: { include: { mataKuliah: true, kelas: true } },
        _count: { select: { soal: true, sessions: true, jawaban: true } },
      },
    })

    return NextResponse.json({ ujian })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const {
      dosenAjarId,
      title,
      type,
      description,
      startTime,
      endTime,
      durationMin,
      instruction,
      shuffleSoal,
      soal,
    } = body

    if (!dosenAjarId || !title || !type || !startTime || !endTime || durationMin === undefined) {
      return NextResponse.json(
        { error: 'dosenAjarId, title, type, startTime, endTime, durationMin wajib diisi' },
        { status: 400 }
      )
    }
    if (!Array.isArray(soal) || soal.length === 0) {
      return NextResponse.json({ error: 'Minimal 1 soal' }, { status: 400 })
    }

    const typeUpper = String(type).toUpperCase()
    if (!['UTS', 'UAS', 'QUIZ'].includes(typeUpper)) {
      return NextResponse.json({ error: 'type tidak valid' }, { status: 400 })
    }

    const da = await db.dosenAjar.findUnique({ where: { id: dosenAjarId } })
    if (!da || da.dosenId !== session.id) {
      return NextResponse.json({ error: 'dosenAjar tidak ditemukan' }, { status: 403 })
    }

    const start = new Date(startTime)
    const end = new Date(endTime)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'startTime/endTime tidak valid' }, { status: 400 })
    }
    if (end <= start) {
      return NextResponse.json({ error: 'endTime harus setelah startTime' }, { status: 400 })
    }

    const duration = Number(durationMin)
    if (isNaN(duration) || duration <= 0) {
      return NextResponse.json({ error: 'durationMin tidak valid' }, { status: 400 })
    }

    // Prepare soal data
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
        pertanyaan: s.pertanyaan,
        type: sType,
        options: optionsStr,
        answerKey: s.answerKey || null,
        points: Number(s.points) || 0,
        order: Number(s.order) || 0,
      }
    })

    const ujian = await db.ujian.create({
      data: {
        dosenAjarId,
        dosenId: session.id,
        title,
        type: typeUpper,
        description: description || null,
        startTime: start,
        endTime: end,
        durationMin: duration,
        status: 'PUBLISHED',
        instruction: instruction || null,
        shuffleSoal: !!shuffleSoal,
        soal: { create: soalData },
      },
      include: {
        dosenAjar: { include: { mataKuliah: true, kelas: true } },
        soal: { orderBy: { order: 'asc' } },
      },
    })

    await logAction(
      session.id,
      'CREATE_UJIAN',
      `Create ujian "${ujian.title}" with ${soalData.length} soal`,
      'INFO'
    )

    // Parse options on read
    const soalParsed = ujian.soal.map((s) => ({
      ...s,
      options: s.options ? safeParse(s.options) : null,
    }))

    return NextResponse.json({ ujian: { ...ujian, soal: soalParsed } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

function safeParse(str: string): any {
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}
