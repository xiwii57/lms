import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const da = await db.dosenAjar.findFirst({ where: { scheduleDay: 'Senin' } })
  if (!da) return
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
  const absen = await db.absensi.create({
    data: {
      dosenAjarId: da.id,
      tanggal: now,
      pertemuan: 10,
      topic: 'Test Upload File Sakit/Izin',
      status: 'OPEN',
      openedAt: now,
      expiresAt,
      durationMin: 60,
    },
  })
  console.log(`Created absen pertemuan 10: ${absen.id}`)
}
main().then(() => db.$disconnect())
