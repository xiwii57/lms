import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const kelasId = searchParams.get('kelasId')
    const mahasiswaId = searchParams.get('mahasiswaId')

    const where: any = {}
    if (kelasId) where.kelasId = kelasId
    if (mahasiswaId) where.mahasiswaId = mahasiswaId

    const list = await db.mahasiswaKelas.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        mahasiswa: { select: { id: true, name: true, email: true, nim: true } },
        kelas: { include: { prodi: true } },
      },
    })
    return NextResponse.json({ mahasiswaKelas: list })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { mahasiswaId, kelasId } = body
    if (!mahasiswaId || !kelasId) {
      return NextResponse.json({ error: 'mahasiswaId dan kelasId wajib diisi' }, { status: 400 })
    }

    const mhs = await db.user.findUnique({ where: { id: mahasiswaId } })
    if (!mhs || mhs.role !== 'MAHASISWA') {
      return NextResponse.json({ error: 'User bukan mahasiswa' }, { status: 400 })
    }
    const kelas = await db.kelas.findUnique({ where: { id: kelasId } })
    if (!kelas) return NextResponse.json({ error: 'Kelas tidak ditemukan' }, { status: 400 })

    const existing = await db.mahasiswaKelas.findUnique({
      where: { mahasiswaId_kelasId: { mahasiswaId, kelasId } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Mahasiswa sudah terdaftar di kelas ini' }, { status: 400 })
    }

    const mk = await db.mahasiswaKelas.create({ data: { mahasiswaId, kelasId } })
    await logAction(session.id, 'ASSIGN_MAHASISWA_KELAS', `Assign mhs ${mahasiswaId} to kelas ${kelasId}`, 'INFO')
    return NextResponse.json({ mahasiswaKelas: mk })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const mahasiswaId = searchParams.get('mahasiswaId')
    const kelasId = searchParams.get('kelasId')
    if (!mahasiswaId || !kelasId) {
      return NextResponse.json({ error: 'mahasiswaId dan kelasId wajib diisi sebagai query' }, { status: 400 })
    }

    await db.mahasiswaKelas.deleteMany({ where: { mahasiswaId, kelasId } })
    await logAction(session.id, 'REMOVE_MAHASISWA_KELAS', `Remove mhs ${mahasiswaId} from kelas ${kelasId}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
