import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      include: {
        mahasiswaKelas: { include: { kelas: { include: { prodi: true } } } },
        dosenAjar: {
          include: {
            mataKuliah: true,
            kelas: { include: { prodi: true } },
          },
        },
      },
    })
    if (!user) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

    const { password, ...safe } = user
    return NextResponse.json({ user: safe })
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
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { email, password, name, role, nip, nim, phone, kelasIds } = body

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

    if (email && email.toLowerCase().trim() !== existing.email) {
      const dup = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
      if (dup) return NextResponse.json({ error: 'Email sudah digunakan' }, { status: 400 })
    }

    const data: any = {}
    if (email) data.email = email.toLowerCase().trim()
    if (name) data.name = name
    if (role) {
      const roleUpper = String(role).toUpperCase()
      if (!['ADMIN', 'DOSEN', 'MAHASISWA', 'OPERATOR'].includes(roleUpper)) {
        return NextResponse.json({ error: 'role tidak valid' }, { status: 400 })
      }
      data.role = roleUpper
    }
    if (password && String(password).trim().length > 0) {
      const { hashPassword } = await import('@/lib/security')
      data.password = await hashPassword(String(password).trim())
    }
    if (nip !== undefined) data.nip = nip || null
    if (nim !== undefined) data.nim = nim || null
    if (phone !== undefined) data.phone = phone || null

    const user = await db.user.update({ where: { id }, data })

    // Reassign kelas for mahasiswa if kelasIds provided
    if (Array.isArray(kelasIds)) {
      await db.mahasiswaKelas.deleteMany({ where: { mahasiswaId: id } })
      if (kelasIds.length > 0) {
        for (const kelasId of kelasIds) {
          await db.mahasiswaKelas.create({
            data: { mahasiswaId: id, kelasId },
          })
        }
      }
    }

    await logAction(session.id, 'UPDATE_USER', `Update user ${user.email}`, 'INFO')

    const { password: _p, ...safe } = user
    return NextResponse.json({ user: safe })
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
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

    await db.user.delete({ where: { id } })

    await logAction(session.id, 'DELETE_USER', `Delete user ${existing.email}`, 'INFO')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
