import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { logAction } from '@/lib/logger'
import { hashPassword, generateSecurePassword } from '@/lib/security'

function genPassword(): string {
  return generateSecurePassword(12)
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const role = searchParams.get('role')
    const search = searchParams.get('search')

    const where: any = {}
    if (role) where.role = role.toUpperCase()
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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

    // Strip passwords
    const safe = users.map((u) => {
      const { password, ...rest } = u
      return rest
    })

    return NextResponse.json({ users: safe })
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
    const { email, password, name, role, nip, nim, phone, kelasIds } = body

    if (!email || !name || !role) {
      return NextResponse.json({ error: 'email, name, role wajib diisi' }, { status: 400 })
    }
    const roleUpper = String(role).toUpperCase()
    if (!['ADMIN', 'DOSEN', 'MAHASISWA', 'OPERATOR'].includes(roleUpper)) {
      return NextResponse.json({ error: 'role tidak valid' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 400 })
    }

    const finalPassword = password && String(password).trim().length > 0 ? String(password) : genPassword()
    const hashedPassword = await hashPassword(finalPassword)

    const user = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        name,
        role: roleUpper,
        nip: nip || null,
        nim: nim || null,
        phone: phone || null,
      },
    })

    // If mahasiswa and kelasIds provided, assign to kelas
    if (roleUpper === 'MAHASISWA' && Array.isArray(kelasIds) && kelasIds.length > 0) {
      for (const kelasId of kelasIds) {
        const existing = await db.mahasiswaKelas.findUnique({
          where: { mahasiswaId_kelasId: { mahasiswaId: user.id, kelasId } },
        })
        if (!existing) {
          await db.mahasiswaKelas.create({
            data: { mahasiswaId: user.id, kelasId },
          })
        }
      }
    }

    await logAction(session.id, 'CREATE_USER', `Create user ${user.email} role ${user.role}`, 'INFO')

    const { password: _p, ...safe } = user
    return NextResponse.json({ user: safe, generatedPassword: password ? undefined : finalPassword })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
