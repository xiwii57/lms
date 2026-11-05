import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readFile } from 'fs/promises'
import path from 'path'

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { filename } = await params
  const safe = path.basename(filename)
  const filePath = path.join('/home/z/my-project/uploads/absensi', safe)
  try {
    const data = await readFile(filePath)
    const ext = path.extname(safe).toLowerCase()
    const contentType = MIME[ext] || 'application/octet-stream'
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safe}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 })
  }
}
