import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { logAction } from '@/lib/logger'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const [users, prodi, kelas, mataKuliah, dosenAjar, mahasiswaKelas, tugas, tugasSubmissions, absensi, absensiRecords, ujian, soalUjian, jawabanUjian, ujianSessions, logHistory] = await Promise.all([
      db.user.findMany({ select: { id: true, email: true, name: true, role: true, nip: true, nim: true, phone: true, createdAt: true } }),
      db.prodi.findMany(),
      db.kelas.findMany(),
      db.mataKuliah.findMany(),
      db.dosenAjar.findMany(),
      db.mahasiswaKelas.findMany(),
      db.tugas.findMany({ select: { id: true, dosenAjarId: true, dosenId: true, title: true, description: true, deadline: true, fileName: true, fileSize: true, fileType: true, createdAt: true } }),
      db.tugasSubmission.findMany({ select: { id: true, tugasId: true, mahasiswaId: true, fileName: true, fileSize: true, fileType: true, note: true, nilai: true, feedback: true, submittedAt: true, gradedAt: true } }),
      db.absensi.findMany(),
      db.absensiRecord.findMany(),
      db.ujian.findMany(),
      db.soalUjian.findMany(),
      db.jawabanUjian.findMany(),
      db.ujianSession.findMany(),
      db.logHistory.findMany(),
    ])

    const backup = {
      _meta: { exportedAt: new Date().toISOString(), version: '1.0', tables: 15 },
      data: { users, prodi, kelas, mataKuliah, dosenAjar, mahasiswaKelas, tugas, tugasSubmissions, absensi, absensiRecords, ujian, soalUjian, jawabanUjian, ujianSessions, logHistory },
    }

    await logAction(session.id, 'BACKUP_DATABASE', `Exported backup (${JSON.stringify(backup).length} bytes)`, 'INFO')
    const filename = `lms-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${filename}"` },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gagal backup' }, { status: 500 })
  }
}