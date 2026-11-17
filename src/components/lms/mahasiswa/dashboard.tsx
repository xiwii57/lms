'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, StatCard, EmptyState } from '@/components/lms/shared/ui'
import { formatDate, formatTime, timeUntil, statusBadge, DAYS } from '@/components/lms/shared/format'
import { useAuthStore, useUIStore } from '@/lib/store'
import { fetchWithCache } from '@/lib/client-cache'
import { BookOpen, FileText, FileCheck, Clock, CalendarDays, ArrowRight, AlertCircle } from 'lucide-react'

interface DashboardData {
  kelas: any[]
  tugas: any[]
  ujian: any[]
  schedule: Record<string, any[]>
}

export function MahasiswaDashboard() {
  const { user } = useAuthStore()
  const { setPage } = useUIStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cacheKey = `mhs-dashboard-${user?.id}`
    let cancelled = false

    async function load() {
      try {
        const { data: cached, isStale, fresh } = await fetchWithCache<DashboardData>(
          cacheKey,
          '/api/mahasiswa/dashboard',
        )
        if (cancelled) return

        // Kalau ada cache (fresh atau stale), langsung render — tidak perlu loading spinner
        if (cached) {
          setData(cached)
          setLoading(false)
        }

        // Kalau ada fresh data dari server, update state
        if (fresh) {
          setData(fresh)
        } else if (!cached) {
          // Tidak ada cache dan tidak ada fresh data — baru pertama load
          setLoading(false)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState icon={AlertCircle} title="Gagal memuat dashboard" description={error || 'Terjadi kesalahan'} />
        </CardContent>
      </Card>
    )
  }

  const today = DAYS[(new Date().getDay() + 6) % 7] // Senin=0
  const todaySchedule = data.schedule[today] || []
  const activeTugas = data.tugas.filter((t) => !t.submissions?.length).slice(0, 5)
  const activeUjian = data.ujian.filter((u) => !u.sessions?.length || u.sessions?.[0]?.status === 'NOT_STARTED').slice(0, 5)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Halo, ${user?.name.split(' ')[0]}!`}
        description={`Selamat datang di dashboard mahasiswa${user?.nim ? ` - NIM: ${user.nim}` : ''}`}
      />

      {/* Stat Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Kelas Aktif" value={data.kelas.length} icon={BookOpen} description="Kelas yang diikuti" />
        <StatCard label="Tugas Belum Dikerjakan" value={activeTugas.length} icon={FileText} color="text-amber-600" description="Tugas pending" />
        <StatCard label="Ujian Mendatang" value={data.ujian.length} icon={FileCheck} color="text-rose-600" description="Ujian aktif" />
        <StatCard label="Jadwal Hari Ini" value={todaySchedule.length} icon={CalendarDays} description={today} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today Schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              Jadwal Hari Ini ({today})
            </CardTitle>
            <CardDescription>Mata kuliah hari ini</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaySchedule.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Tidak ada jadwal hari ini" description="Libur atau tidak ada mata kuliah" />
            ) : (
              todaySchedule.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-md bg-accent/40 border border-border/50">
                  <div>
                    <div className="font-medium text-sm">{s.mataKuliah?.name || '-'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.kelas?.name || '-'} • {s.dosen?.name || '-'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{s.scheduleTime}</div>
                    {s.room && <div className="text-xs text-muted-foreground">{s.room}</div>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Active Tugas */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Tugas Pending
              </CardTitle>
              <CardDescription>Tugas belum dikerjakan</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPage('mhs-tugas')}>
              Lihat semua <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeTugas.length === 0 ? (
              <EmptyState icon={FileText} title="Semua tugas selesai" description="Tidak ada tugas pending" />
            ) : (
              activeTugas.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-md bg-accent/40 border border-border/50">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {t.dosenAjar?.mataKuliah?.name || '-'} • {t.dosenAjar?.kelas?.name || '-'}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <Badge variant={new Date(t.deadline) < new Date() ? 'destructive' : 'outline'}>
                      <Clock className="w-3 h-3 mr-1" />
                      {timeUntil(t.deadline)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Ujian */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                Ujian Mendatang
              </CardTitle>
              <CardDescription>Ujian aktif yang dapat dikerjakan</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPage('mhs-ujian')}>
              Lihat semua <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.ujian.length === 0 ? (
              <EmptyState icon={FileCheck} title="Tidak ada ujian aktif" description="Belum ada ujian yang dijadwalkan" />
            ) : (
              data.ujian.slice(0, 5).map((u) => {
                const session = u.sessions?.[0]
                const status = session?.status
                return (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-md bg-accent/40 border border-border/50">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate flex items-center gap-2">
                        {u.title}
                        <Badge variant="outline">{u.type}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {u.dosenAjar?.mataKuliah?.name || '-'} • {u._count?.soal || 0} soal • {u.durationMin} menit
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      {status ? (
                        <Badge variant={status === 'SUBMITTED' || status === 'AUTO_SUBMITTED' ? 'secondary' : 'default'}>
                          {statusBadge(status).label}
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => setPage('mhs-ujian')}>
                          Mulai
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
