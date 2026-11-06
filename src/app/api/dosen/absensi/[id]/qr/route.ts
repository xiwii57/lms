import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import QRCode from 'qrcode'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'DOSEN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await params
    const absensi = await db.absensi.findUnique({
      where: { id },
      include: { dosenAjar: true },
    })
    if (!absensi || absensi.dosenAjar.dosenId !== session.id) {
      return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
    }
    if (absensi.status !== 'OPEN') {
      return NextResponse.json({ error: 'Sesi sudah ditutup' }, { status: 400 })
    }

    const qrData = JSON.stringify({ absenId: id, type: 'absensi' })
    const qrBuffer = await QRCode.toBuffer(qrData, {
      width: 400, margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })

    const uint8Array = new Uint8Array(qrBuffer)
    return new NextResponse(uint8Array, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gagal generate QR' }, { status: 500 })
  }
}