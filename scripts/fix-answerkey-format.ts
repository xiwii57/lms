import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // Find all PG soal with answerKey that's NOT a single letter
  const soal = await db.soalUjian.findMany({
    where: { type: 'MULTIPLE_CHOICE' },
  })
  console.log(`Found ${soal.length} PG soal`)
  for (const s of soal) {
    if (!s.options) continue
    const opts = JSON.parse(s.options) as string[]
    const key = (s.answerKey || '').trim()
    // Check if answerKey is already a letter (A-Z, single char)
    if (/^[A-Z]$/i.test(key)) {
      console.log(`  Soal ${s.id}: already letter "${key}" - OK`)
      continue
    }
    // Find which option index matches the answerKey text
    const idx = opts.findIndex((o) => o.trim().toLowerCase() === key.toLowerCase())
    if (idx >= 0) {
      const letter = String.fromCharCode(65 + idx)
      await db.soalUjian.update({ where: { id: s.id }, data: { answerKey: letter } })
      console.log(`  Soal ${s.id}: "${key}" → "${letter}" (matched option ${letter}: "${opts[idx]}")`)
    } else {
      console.log(`  Soal ${s.id}: "${key}" - NO MATCH in options ${JSON.stringify(opts)} - leave as is`)
    }
  }
  console.log('\nDone. Now re-running auto-grade...')
  // Re-run auto-grade
  const jawaban = await db.jawabanUjian.findMany({
    where: { soal: { type: 'MULTIPLE_CHOICE' } },
    include: { soal: true },
  })
  let correct = 0, wrong = 0
  for (const j of jawaban) {
    const correctAns = (j.soal.answerKey || '').trim().toUpperCase()
    const studentAns = (j.answer || '').trim().toUpperCase()
    if (correctAns && studentAns === correctAns) {
      if (j.nilai !== j.soal.points) {
        await db.jawabanUjian.update({
          where: { id: j.id },
          data: { nilai: j.soal.points, catatan: 'Auto-graded: jawaban benar (PG)' },
        })
      }
      correct++
      console.log(`  ✓ Jawaban ${j.id}: ${studentAns} == ${correctAns} - BENAR (nilai ${j.soal.points})`)
    } else {
      // If was previously auto-graded as correct but now wrong, reset
      if (j.nilai === j.soal.points && j.catatan?.includes('Auto-graded')) {
        await db.jawabanUjian.update({
          where: { id: j.id },
          data: { nilai: null, catatan: null },
        })
      }
      wrong++
      console.log(`  ✗ Jawaban ${j.id}: ${studentAns} != ${correctAns} - SALAH (manual review)`)
    }
  }
  console.log(`\nResult: ${correct} correct, ${wrong} need manual review`)
}
main().then(() => db.$disconnect())
