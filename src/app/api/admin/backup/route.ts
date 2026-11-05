import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readFile } from 'fs/promises'
import path from 'path'
import { logAction } from '@/lib/logger'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const dbUrl = process.env.DATABASE_URL || ''
    let filePath = dbUrl.replace(/^file:/, '')
    if (filePath.startsWith('./')) {
      filePath = filePath.substring(2)
    }
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
            : path.join(/*turbopackIgnore: true*/ process.cwd(), filePath)

    const data = await readFile(absolutePath)

    await logAction(session.id, 'BACKUP_DATABASE', `Downloaded database backup (${data.length} bytes)`, 'INFO')

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `lms-backup-${timestamp}.db`

    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(data.length),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gagal backup database' }, { status: 500 })
  }
}