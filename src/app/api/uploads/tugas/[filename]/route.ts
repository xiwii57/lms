import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readFile } from 'fs/promises'
import path from 'path'
import { stat } from 'fs/promises'

const UPLOAD_DIR = '/home/z/my-project/uploads/tugas'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { filename } = await params
    // Prevent path traversal
    const safeName = path.basename(filename)
    const filePath = path.join(UPLOAD_DIR, safeName)

    try {
      await stat(filePath)
    } catch {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 })
    }

    const buffer = await readFile(filePath)
    // Guess content type from extension
    const ext = path.extname(safeName).toLowerCase()
    const contentTypeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.txt': 'text/plain',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
    }
    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Content-Disposition', `inline; filename="${safeName}"`)

    return new NextResponse(buffer, { status: 200, headers })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
