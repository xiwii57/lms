import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Submit a tugas (upload file jawaban)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const formData = await req.formData()
    const tugasId = formData.get('tugasId') as string
    const note = (formData.get('note') as string) || ''
    const file = formData.get('file') as File

    if (!tugasId || !file) {
      return NextResponse.json({ error: 'tugasId dan file wajib diisi' }, { status: 400 })
    }

    // Verify tugas belongs to mahasiswa's kelas
    const tugas = await db.tugas.findUnique({
      where: { id: tugasId },
      include: { dosenAjar: { include: { kelas: true } } },
    })
    if (!tugas) {
      return NextResponse.json({ error: 'Tugas tidak ditemukan' }, { status: 404 })
    }
    // Check deadline - prevent upload after deadline
    const now = new Date()
    if (new Date(tugas.deadline) < now) {
      return NextResponse.json({ error: 'Tugas telah berakhir — deadline sudah lewat. Upload tidak diperbolehkan.' }, { status: 400 })
    }
    const mhsKelas = await db.mahasiswaKelas.findFirst({
      where: { mahasiswaId: session.id, kelasId: tugas.dosenAjar.kelasId },
    })
    if (!mhsKelas) {
      return NextResponse.json({ error: 'Anda tidak terdaftar di kelas ini' }, { status: 403 })
    }

    // Save file
    const uploadDir = '/home/z/my-project/uploads/submissions'
    await mkdir(uploadDir, { recursive: true })
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '_')
    const fileName = `${Date.now()}-${session.id}-${safeName}`
    const filePath = path.join(uploadDir, fileName)
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    // Upsert submission
    const submission = await db.tugasSubmission.upsert({
      where: { tugasId_mahasiswaId: { tugasId, mahasiswaId: session.id } },
      update: {
        fileName: file.name,
        filePath: `/uploads/submissions/${fileName}`,
        fileSize: file.size,
        fileType: file.type,
        note,
        submittedAt: new Date(),
      },
      create: {
        tugasId,
        mahasiswaId: session.id,
        fileName: file.name,
        filePath: `/uploads/submissions/${fileName}`,
        fileSize: file.size,
        fileType: file.type,
        note,
      },
    })

    await logAction(session.id, 'SUBMIT_TUGAS', `Submit tugas "${tugas.title}"`, 'INFO')

    return NextResponse.json({ submission })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Upload gagal' }, { status: 500 })
  }
}
