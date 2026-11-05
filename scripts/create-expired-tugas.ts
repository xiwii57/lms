import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const tugas = await db.tugas.findFirst({ include: { dosenAjar: true } })
  if (!tugas) return
  // Update deadline to past
  await db.tugas.update({
    where: { id: tugas.id },
    data: { deadline: new Date(Date.now() - 86400000) }, // 1 day ago
  })
  console.log(`Updated tugas ${tugas.id} deadline to past`)
}
main().then(() => db.$disconnect())
