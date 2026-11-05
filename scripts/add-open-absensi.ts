import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // Find dosenAjar for Pemrograman Web
  const da = await db.dosenAjar.findFirst({
    where: { scheduleDay: 'Senin' },
    include: { mataKuliah: true, kelas: true },
  })
  if (!da) { console.log('No dosenAjar found'); return }
  console.log(`Found dosenAjar: ${da.mataKuliah.name} - ${da.kelas.name}`)
  // Create OPEN absensi for pertemuan 2
  const absen = await db.absensi.create({
    data: {
      dosenAjarId: da.id,
      tanggal: new Date(),
      pertemuan: 2,
      topic: 'CSS Layout & Flexbox',
      status: 'OPEN',
      openedAt: new Date(),
    },
  })
  console.log(`Created OPEN absensi pertemuan 2: ${absen.id}`)
}
main().then(() => db.$disconnect())
