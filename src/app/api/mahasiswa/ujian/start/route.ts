import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'

// Start ujian: creates/activates a UjianSession, returns soal list
// Body: { ujianId }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MAHASISWA') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { ujianId } = await req.json()
    if (!ujianId) {
      return NextResponse.json({ error: 'ujianId wajib diisi' }, { status: 400 })
    }

    // Verify ujian exists and belongs to mahasiswa's kelas
    const ujian = await db.ujian.findUnique({
      where: { id: ujianId },
      include: {
        dosenAjar: { include: { kelas: true, mataKuliah: true } },
        soal: { orderBy: { order: 'asc' } },
      },
    })
    if (!ujian) {
      return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    }
    const mhsKelas = await db.mahasiswaKelas.findFirst({
      where: { mahasiswaId: session.id, kelasId: ujian.dosenAjar.kelasId },
    })
    if (!mhsKelas) {
      return NextResponse.json({ error: 'Anda tidak terdaftar di kelas ini' }, { status: 403 })
    }

    // Check time window
    const now = new Date()
    if (now < new Date(ujian.startTime)) {
      return NextResponse.json({ error: 'Ujian belum dimulai' }, { status: 400 })
    }
    if (now > new Date(ujian.endTime)) {
      return NextResponse.json({ error: 'Ujian telah berakhir' }, { status: 400 })
    }

    // Check existing session
    let ujianSession = await db.ujianSession.findUnique({
      where: { ujianId_mahasiswaId: { ujianId, mahasiswaId: session.id } },
    })

    if (ujianSession) {
      // If already submitted (manually or auto), don't allow restart
      if (ujianSession.status === 'SUBMITTED' || ujianSession.status === 'AUTO_SUBMITTED') {
        return NextResponse.json({
          error: 'Ujian sudah di-submit. Tidak dapat dibuka kembali. Hubungi dosen untuk membuka kembali.',
          session: ujianSession,
        }, { status: 400 })
      }
      // If session in progress, continue
      if (ujianSession.status === 'IN_PROGRESS') {
        // Check if endTime passed
        if (now > new Date(ujianSession.endTime)) {
          // Auto-submit due to timeout
          await db.ujianSession.update({
            where: { id: ujianSession.id },
            data: {
              status: 'EXPIRED',
              autoSubmitted: true,
              reason: 'Waktu ujian habis',
              submittedAt: now,
            },
          })
          return NextResponse.json({ error: 'Waktu ujian telah habis' }, { status: 400 })
        }
      }
    } else {
      // Create new session
      const startTime = now
      const endTime = new Date(now.getTime() + ujian.durationMin * 60 * 1000)
      // Cap at ujian endTime
      const cappedEndTime = endTime > new Date(ujian.endTime) ? new Date(ujian.endTime) : endTime

      ujianSession = await db.ujianSession.create({
        data: {
          ujianId,
          mahasiswaId: session.id,
          startTime,
          endTime: cappedEndTime,
          status: 'IN_PROGRESS',
        },
      })
      await logAction(session.id, 'START_UJIAN', `Mulai ujian "${ujian.title}"`, 'INFO')
    }

    // Load existing jawaban
    const jawaban = await db.jawabanUjian.findMany({
      where: { ujianId, mahasiswaId: session.id },
    })

    // Return soal with jawaban (exclude answerKey for mahasiswa)
    // If shuffleSoal is enabled, randomize soal order per mahasiswa
    let soalList = [...ujian.soal]
    if (ujian.shuffleSoal) {
      // Deterministic shuffle based on mahasiswaId + ujianId for consistency across sessions
      const seed = session.id + ujian.id
      let seedNum = 0
      for (let i = 0; i < seed.length; i++) {
        seedNum = ((seedNum << 5) - seedNum + seed.charCodeAt(i)) | 0
      }
      // Fisher-Yates with seeded PRNG (mulberry32)
      const prng = () => {
        seedNum = (seedNum + 0x6D2B79F5) | 0
        let t = seedNum
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      for (let i = soalList.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1))
        ;[soalList[i], soalList[j]] = [soalList[j], soalList[i]]
      }
    }

    const soalWithJawaban = soalList.map((s, idx) => {
      const j = jawaban.find((x) => x.soalId === s.id)
      return {
        id: s.id,
        pertanyaan: s.pertanyaan,
        type: s.type,
        options: s.options ? JSON.parse(s.options) : null,
        points: s.points,
        order: ujian.shuffleSoal ? idx + 1 : s.order, // re-number if shuffled
        existingAnswer: j?.answer || '',
        jawabanId: j?.id,
      }
    })

    return NextResponse.json({
      ujian: {
        id: ujian.id,
        title: ujian.title,
        type: ujian.type,
        description: ujian.description,
        instruction: ujian.instruction,
        durationMin: ujian.durationMin,
      },
      session: ujianSession,
      soal: soalWithJawaban,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gagal memulai ujian' }, { status: 500 })
  }
}
