import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = '/home/z/my-project/uploads/tugas'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'DOSEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const tugas = await db.tugas.findUnique({
      where: { id },
      include: {
        dosenAjar: { include: { mataKuliah: true, kelas: true } },
        _count: { select: { submissions: true } },
      },
    })
    if (!tugas) return NextResponse.json({ error: 'Tugas tidak ditemukan' }, { status: 404 })
    if (tugas.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ tugas })
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
    const existing = await db.tugas.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Tugas tidak ditemukan' }, { status: 404 })
    if (existing.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const title = formData.get('title') as string | null
    const description = formData.get('description') as string | null
    const deadlineStr = formData.get('deadline') as string | null
    const file = formData.get('file') as File | null

    const data: any = {}
    if (title) data.title = title
    if (description !== null) data.description = description
    if (deadlineStr) {
      const deadline = new Date(deadlineStr)
      if (isNaN(deadline.getTime())) {
        return NextResponse.json({ error: 'deadline tidak valid' }, { status: 400 })
      }
      data.deadline = deadline
    }

    if (file && file.size > 0) {
      // Remove old file if exists
      if (existing.filePath) {
        const oldPath = path.join(UPLOAD_DIR, path.basename(existing.filePath))
        try {
          await unlink(oldPath)
        } catch {}
      }
      await mkdir(UPLOAD_DIR, { recursive: true })
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const uniqueName = `${Date.now()}-${safeName}`
      const fullDiskPath = path.join(UPLOAD_DIR, uniqueName)
      const arrayBuffer = await file.arrayBuffer()
      await writeFile(fullDiskPath, Buffer.from(arrayBuffer))
      data.fileName = file.name
      data.filePath = `/uploads/tugas/${uniqueName}`
      data.fileSize = file.size
      data.fileType = file.type || null
    }

    const tugas = await db.tugas.update({
      where: { id },
      data,
      include: {
        dosenAjar: { include: { mataKuliah: true, kelas: true } },
      },
    })

    await logAction(session.id, 'UPDATE_TUGAS', `Update tugas ${id}`, 'INFO')
    return NextResponse.json({ tugas })
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
    const existing = await db.tugas.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Tugas tidak ditemukan' }, { status: 404 })
    if (existing.dosenId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Remove file from disk if exists
    if (existing.filePath) {
      const filePath = path.join(UPLOAD_DIR, path.basename(existing.filePath))
      try {
        await unlink(filePath)
      } catch {}
    }

    await db.tugas.delete({ where: { id } })
    await logAction(session.id, 'DELETE_TUGAS', `Delete tugas ${existing.title}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
