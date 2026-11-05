'use client'
import { DashboardShell } from '@/components/lms/shared/shell'
import { useUIStore } from '@/lib/store'
import { LayoutDashboard, FileText, FileCheck, CalendarDays, ClipboardCheck } from 'lucide-react'
import { MahasiswaDashboard } from './dashboard'
import { MahasiswaTugas } from './tugas'
import { MahasiswaUjian } from './ujian'
import { MahasiswaJadwal } from './jadwal'
import { MahasiswaAbsensi } from './absensi'

const NAV_ITEMS = [
  { id: 'mhs-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'mhs-tugas', label: 'Tugas', icon: FileText },
  { id: 'mhs-ujian', label: 'Ujian', icon: FileCheck },
  { id: 'mhs-absensi', label: 'Absensi', icon: ClipboardCheck },
  { id: 'mhs-jadwal', label: 'Jadwal Kuliah', icon: CalendarDays },
]

export function MahasiswaApp() {
  const { currentPage } = useUIStore()

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Mahasiswa">
      {currentPage === 'mhs-dashboard' && <MahasiswaDashboard />}
      {currentPage === 'mhs-tugas' && <MahasiswaTugas />}
      {currentPage === 'mhs-ujian' && <MahasiswaUjian />}
      {currentPage === 'mhs-absensi' && <MahasiswaAbsensi />}
      {currentPage === 'mhs-jadwal' && <MahasiswaJadwal />}
      {!['mhs-dashboard', 'mhs-tugas', 'mhs-ujian', 'mhs-absensi', 'mhs-jadwal'].includes(currentPage) && <MahasiswaDashboard />}
    </DashboardShell>
  )
}
