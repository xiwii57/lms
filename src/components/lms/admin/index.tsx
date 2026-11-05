'use client'
import { useEffect } from 'react'
import {
  LayoutDashboard, Users, BookMarked, School, Library,
  Calendar, UserCheck, History,
} from 'lucide-react'
import { DashboardShell } from '@/components/lms/shared/shell'
import { useUIStore } from '@/lib/store'
import { AdminDashboard } from './dashboard'
import { AdminUsers } from './users'
import { AdminProdi } from './prodi'
import { AdminKelas } from './kelas'
import { AdminMataKuliah } from './mata-kuliah'
import { AdminDosenAjar } from './dosen-ajar'
import { AdminMahasiswaKelas } from './mahasiswa-kelas'
import { AdminLogs } from './logs'

const NAV_ITEMS = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'admin-users', label: 'Manajemen User', icon: Users },
  { id: 'admin-prodi', label: 'Program Studi', icon: BookMarked },
  { id: 'admin-kelas', label: 'Kelas', icon: School },
  { id: 'admin-mata-kuliah', label: 'Mata Kuliah', icon: Library },
  { id: 'admin-dosen-ajar', label: 'Penugasan Dosen', icon: Calendar },
  { id: 'admin-mahasiswa-kelas', label: 'Penempatan Mhs', icon: UserCheck },
  { id: 'admin-logs', label: 'Log History', icon: History },
]

export function AdminApp() {
  const { currentPage, setPage } = useUIStore()

  // Ensure default page is set on first mount if empty or invalid
  useEffect(() => {
    const validIds = NAV_ITEMS.map((n) => n.id)
    if (!currentPage || !validIds.includes(currentPage)) {
      setPage('admin-dashboard')
    }
  }, [currentPage, setPage])

  const page = (() => {
    switch (currentPage) {
      case 'admin-dashboard': return <AdminDashboard />
      case 'admin-users': return <AdminUsers />
      case 'admin-prodi': return <AdminProdi />
      case 'admin-kelas': return <AdminKelas />
      case 'admin-mata-kuliah': return <AdminMataKuliah />
      case 'admin-dosen-ajar': return <AdminDosenAjar />
      case 'admin-mahasiswa-kelas': return <AdminMahasiswaKelas />
      case 'admin-logs': return <AdminLogs />
      default: return <AdminDashboard />
    }
  })()

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Admin">
      {page}
    </DashboardShell>
  )
}
