import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = '/home/z/my-project/uploads/tugas'

async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true })
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const dosenAjarId = searchParams.get('dosenAjarId')

    // Validate dosenAjarId belongs to this dosen if provided
    if (dosenAjarId) {
      const da = await db.dosenAjar.findUnique({ where: { id: dosenAjarId } })
      if (!da || da.dosenId !== session.id) {
        return NextResponse.json({ error: 'dosenAjar tidak ditemukan' }, { status: 403 })
      }
    }

    // Get all dosenAjar ids for this dosen
    const dosenAjarList = await db.dosenAjar.findMany({
      where: { dosenId: session.id },
      select: { id: true },
    })
    const dosenAjarIds = dosenAjarList.map((d) => d.id)

    const where: any = { dosenId: session.id }
    if (dosenAjarId) {
      where.dosenAjarId = dosenAjarId
    } else {
      where.dosenAjarId = { in: dosenAjarIds }
    }

    const tugas = await db.tugas.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        dosenAjar: {
          include: {
            mataKuliah: true,
            kelas: true,
          },
        },
        _count: { select: { submissions: true } },
      },
    })

    return NextResponse.json({ tugas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const formData = await req.formData()
    const dosenAjarId = formData.get('dosenAjarId') as string | null
    const title = formData.get('title') as string | null
    const description = (formData.get('description') as string | null) || ''
    const deadlineStr = formData.get('deadline') as string | null
    const file = formData.get('file') as File | null

    if (!dosenAjarId || !title || !deadlineStr) {
      return NextResponse.json(
        { error: 'dosenAjarId, title, deadline wajib diisi' },
        { status: 400 }
      )
    }

    // Validate ownership
    const da = await db.dosenAjar.findUnique({ where: { id: dosenAjarId } })
    if (!da || da.dosenId !== session.id) {
      return NextResponse.json({ error: 'dosenAjar tidak ditemukan' }, { status: 403 })
    }

    const deadline = new Date(deadlineStr)
    if (isNaN(deadline.getTime())) {
      return NextResponse.json({ error: 'deadline tidak valid' }, { status: 400 })
    }

    let fileName: string | null = null
    let filePath: string | null = null
    let fileSize: number | null = null
    let fileType: string | null = null

    if (file && file.size > 0) {
      await ensureUploadDir()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const uniqueName = `${Date.now()}-${safeName}`
      const fullDiskPath = path.join(UPLOAD_DIR, uniqueName)
      const arrayBuffer = await file.arrayBuffer()
      await writeFile(fullDiskPath, Buffer.from(arrayBuffer))
      fileName = file.name
      filePath = `/uploads/tugas/${uniqueName}`
      fileSize = file.size
      fileType = file.type || null
    }

    const tugas = await db.tugas.create({
      data: {
        dosenAjarId,
        dosenId: session.id,
        title,
        description,
        deadline,
        fileName,
        filePath,
        fileSize,
        fileType,
      },
      include: {
        dosenAjar: { include: { mataKuliah: true, kelas: true } },
      },
    })

    await logAction(
      session.id,
      'CREATE_TUGAS',
      `Create tugas "${tugas.title}" for dosenAjar ${dosenAjarId}`,
      'INFO'
    )
    return NextResponse.json({ tugas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
