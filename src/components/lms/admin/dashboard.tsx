'use client'
import { useEffect, useState } from 'react'
import {
  Users, GraduationCap, BookOpen, BookMarked, Library, FileText,
  History, UserPlus, School, Calendar, ArrowRight, AlertCircle, RefreshCw, Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard, PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDateTime } from '@/components/lms/shared/format'
import { useUIStore } from '@/lib/store'
import { toast } from 'sonner'

interface StatsData {
  users: { ADMIN: number; DOSEN: number; MAHASISWA: number; total: number }
  prodi: number
  kelas: number
  mataKuliah: number
  ujian: number
  tugas: number
  dosenAjar: number
  recentLogs: Array<{
    id: string
    action: string
    detail: string
    level: string
    createdAt: string
    user?: { name: string; email: string } | null
  }>
}

export function AdminDashboard() {
  const setPage = useUIStore((s) => s.setPage)
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/stats', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat statistik')
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const quickActions = [
    { label: 'Tambah User', icon: UserPlus, page: 'admin-users' },
    { label: 'Prodi Baru', icon: BookMarked, page: 'admin-prodi' },
    { label: 'Kelas Baru', icon: School, page: 'admin-kelas' },
    { label: 'Mata Kuliah', icon: Library, page: 'admin-mata-kuliah' },
    { label: 'Penugasan Dosen', icon: Calendar, page: 'admin-dosen-ajar' },
    { label: 'Penempatan Mhs', icon: UserPlus, page: 'admin-mahasiswa-kelas' },
  ]

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Ringkasan aktivitas sistem LMS" />
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-destructive">Gagal memuat data</div>
              <div className="text-sm text-muted-foreground">{error}</div>
            </div>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-2" /> Coba Lagi
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ringkasan aktivitas dan statistik sistem LMS"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const res = await fetch('/api/admin/backup', { credentials: 'include' })
                  if (!res.ok) throw new Error('Gagal backup')
                  const blob = await res.blob()
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `lms-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  window.URL.revokeObjectURL(url)
                  toast.success('Database backup berhasil didownload')
                } catch (e: any) {
                  toast.error(e.message || 'Gagal backup')
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Backup DB
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 sm:p-5">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-8 w-12 mb-2" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))
          : data && (
              <>
                <StatCard label="Total User" value={data.users.total} icon={Users} description={`${data.users.ADMIN} admin`} color="text-primary" />
                <StatCard label="Mahasiswa" value={data.users.MAHASISWA} icon={GraduationCap} description="Aktif terdaftar" color="text-emerald-600" />
                <StatCard label="Dosen" value={data.users.DOSEN} icon={BookOpen} description="Pengajar aktif" color="text-amber-600" />
                <StatCard label="Prodi" value={data.prodi} icon={BookMarked} description="Program studi" color="text-rose-600" />
                <StatCard label="Mata Kuliah" value={data.mataKuliah} icon={Library} description="Total MK" color="text-purple-600" />
                <StatCard label="Ujian" value={data.ujian} icon={FileText} description={`${data.tugas} tugas`} color="text-orange-600" />
              </>
            )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent logs */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                Log Terbaru
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setPage('admin-logs')}>
                Lihat Semua <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : data && data.recentLogs.length === 0 ? (
                <EmptyState icon={History} title="Belum ada log" description="Aktivitas sistem akan muncul di sini" />
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto">
                  {data?.recentLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 hover:bg-accent/40 transition-colors">
                      <Badge
                        variant={log.level === 'ERROR' ? 'destructive' : log.level === 'WARN' ? 'secondary' : 'outline'}
                        className="mt-0.5"
                      >
                        {log.level}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{log.action}</div>
                        <div className="text-xs text-muted-foreground truncate">{log.detail}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {log.user?.name || 'System'} · {formatDateTime(log.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Aksi Cepat</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {quickActions.map((qa) => {
                const Icon = qa.icon
                return (
                  <Button
                    key={qa.page}
                    variant="outline"
                    className="h-auto flex-col gap-2 py-4 justify-center items-center text-center"
                    onClick={() => setPage(qa.page)}
                  >
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="text-xs leading-tight">{qa.label}</span>
                  </Button>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
