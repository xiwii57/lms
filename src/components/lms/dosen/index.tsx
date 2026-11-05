'use client'
import { useEffect } from 'react'
import {
  LayoutDashboard, Users, FileText, ClipboardCheck, FileCheck, Award,
} from 'lucide-react'
import { DashboardShell } from '@/components/lms/shared/shell'
import { useUIStore } from '@/lib/store'
import { DosenDashboard } from './dashboard'
import { DosenMahasiswa } from './mahasiswa'
import { DosenTugas } from './tugas'
import { DosenAbsensi } from './absensi'
import { DosenUjian } from './ujian'
import { DosenNilai } from './nilai'

const NAV_ITEMS = [
  { id: 'dosen-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'dosen-mahasiswa', label: 'Mahasiswa', icon: Users },
  { id: 'dosen-tugas', label: 'Tugas', icon: FileText },
  { id: 'dosen-absensi', label: 'Absensi', icon: ClipboardCheck },
  { id: 'dosen-ujian', label: 'Ujian', icon: FileCheck },
  { id: 'dosen-nilai', label: 'Nilai', icon: Award },
]

export function DosenApp() {
  const { currentPage, setPage } = useUIStore()

  // Reset to default if invalid or stale
  useEffect(() => {
    const validIds = NAV_ITEMS.map((n) => n.id)
    if (!currentPage || !validIds.includes(currentPage)) {
      setPage('dosen-dashboard')
    }
  }, [currentPage, setPage])

  const page = (() => {
    switch (currentPage) {
      case 'dosen-dashboard': return <DosenDashboard />
      case 'dosen-mahasiswa': return <DosenMahasiswa />
      case 'dosen-tugas': return <DosenTugas />
      case 'dosen-absensi': return <DosenAbsensi />
      case 'dosen-ujian': return <DosenUjian />
      case 'dosen-nilai': return <DosenNilai />
      default: return <DosenDashboard />
    }
  })()

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Dosen">
      {page}
    </DashboardShell>
  )
}
