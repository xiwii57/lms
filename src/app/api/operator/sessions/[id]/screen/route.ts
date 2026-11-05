import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCapture } from '@/lib/capture-store'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cap = getCapture(id)
  if (!cap?.screenFrame) {
    return new NextResponse('', { status: 404 })
  }
  const base64 = cap.screenFrame.split(',')[1]
  const buffer = Buffer.from(base64, 'base64')
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
