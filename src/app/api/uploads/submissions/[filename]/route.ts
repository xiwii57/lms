import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readFile } from 'fs/promises'
import path from 'path'

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
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
  // Sanitize to prevent path traversal
  const safe = path.basename(filename)
  const filePath = path.join('/home/z/my-project/uploads/submissions', safe)
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
