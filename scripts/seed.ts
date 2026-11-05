// Seed script for LMS Ujian Online
// Run with: bun run scripts/seed.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Clean existing data
  await db.logHistory.deleteMany()
  await db.jawabanUjian.deleteMany()
  await db.ujianSession.deleteMany()
  await db.soalUjian.deleteMany()
  await db.ujian.deleteMany()
  await db.absensiRecord.deleteMany()
  await db.absensi.deleteMany()
  await db.tugasSubmission.deleteMany()
  await db.tugas.deleteMany()
  await db.mahasiswaKelas.deleteMany()
  await db.dosenAjar.deleteMany()
  await db.mataKuliah.deleteMany()
  await db.kelas.deleteMany()
  await db.prodi.deleteMany()
  await db.user.deleteMany()

  // ===== PRODI =====
  const prodiTI = await db.prodi.create({
    data: { name: 'Teknik Informatika', code: 'TI' },
  })
  const prodiSI = await db.prodi.create({
    data: { name: 'Sistem Informasi', code: 'SI' },
  })
  console.log(`✓ Prodi: ${prodiTI.name}, ${prodiSI.name}`)

  // ===== KELAS =====
  const kelasTI3A = await db.kelas.create({
    data: { name: 'TI-3A', prodiId: prodiTI.id },
  })
  const kelasTI3B = await db.kelas.create({
    data: { name: 'TI-3B', prodiId: prodiTI.id },
  })
  console.log(`✓ Kelas: ${kelasTI3A.name}, ${kelasTI3B.name}`)

  // ===== MATA KULIAH =====
  const mkPemweb = await db.mataKuliah.create({
    data: { name: 'Pemrograman Web', code: 'PW', sks: 3, semester: 3, prodiId: prodiTI.id },
  })
  const mkBasisData = await db.mataKuliah.create({
    data: { name: 'Basis Data', code: 'BD', sks: 3, semester: 3, prodiId: prodiTI.id },
  })
  const mkAlgo = await db.mataKuliah.create({
    data: { name: 'Algoritma & Struktur Data', code: 'ASD', sks: 4, semester: 2, prodiId: prodiTI.id },
  })
  console.log(`✓ Mata Kuliah: ${mkPemweb.name}, ${mkBasisData.name}, ${mkAlgo.name}`)

  // ===== USERS =====
  const admin = await db.user.create({
    data: {
      email: 'admin@lms.id',
      password: 'admin123',
      name: 'Administrator',
      role: 'ADMIN',
      phone: '0811111111',
    },
  })
  const dosen = await db.user.create({
    data: {
      email: 'dosen@lms.id',
      password: 'dosen123',
      name: 'Dr. Budi Santoso, M.Kom',
      role: 'DOSEN',
      nip: '198501012010011001',
      phone: '0822222222',
    },
  })
  const mhs1 = await db.user.create({
    data: {
      email: 'mhs1@lms.id',
      password: 'mhs123',
      name: 'Ahmad Fauzi',
      role: 'MAHASISWA',
      nim: '2021001',
      phone: '0833300011',
    },
  })
  const mhs2 = await db.user.create({
    data: {
      email: 'mhs2@lms.id',
      password: 'mhs123',
      name: 'Siti Nurhaliza',
      role: 'MAHASISWA',
      nim: '2021002',
      phone: '0833300022',
    },
  })
  const mhs3 = await db.user.create({
    data: {
      email: 'mhs3@lms.id',
      password: 'mhs123',
      name: 'Budi Pratama',
      role: 'MAHASISWA',
      nim: '2021003',
      phone: '0833300033',
    },
  })
  console.log(`✓ Users: admin, dosen, 3 mahasiswa`)

  // ===== DOSEN AJAR =====
  const dosenAjar1 = await db.dosenAjar.create({
    data: {
      dosenId: dosen.id,
      mataKuliahId: mkPemweb.id,
      kelasId: kelasTI3A.id,
      scheduleDay: 'Senin',
      scheduleTime: '08:00-10:00',
      room: 'Lab Komputer 1',
    },
  })
  const dosenAjar2 = await db.dosenAjar.create({
    data: {
      dosenId: dosen.id,
      mataKuliahId: mkBasisData.id,
      kelasId: kelasTI3A.id,
      scheduleDay: 'Selasa',
      scheduleTime: '10:00-12:00',
      room: 'Ruang 204',
    },
  })
  console.log(`✓ Dosen assignments: ${mkPemweb.name} (${kelasTI3A.name}), ${mkBasisData.name} (${kelasTI3A.name})`)

  // ===== MAHASISWA KELAS =====
  await db.mahasiswaKelas.createMany({
    data: [
      { mahasiswaId: mhs1.id, kelasId: kelasTI3A.id },
      { mahasiswaId: mhs2.id, kelasId: kelasTI3A.id },
      { mahasiswaId: mhs3.id, kelasId: kelasTI3A.id },
    ],
  })
  console.log(`✓ Mahasiswa assignments: 3 mahasiswa ke ${kelasTI3A.name}`)

  // ===== TUGAS =====
  const tugas1 = await db.tugas.create({
    data: {
      dosenAjarId: dosenAjar1.id,
      dosenId: dosen.id,
      title: 'Tugas 1: Membuat Landing Page',
      description: 'Buatlah landing page sederhana menggunakan HTML, CSS, dan JavaScript. Tema bebas. Tidak boleh menggunakan framework CSS.',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  const tugas2 = await db.tugas.create({
    data: {
      dosenAjarId: dosenAjar1.id,
      dosenId: dosen.id,
      title: 'Tugas 2: Implementasi React Components',
      description: 'Implementasikan 5 komponen React dengan state management. Dokumentasi singkat diperlukan.',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  })
  console.log(`✓ Tugas: ${tugas1.title}, ${tugas2.title}`)

  // ===== ABSENSI =====
  const absensi1 = await db.absensi.create({
    data: {
      dosenAjarId: dosenAjar1.id,
      tanggal: new Date(),
      pertemuan: 1,
      topic: 'Pengenalan HTML & CSS',
      status: 'CLOSED',
      openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      closedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  })
  await db.absensiRecord.createMany({
    data: [
      { absensiId: absensi1.id, mahasiswaId: mhs1.id, status: 'HADIR' },
      { absensiId: absensi1.id, mahasiswaId: mhs2.id, status: 'HADIR' },
      { absensiId: absensi1.id, mahasiswaId: mhs3.id, status: 'SAKIT', note: 'Surat sakit terlampir' },
    ],
  })
  console.log(`✓ Absensi: Pertemuan 1 with 3 records`)

  // ===== UJIAN (UTS) =====
  const ujian1 = await db.ujian.create({
    data: {
      dosenAjarId: dosenAjar1.id,
      dosenId: dosen.id,
      title: 'UTS - Pemrograman Web',
      type: 'UTS',
      description: 'Ujian Tengah Semester - Pemrograman Web. Materi: HTML, CSS, JavaScript dasar.',
      startTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      durationMin: 90,
      status: 'PUBLISHED',
      instruction: 'Wajib mengaktifkan kamera dan screen share. Dilarang keluar tab/browser. Jawaban akan otomatis ter-submit jika ada pelanggaran.',
    },
  })
  await db.soalUjian.createMany({
    data: [
      {
        ujianId: ujian1.id,
        pertanyaan: 'Jelaskan perbedaan antara HTML, CSS, dan JavaScript beserta fungsinya masing-masing dalam pengembangan web!',
        type: 'ESSAY',
        answerKey: 'HTML: struktur; CSS: styling; JavaScript: interaktivitas. Setiap poin 10 point.',
        points: 20,
        order: 1,
      },
      {
        ujianId: ujian1.id,
        pertanyaan: 'Tag HTML manakah yang digunakan untuk membuat paragraf?',
        type: 'MULTIPLE_CHOICE',
        options: JSON.stringify(['<p>', '<para>', '<paragraph>', '<text>']),
        answerKey: '<p>',
        points: 10,
        order: 2,
      },
      {
        ujianId: ujian1.id,
        pertanyaan: 'Apa kepanjangan dari CSS dan jelaskan fungsinya!',
        type: 'ESSAY',
        answerKey: 'Cascading Style Sheets, untuk styling halaman web.',
        points: 15,
        order: 3,
      },
      {
        ujianId: ujian1.id,
        pertanyaan: 'Manakah perintah JavaScript yang benar untuk menampilkan pesan ke user?',
        type: 'MULTIPLE_CHOICE',
        options: JSON.stringify(['console.message()', 'alert()', 'print()', 'display()']),
        answerKey: 'alert()',
        points: 10,
        order: 4,
      },
      {
        ujianId: ujian1.id,
        pertanyaan: 'Sebutkan 3 framework CSS yang populer dan jelaskan keunggulannya!',
        type: 'ESSAY',
        answerKey: 'Bootstrap, Tailwind, Bulma. Setiap framework benar 5 point.',
        points: 15,
        order: 5,
      },
    ],
  })
  console.log(`✓ Ujian: ${ujian1.title} with 5 soal`)

  // ===== LOG HISTORY =====
  await db.logHistory.createMany({
    data: [
      {
        userId: admin.id,
        action: 'SEED_DATA',
        detail: 'Database initialized with dummy data',
        level: 'INFO',
      },
      {
        userId: admin.id,
        action: 'CREATE_USER',
        detail: `Created dosen account: ${dosen.email}`,
        level: 'INFO',
      },
      {
        userId: admin.id,
        action: 'CREATE_USER',
        detail: `Created 3 mahasiswa accounts`,
        level: 'INFO',
      },
      {
        userId: admin.id,
        action: 'ASSIGN_DOSEN',
        detail: `Assigned dosen to teach ${mkPemweb.name} (${kelasTI3A.name})`,
        level: 'INFO',
      },
    ],
  })
  console.log(`✓ Log history: 4 entries`)

  console.log('\n✅ Seeding complete!\n')
  console.log('=== LOGIN CREDENTIALS ===')
  console.log('Admin     : admin@lms.id / admin123')
  console.log('Dosen     : dosen@lms.id / dosen123')
  console.log('Mahasiswa : mhs1@lms.id / mhs123')
  console.log('Mahasiswa : mhs2@lms.id / mhs123')
  console.log('Mahasiswa : mhs3@lms.id / mhs123')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
