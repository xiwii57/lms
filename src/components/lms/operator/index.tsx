'use client'
import { DashboardShell } from '@/components/lms/shared/shell'
import { Monitor, Unlock, Users, RefreshCw, Camera, MonitorUp, AlertCircle, Clock } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader, EmptyState, StatCard } from '@/components/lms/shared/ui'
import { formatDateTime, statusBadge } from '@/components/lms/shared/format'
import { toast } from 'sonner'

interface SessionItem {
  id: string
  status: string
  autoSubmitted: boolean
  reason: string | null
  startTime: string
  endTime: string
  submittedAt: string | null
  violationCount: number
  mahasiswa: { id: string; name: string; nim: string | null; email: string }
  ujian: { id: string; title: string; type: string; durationMin: number; dosenAjar: { mataKuliah: { name: string } } }
  hasCapture: boolean
  captureTime: number | null
  isLive: boolean
}

const NAV_ITEMS = [
  { id: 'op-dashboard', label: 'Dashboard', icon: Monitor },
]

export function OperatorApp() {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reopenId, setReopenId] = useState<string | null>(null)
  const [reopenName, setReopenName] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [imgRefreshKey, setImgRefreshKey] = useState(0)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null) // Clear previous error
      const res = await fetch('/api/operator/sessions', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setSessions(json.sessions || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Session metadata refresh (lightweight JSON, no images) - every 8 seconds
    const metaInterval = setInterval(load, 8000)
    // Image refresh (just update img src cache-buster) - every 5 seconds, smooth
    const imgInterval = setInterval(() => setImgRefreshKey(Date.now()), 5000)
    return () => {
      clearInterval(metaInterval)
      clearInterval(imgInterval)
    }
  }, [load])

  async function handleReopen() {
    if (!reopenId) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/operator/sessions/${reopenId}/reopen`, {
        method: 'POST', credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')
      toast.success(`Sesi dibuka kembali (${json.remainingMin} menit tersisa)`)
      setReopenId(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBulkReopen() {
    setActionLoading(true)
    try {
      const res = await fetch('/api/operator/sessions/bulk-reopen', {
        method: 'POST', credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')
      toast.success(`${json.reopened} sesi dibuka kembali`)
      setBulkOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const activeSessions = sessions.filter(s => s.status === 'IN_PROGRESS')
  const submittedSessions = sessions.filter(s => s.status === 'SUBMITTED' || s.status === 'AUTO_SUBMITTED' || s.status === 'EXPIRED')
  const autoSubmittedCount = sessions.filter(s => s.autoSubmitted).length

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Operator">
      <PageHeader
        title="Dashboard Operator"
        description="Pantau mahasiswa ujian & kelola sesi auto-submit"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {submittedSessions.length > 0 && (
              <Button size="sm" variant="destructive" onClick={() => setBulkOpen(true)}>
                <Unlock className="w-4 h-4 mr-2" />
                Bulk Buka ({submittedSessions.length})
              </Button>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sesi Aktif" value={activeSessions.length} icon={Monitor} color="text-emerald-600" description="Sedang ujian" />
        <StatCard label="Auto-Submit" value={autoSubmittedCount} icon={AlertCircle} color="text-amber-600" description="Perlu dibuka kembali" />
        <StatCard label="Submitted" value={submittedSessions.length} icon={Unlock} color="text-blue-600" description="Total perlu reopen" />
        <StatCard label="Total Sesi" value={sessions.length} icon={Users} description="Semua sesi" />
      </div>

      {error ? (
        <Card><CardContent className="p-6">
          <EmptyState icon={AlertCircle} title="Gagal memuat" description={error} />
        </CardContent></Card>
      ) : loading && sessions.length === 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : sessions.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState icon={Monitor} title="Belum ada sesi ujian" description="Sesi mahasiswa yang sedang atau sudah ujian akan muncul di sini" />
        </CardContent></Card>
      ) : (
        <>
          {/* Live Monitoring Grid */}
          {activeSessions.length > 0 && (
            <div className="mb-6">
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Monitoring ({activeSessions.length})
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeSessions.map((s) => (
                  <Card key={s.id} className={`overflow-hidden ${s.isLive ? 'border-emerald-300' : 'border-border'}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-sm truncate">{s.mahasiswa.name}</CardTitle>
                          <div className="text-xs text-muted-foreground">
                            {s.mahasiswa.nim || '-'} • {s.ujian.dosenAjar?.mataKuliah?.name || '-'}
                          </div>
                        </div>
                        {s.isLive ? (
                          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-white mr-1 animate-pulse" />
                            LIVE
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="flex-shrink-0">Idle</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {/* Camera + Screen frames */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                            <Camera className="w-3 h-3" /> Kamera
                          </div>
                          <img
                            src={`/api/operator/sessions/${s.id}/camera?t=${imgRefreshKey}`}
                            alt="Camera"
                            className="w-full aspect-[4/3] object-cover rounded border bg-black transition-opacity duration-300"
                            style={{ opacity: 0.8 }}
                            onError={(e) => { (e.currentTarget).style.opacity = '0.2' }}
                            onLoad={(e) => { (e.currentTarget).style.opacity = '1' }}
                          />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                            <MonitorUp className="w-3 h-3" /> Layar
                          </div>
                          <img
                            src={`/api/operator/sessions/${s.id}/screen?t=${imgRefreshKey}`}
                            alt="Screen"
                            className="w-full aspect-[4/3] object-cover rounded border bg-black transition-opacity duration-300"
                            style={{ opacity: 0.8 }}
                            onError={(e) => { (e.currentTarget).style.opacity = '0.2' }}
                            onLoad={(e) => { (e.currentTarget).style.opacity = '1' }}
                          />
                        </div>
                      </div>
                      {/* Info */}
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>{s.ujian.title}</span>
                        <Badge variant="outline" className="text-[10px]">{s.ujian.type}</Badge>
                        {s.violationCount > 0 && (
                          <Badge variant="destructive" className="text-[10px]">{s.violationCount}x pelanggaran</Badge>
                        )}
                      </div>
                      {s.captureTime && (
                        <div className="text-[10px] text-muted-foreground">
                          Update: {new Date(s.captureTime).toLocaleTimeString('id-ID')}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Submitted/Auto-submitted sessions - reopen list */}
          {submittedSessions.length > 0 && (
            <div>
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Unlock className="w-4 h-4 text-amber-600" />
                Sesi Perlu Dibuka Kembali ({submittedSessions.length})
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {submittedSessions.map((s) => {
                  const sb = statusBadge(s.status)
                  return (
                    <Card key={s.id} className={s.autoSubmitted ? 'border-destructive/30' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{s.mahasiswa.name}</div>
                            <div className="text-xs text-muted-foreground">{s.mahasiswa.nim || '-'}</div>
                          </div>
                          <Badge variant={sb.variant} className="flex-shrink-0">{sb.label}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mb-1">
                          {s.ujian.title} • {s.ujian.type}
                        </div>
                        {s.reason && (
                          <div className="text-xs text-destructive mb-1">Alasan: {s.reason}</div>
                        )}
                        {s.violationCount > 0 && (
                          <div className="text-xs text-amber-600 mb-2">{s.violationCount}x pelanggaran</div>
                        )}
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setReopenId(s.id)
                            setReopenName(s.mahasiswa.name)
                          }}
                        >
                          <Unlock className="w-3.5 h-3.5 mr-1" />
                          Buka Kembali
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Single Reopen Dialog */}
      <AlertDialog open={!!reopenId} onOpenChange={(o) => !o && setReopenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buka Kembali Sesi Ujian?</AlertDialogTitle>
            <AlertDialogDescription>
              Mahasiswa <span className="font-medium text-foreground">{reopenName}</span> akan dapat melanjutkan ujian.
              {reopenId && (() => {
                const s = sessions.find(x => x.id === reopenId)
                return s?.reason ? ` Sesi sebelumnya auto-submit karena: ${s.reason}` : ''
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleReopen} disabled={actionLoading}>
              {actionLoading ? 'Memproses...' : 'Ya, Buka Kembali'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Reopen Dialog */}
      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buka Semua Sesi ({submittedSessions.length})?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua sesi yang sudah submit/auto-submit/expired akan dibuka kembali sekaligus.
              Mahasiswa dapat melanjutkan ujian mereka.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkReopen} disabled={actionLoading} className="bg-destructive text-white hover:bg-destructive/90">
              {actionLoading ? 'Memproses...' : `Ya, Buka Semua (${submittedSessions.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}
