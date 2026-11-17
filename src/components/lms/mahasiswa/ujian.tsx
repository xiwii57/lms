'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDateTime, timeUntil, statusBadge } from '@/components/lms/shared/format'
import { FileCheck, AlertCircle, Clock, Play, History } from 'lucide-react'
import { ExamRunner } from './exam-runner'
import { toast } from 'sonner'
import { fetchWithCache, clearCached } from '@/lib/client-cache'

interface Ujian {
  id: string
  title: string
  type: string
  description?: string
  instruction?: string
  durationMin: number
  startTime: string
  endTime: string
  dosenAjar: { mataKuliah: { name: string }; kelas: { name: string } }
  sessions?: any[]
  _count?: { soal: number }
}

export function MahasiswaUjian() {
  const [ujian, setUjian] = useState<Ujian[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeExam, setActiveExam] = useState<Ujian | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  async function fetchData() {
    try {
      const [uRes, sRes] = await Promise.all([
        fetch('/api/mahasiswa/ujian', { credentials: 'include' }),
        fetch('/api/mahasiswa/ujian/sessions', { credentials: 'include' }),
      ])
      const ud = await uRes.json()
      const sd = await sRes.json()
      if (ud.error) throw new Error(ud.error)
      setUjian(ud.ujian)
      setSessions(sd.sessions || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Pakai cache untuk instant render kalau sudah pernah load
        const { data: cached, fresh } = await fetchWithCache<{ ujian: Ujian[] }>(
          'mhs-ujian',
          '/api/mahasiswa/ujian',
        )
        if (cancelled) return
        if (cached) {
          setUjian(cached.ujian)
          setLoading(false)
        }
        if (fresh) {
          setUjian(fresh.ujian)
        }
        // Fetch sessions terpisah (tidak di-cache karena bisa berubah saat submit)
        const sRes = await fetch('/api/mahasiswa/ujian/sessions', { credentials: 'include' })
        const sd = await sRes.json()
        if (!cancelled) setSessions(sd.sessions || [])
      } catch (e: any) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Refresh cache saat exit dari exam runner (data ujian mungkin berubah)
  function exitExamRunner() {
    clearCached('mhs-ujian')
    setActiveExam(null)
    fetchData()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
    )
  }

  if (error) {
    return (
      <Card><CardContent className="p-6">
        <EmptyState icon={AlertCircle} title="Gagal memuat ujian" description={error} />
      </CardContent></Card>
    )
  }

  // If exam is active, render the runner
  if (activeExam) {
    return <ExamRunner ujian={activeExam} onExit={exitExamRunner} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ujian"
        description="Ujian mata kuliah Anda"
        action={
          <Button variant={showHistory ? 'default' : 'outline'} onClick={() => setShowHistory(!showHistory)}>
            <History className="w-4 h-4" />
            {showHistory ? 'Lihat Ujian Aktif' : 'Lihat Riwayat'}
          </Button>
        }
      />

      {!showHistory ? (
        <>
          {/* Active ujian info banner */}
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-200">Penting - Baca Sebelum Mulai Ujian:</p>
                  <ul className="list-disc list-inside mt-2 space-y-0.5 text-amber-800 dark:text-amber-300">
                    <li>Wajib mengaktifkan <strong>kamera</strong> dan <strong>screen share</strong> selama ujian.</li>
                    <li>Dilarang <strong>buka tab baru</strong> atau keluar dari browser - jawaban akan otomatis ter-submit.</li>
                    <li>Wajib <strong>menonaktifkan notifikasi</strong> - notifikasi yang masuk akan menyebabkan auto-submit.</li>
                    <li>Wajib menulis jawaban sendiri, tidak boleh keluar dari halaman ujian.</li>
                    <li>Mode <strong>fullscreen</strong> akan diaktifkan otomatis.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {ujian.length === 0 ? (
            <Card><CardContent className="p-6">
              <EmptyState icon={FileCheck} title="Tidak ada ujian aktif" description="Belum ada ujian yang bisa dikerjakan saat ini" />
            </CardContent></Card>
          ) : (
            <div className="grid gap-4">
              {ujian.map((u) => {
                const session = u.sessions?.[0]
                const status = session?.status
                // CANNOT start if session is SUBMITTED, AUTO_SUBMITTED, or EXPIRED
                // Only operator can reopen these sessions
                const canStart = !status || status === 'NOT_STARTED' || status === 'IN_PROGRESS'
                const now = new Date()
                const started = new Date(u.startTime) <= now
                const ended = new Date(u.endTime) <= now
                return (
                  <Card key={u.id}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-base font-semibold">{u.title}</h3>
                            <Badge variant="outline">{u.type}</Badge>
                            {status && (
                              <Badge variant={statusBadge(status).variant}>
                                {statusBadge(status).label}
                              </Badge>
                            )}
                          </div>
                          {u.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{u.description}</p>
                          )}
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>{u.dosenAjar?.mataKuliah?.name} • {u.dosenAjar?.kelas?.name}</div>
                            <div>Periode: {formatDateTime(u.startTime)} - {formatDateTime(u.endTime)}</div>
                            <div>Durasi: {u.durationMin} menit • {u._count?.soal || 0} soal</div>
                          </div>
                          {session?.reason && (
                            <div className="mt-2 text-xs text-destructive">
                              Alasan auto-submit: {session.reason}
                            </div>
                          )}
                          {/* Expiry messages */}
                          {!started && (
                            <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Ujian belum dimulai — dimulai {formatDateTime(u.startTime)}
                            </div>
                          )}
                          {ended && !status && (
                            <div className="mt-2 text-xs text-destructive font-medium">
                              ⚠ Sesi ujian telah berakhir — Anda tidak mengikuti ujian ini
                            </div>
                          )}
                          {ended && status && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              Sesi ujian telah berakhir
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {canStart ? (
                            <Button
                              onClick={() => {
                                if (!started) {
                                  toast.error('Ujian belum dimulai')
                                  return
                                }
                                if (ended) {
                                  toast.error('Sesi ujian telah berakhir')
                                  return
                                }
                                setActiveExam(u)
                              }}
                              disabled={!started || ended}
                            >
                              <Play className="w-4 h-4" />
                              {status === 'IN_PROGRESS' ? 'Lanjutkan' : 'Mulai Ujian'}
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="px-3 py-1.5">
                              Selesai
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      ) : (
        // History view
        <div>
          {sessions.length === 0 ? (
            <Card><CardContent className="p-6">
              <EmptyState icon={History} title="Belum ada riwayat ujian" description="Anda belum pernah mengikuti ujian" />
            </CardContent></Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-medium">Ujian</th>
                    <th className="text-left p-3 font-medium">Mata Kuliah</th>
                    <th className="text-left p-3 font-medium">Mulai</th>
                    <th className="text-left p-3 font-medium">Selesai</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Pelanggaran</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/50">
                      <td className="p-3 font-medium">{s.ujian.title}</td>
                      <td className="p-3 text-muted-foreground">{s.ujian.dosenAjar?.mataKuliah?.name}</td>
                      <td className="p-3 text-muted-foreground">{formatDateTime(s.startTime)}</td>
                      <td className="p-3 text-muted-foreground">{formatDateTime(s.submittedAt || s.endTime)}</td>
                      <td className="p-3">
                        <Badge variant={statusBadge(s.status).variant}>{statusBadge(s.status).label}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        {s.violationCount > 0 ? (
                          <Badge variant="destructive">{s.violationCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
