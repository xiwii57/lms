import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const da = await db.dosenAjar.findFirst({ where: { scheduleDay: 'Senin' } })
  if (!da) return
  const now = new Date()
  const pastExpiry = new Date(now.getTime() - 60 * 1000) // expired 1 min ago
  const absen = await db.absensi.create({
    data: {
      dosenAjarId: da.id,
      tanggal: now,
      pertemuan: 12,
      topic: 'Test expired absen',
      status: 'OPEN',
      openedAt: now,
      expiresAt: pastExpiry,
      durationMin: 1,
    },
  })
  console.log(`Created expired absen pertemuan 12: ${absen.id}`)
}
main().then(() => db.$disconnect())
