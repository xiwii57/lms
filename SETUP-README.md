# LMS Ujian Online - Setup Lokal

## Cara Menjalankan

### 1. Prasyarat
- Node.js 18+ atau Bun
- Install Bun (recommended): https://bun.sh

### 2. Extract ZIP
```bash
unzip lms-ujian-online.zip
cd lms-ujian-online
```

### 3. Install Dependencies
```bash
bun install
# atau: npm install
```

### 4. Setup Database
```bash
# Buat folder db
mkdir -p db

# Push schema ke SQLite
bun run db:push

# Seed data dummy
bun run scripts/seed.ts
```

### 5. Jalankan Dev Server
```bash
bun run dev
# atau: npm run dev
```

Server jalan di http://localhost:3000

## Akun Login

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@lms.id | admin123 |
| Dosen | dosen@lms.id | dosen123 |
| Mahasiswa 1 | mhs1@lms.id | mhs123 |
| Mahasiswa 2 | mhs2@lms.id | mhs123 |
| Mahasiswa 3 | mhs3@lms.id | mhs123 |

## Fitur Utama

### Admin
- Dashboard + Backup Database
- Manajemen User, Prodi, Kelas, Mata Kuliah
- Penugasan Dosen, Penempatan Mahasiswa
- Log History

### Dosen
- Dashboard, Daftar Mahasiswa
- Tugas (CRUD + upload file + grade)
- Absensi (CRUD + auto-expire + upload surat sakit)
- Ujian (wizard 2 langkah + acak soal + auto-grade PG)
- Nilai

### Mahasiswa
- Dashboard, Tugas, Ujian (anti-cheat), Absensi, Jadwal
- Download Jadwal PDF
- Upload surat sakit/izin

## Database
- SQLite di `db/custom.db`
- Schema: `prisma/schema.prisma`
- Seed: `scripts/seed.ts`

## Backup Database
- Login sebagai admin → Dashboard → klik "Backup DB"
- Atau copy manual file `db/custom.db`
