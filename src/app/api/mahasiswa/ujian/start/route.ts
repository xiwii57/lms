import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'

// ============================================================================
// Start ujian: creates/activates a UjianSession, returns soal list
// ----------------------------------------------------------------------------
// Body: { ujianId }
//
// OPTIMIZED:
//   - 1 query ambil ujian + soal (select hanya field perlu, exclude answerKey)
//   - 2 paralel query untuk mhsKelas + ujianSession (Promise.all)
//   - 1 query jawaban (hanya kalau session sudah IN_PROGRESS untuk resume)
// ============================================================================
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

    // 1 query: ambil ujian + soal + dosenAjar.kelasId (untuk verifikasi mahasiswa)
    // Select HANYA field yang dibutuhkan — exclude answerKey di soal
    const ujian = await db.ujian.findUnique({
      where: { id: ujianId },
      select: {
        id: true,
        title: true,
        type: true,
        description: true,
        instruction: true,
        durationMin: true,
        startTime: true,
        endTime: true,
        shuffleSoal: true,
        dosenAjar: { select: { kelasId: true } },
        soal: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            pertanyaan: true,
            type: true,
            options: true,
            points: true,
            order: true,
            // answerKey TIDAK di-select — tidak boleh kirim ke client
          },
        },
      },
    })
    if (!ujian) {
      return NextResponse.json({ error: 'Ujian tidak ditemukan' }, { status: 404 })
    }

    // 2 paralel query: verifikasi mahasiswa kelas + cek session existing
    const [mhsKelas, existingSession] = await Promise.all([
      db.mahasiswaKelas.findFirst({
        where: { mahasiswaId: session.id, kelasId: ujian.dosenAjar.kelasId },
        select: { id: true },
      }),
      db.ujianSession.findUnique({
        where: { ujianId_mahasiswaId: { ujianId, mahasiswaId: session.id } },
        select: { id: true, status: true, startTime: true, endTime: true },
      }),
    ])

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

    // Handle existing session
    let ujianSession: { id: string; status: string; startTime: Date; endTime: Date }
    let jawaban: { soalId: string; answer: string }[] = []

    if (existingSession) {
      // Sudah submitted → tidak bisa restart
      if (existingSession.status === 'SUBMITTED' || existingSession.status === 'AUTO_SUBMITTED') {
        return NextResponse.json(
          {
            error: 'Ujian sudah di-submit. Hubungi dosen/operator untuk membuka kembali.',
            session: existingSession,
          },
          { status: 400 },
        )
      }
      // IN_PROGRESS → continue, cek endTime
      if (existingSession.status === 'IN_PROGRESS') {
        if (now > new Date(existingSession.endTime)) {
          await db.ujianSession.update({
            where: { id: existingSession.id },
            data: {
              status: 'EXPIRED',
              autoSubmitted: true,
              reason: 'Waktu ujian habis',
              submittedAt: now,
            },
          })
          return NextResponse.json({ error: 'Waktu ujian telah habis' }, { status: 400 })
        }
        ujianSession = existingSession
        // Load existing jawaban untuk resume
        jawaban = await db.jawabanUjian.findMany({
          where: { ujianId, mahasiswaId: session.id },
          select: { soalId: true, answer: true },
        })
      } else {
        ujianSession = existingSession
      }
    } else {
      // Create new session
      const startTime = now
      const endTime = new Date(now.getTime() + ujian.durationMin * 60 * 1000)
      const cappedEndTime = endTime > new Date(ujian.endTime) ? new Date(ujian.endTime) : endTime

      ujianSession = await db.ujianSession.create({
        data: {
          ujianId,
          mahasiswaId: session.id,
          startTime,
          endTime: cappedEndTime,
          status: 'IN_PROGRESS',
        },
        select: { id: true, status: true, startTime: true, endTime: true },
      })
      // Log di background — tidak perlu tunggu
      logAction(session.id, 'START_UJIAN', `Mulai ujian "${ujian.title}"`, 'INFO').catch(() => {})
    }

    // Shuffle soal kalau aktif (deterministic per mahasiswa+ujian)
    let soalList = [...ujian.soal]
    if (ujian.shuffleSoal) {
      const seed = session.id + ujian.id
      let seedNum = 0
      for (let i = 0; i < seed.length; i++) {
        seedNum = ((seedNum << 5) - seedNum + seed.charCodeAt(i)) | 0
      }
      const prng = () => {
        seedNum = (seedNum + 0x6d2b79f5) | 0
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
        order: ujian.shuffleSoal ? idx + 1 : s.order,
        existingAnswer: j?.answer || '',
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
        startTime: ujian.startTime,
        endTime: ujian.endTime,
        shuffleSoal: ujian.shuffleSoal,
      },
      session: ujianSession,
      soal: soalWithJawaban,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gagal memulai ujian' }, { status: 500 })
  }
} 