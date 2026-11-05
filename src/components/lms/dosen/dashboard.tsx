'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, Users, FileText, FileCheck, CalendarClock, Clock,
  RefreshCw, AlertCircle, DoorOpen, GraduationCap, ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard, PageHeader, EmptyState } from '@/components/lms/shared/ui'
import {
  formatDate, formatDateTime, timeUntil, statusBadge,
} from '@/components/lms/shared/format'
import { useUIStore } from '@/lib/store'
import { toast } from 'sonner'

interface MataKuliah {
  id: string
  name: string
  code: string
  sks: number
}
interface Kelas {
  id: string
  name: string
}
interface DosenAjar {
  id: string
  scheduleDay: string
  scheduleTime: string
  room?: string | null
  mataKuliah: MataKuliah
  kelas: Kelas
}
interface TugasRow {
  id: string
  title: string
  deadline: string
  createdAt: string
  dosenAjar: { mataKuliah: MataKuliah; kelas: Kelas }
  _count?: { submissions: number }
}
interface UjianRow {
  id: string
  title: string
  type: string
  startTime: string
  endTime: string
  durationMin: number
  dosenAjar: { mataKuliah: MataKuliah; kelas: Kelas }
}
interface DashboardData {
  dosenAjar: DosenAjar[]
  todaySchedule: DosenAjar[]
  recentTugas: TugasRow[]
  upcomingUjian: UjianRow[]
  stats: {
    totalKelas: number
    totalMataKuliah: number
    totalDosenAjar: number
  }
}

export function DosenDashboard() {
  const setPage = useUIStore((s) => s.setPage)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dosen/dashboard', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat dashboard')
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Ringkasan aktivitas mengajar Anda" />
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

  const stats = data?.stats

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ringkasan aktivitas mengajar Anda hari ini"
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 sm:p-5">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-8 w-12 mb-2" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))
        ) : data && stats && (
          <>
            <StatCard
              label="Kelas Diajar"
              value={stats.totalDosenAjar || data.dosenAjar.length}
              icon={BookOpen}
              description={`${stats.totalKelas} kelas unik`}
              color="text-primary"
            />
            <StatCard
              label="Mata Kuliah"
              value={stats.totalMataKuliah}
              icon={GraduationCap}
              description="Yang Anda ampu"
              color="text-emerald-600"
            />
            <StatCard
              label="Tugas Terbaru"
              value={data.recentTugas.length}
              icon={FileText}
              description="5 terbaru dibuat"
              color="text-amber-600"
            />
            <StatCard
              label="Ujian Mendatang"
              value={data.upcomingUjian.length}
              icon={FileCheck}
              description="Akan berlangsung"
              color="text-rose-600"
            />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today schedule */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
              Jadwal Hari Ini
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setPage('dosen-mahasiswa')}>
              Mahasiswa <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : data && data.todaySchedule.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Tidak ada jadwal hari ini"
                description="Nikmati hari libur atau cek jadwal lain"
              />
            ) : (
              <div className="divide-y">
                {data?.todaySchedule.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 p-3 hover:bg-accent/40 transition-colors">
                    <div className="flex-shrink-0 w-14 text-center">
                      <div className="text-xs text-muted-foreground">
                        {d.scheduleTime.split('-')[0]}
                      </div>
                      <Clock className="w-3 h-3 mx-auto text-muted-foreground mt-0.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.mataKuliah.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.mataKuliah.code} · {d.kelas.name}
                      </div>
                      {d.room && (
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <DoorOpen className="w-3 h-3" /> {d.room}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {d.scheduleTime}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming ujian */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-muted-foreground" />
              Ujian Mendatang
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setPage('dosen-ujian')}>
              Kelola <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : data && data.upcomingUjian.length === 0 ? (
              <EmptyState
                icon={FileCheck}
                title="Tidak ada ujian mendatang"
                description="Buat ujian baru dari halaman Ujian"
              />
            ) : (
              <div className="divide-y max-h-96 overflow-y-auto">
                {data?.upcomingUjian.map((u) => {
                  const sb = statusBadge(u.type === 'UTS' ? 'ONGOING' : u.type === 'UAS' ? 'FINISHED' : 'IN_PROGRESS')
                  return (
                    <div key={u.id} className="flex items-start gap-3 p-3 hover:bg-accent/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {u.dosenAjar.mataKuliah.code} · {u.dosenAjar.kelas.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Mulai: {formatDateTime(u.startTime)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-xs">{u.type}</Badge>
                        <span className="text-xs text-muted-foreground">{timeUntil(u.startTime)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent tugas */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Tugas Terbaru
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setPage('dosen-tugas')}>
              Lihat Semua <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : data && data.recentTugas.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Belum ada tugas"
                description="Buat tugas baru dari halaman Tugas"
              />
            ) : (
              <div className="divide-y">
                {data?.recentTugas.map((t) => {
                  const overdue = new Date(t.deadline).getTime() < Date.now()
                  return (
                    <div key={t.id} className="flex items-start gap-3 p-3 hover:bg-accent/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.dosenAjar.mataKuliah.code} · {t.dosenAjar.kelas.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Deadline: {formatDateTime(t.deadline)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {t._count?.submissions || 0} submission
                        </Badge>
                        <span className={`text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {overdue ? 'Berakhir' : timeUntil(t.deadline)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
