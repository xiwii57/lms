import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { validateFile, validateFileContent, sanitizeFilename } from '@/lib/security'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await params
    const formData = await req.formData()
    const status = formData.get('status') as string || 'IZIN'
    const note = (formData.get('note') as string) || null
    const file = formData.get('file') as File | null

    if (!['IZIN', 'SAKIT'].includes(status)) {
      return NextResponse.json({ error: 'Status tidak valid. Gunakan Izin atau Sakit.' }, { status: 400 })
    }

    if (status === 'SAKIT' && !file) {
      return NextResponse.json({ error: 'Untuk Sakit, wajib upload surat dokter' }, { status: 400 })
    }

    const absensi = await db.absensi.findUnique({
      where: { id },
      include: { dosenAjar: { include: { kelas: true } } },
    })
    if (!absensi) {
      return NextResponse.json({ error: 'Sesi absen tidak ditemukan' }, { status: 404 })
    }

    const now = new Date()
    const isExpired = absensi.status === 'CLOSED' || absensi.status === 'EXPIRED' ||
      (absensi.expiresAt && new Date(absensi.expiresAt) < now)
    if (isExpired) {
      return NextResponse.json({ error: 'Sesi absen berakhir' }, { status: 400 })
    }

    const mhsKelas = await db.mahasiswaKelas.findFirst({
      where: { mahasiswaId: session.id, kelasId: absensi.dosenAjar.kelasId },
    })
    if (!mhsKelas) {
      return NextResponse.json({ error: 'Anda tidak terdaftar di kelas ini' }, { status: 403 })
    }

    const existing = await db.absensiRecord.findUnique({
      where: { absensiId_mahasiswaId: { absensiId: id, mahasiswaId: session.id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Anda sudah absen untuk sesi ini' }, { status: 400 })
    }

    let fileName: string | null = null
    let filePath: string | null = null
    let fileSize: number | null = null
    let fileType: string | null = null

    if (file) {
      const fileValidation = validateFile(file)
      if (!fileValidation.valid) {
        return NextResponse.json({ error: fileValidation.error }, { status: 400 })
      }
      const contentValidation = await validateFileContent(file)
      if (!contentValidation.valid) {
        return NextResponse.json({ error: contentValidation.error }, { status: 400 })
      }

      const uploadDir = path.join(process.cwd(), 'uploads', 'absensi')
      await mkdir(uploadDir, { recursive: true })
      const safeName = sanitizeFilename(file.name)
      const uniqueName = `${Date.now()}-${session.id}-${safeName}`
      const fullFilePath = path.join(uploadDir, uniqueName)
      const bytes = await file.arrayBuffer()
      await writeFile(fullFilePath, Buffer.from(bytes))
      fileName = file.name
      filePath = `/api/uploads/absensi/${uniqueName}`
      fileSize = file.size
      fileType = file.type
    }

    const record = await db.absensiRecord.create({
      data: { absensiId: id, mahasiswaId: session.id, status, note, fileName, filePath, fileSize, fileType },
    })

    await logAction(session.id, 'SUBMIT_ABSENSI', `Absen ${status} untuk pertemuan ${absensi.pertemuan}${file ? ' (with file)' : ''}`, 'INFO')
    return NextResponse.json({ record })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gagal submit absen' }, { status: 500 })
  }
}