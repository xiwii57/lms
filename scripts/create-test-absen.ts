import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const da = await db.dosenAjar.findFirst({
    where: { scheduleDay: 'Senin' },
    include: { mataKuliah: true, kelas: true },
  })
  if (!da) { console.log('No dosenAjar found'); return }
  const now = new Date()
  // Create OPEN absen with very short expiry (1 minute) for testing
  const expiresAt = new Date(now.getTime() + 60 * 1000) // 1 minute
  const absen = await db.absensi.create({
    data: {
      dosenAjarId: da.id,
      tanggal: now,
      pertemuan: 99,
      topic: 'TEST - Sesi akan expire dalam 1 menit',
      status: 'OPEN',
      openedAt: now,
      expiresAt,
      durationMin: 1,
    },
  })
  console.log(`Created test absen pertemuan 99 (expires in 1 min): ${absen.id}`)
  console.log(`Expires at: ${expiresAt.toISOString()}`)
}
main().then(() => db.$disconnect())
