import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // Find all PG jawaban with nilai null
  const jawaban = await db.jawabanUjian.findMany({
    where: { soal: { type: 'MULTIPLE_CHOICE' }, nilai: null },
    include: { soal: true },
  })
  console.log(`Found ${jawaban.length} PG jawaban to auto-grade`)
  let correct = 0
  for (const j of jawaban) {
    const correctAns = (j.soal.answerKey || '').trim().toUpperCase()
    const studentAns = (j.answer || '').trim().toUpperCase()
    if (correctAns && studentAns === correctAns) {
      await db.jawabanUjian.update({
        where: { id: j.id },
        data: { nilai: j.soal.points, catatan: 'Auto-graded: jawaban benar (PG)' },
      })
      correct++
      console.log(`  ✓ Jawaban ${j.id}: BENAR (${studentAns}) - nilai ${j.soal.points}`)
    } else {
      console.log(`  ✗ Jawaban ${j.id}: SALAH (mahasiswa: ${studentAns}, kunci: ${correctAns}) - leave for manual`)
    }
  }
  console.log(`\nAuto-graded: ${correct} correct`)
}
main().then(() => db.$disconnect())
