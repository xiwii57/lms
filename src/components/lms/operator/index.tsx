'use client'
import { DashboardShell } from '@/components/lms/shared/shell'
import { Unlock, Users, RefreshCw, AlertCircle, Clock, Shield, Search } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
}

const NAV_ITEMS = [
  { id: 'op-dashboard', label: 'Dashboard', icon: Shield },
]

export function OperatorApp() {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reopenId, setReopenId] = useState<string | null>(null)
  const [reopenName, setReopenName] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/operator/sessions?${params.toString()}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setSessions(json.sessions || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load])

  async function handleReopen() {
    if (!reopenId) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/operator/sessions/${reopenId}/reopen`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')
      toast.success(`Sesi dibuka kembali (${json.remainingMin} menit tersisa)`)
      setReopenId(null)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setActionLoading(false) }
  }

  async function handleBulkReopen() {
    setActionLoading(true)
    try {
      const res = await fetch('/api/operator/bulk-reopen', { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')
      toast.success(`${json.reopened} sesi dibuka kembali`)
      setBulkOpen(false)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setActionLoading(false) }
  }

  const submittedSessions = sessions.filter(s => s.status === 'SUBMITTED' || s.status === 'AUTO_SUBMITTED' || s.status === 'EXPIRED')
  const activeSessions = sessions.filter(s => s.status === 'IN_PROGRESS')
  const autoSubmittedCount = sessions.filter(s => s.autoSubmitted).length

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Operator">
      <PageHeader
        title="Dashboard Operator"
        description="Kelola sesi ujian yang auto-submit"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {submittedSessions.length > 0 && (
              <Button size="sm" onClick={() => setBulkOpen(true)}>
                <Unlock className="w-4 h-4 mr-2" />
                Buka Semua ({submittedSessions.length})
              </Button>
            )}
          </div>
        }
      />

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Cari nama, NIM, atau ujian..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sesi Aktif" value={activeSessions.length} icon={Clock} color="text-emerald-600" description="Sedang ujian" />
        <StatCard label="Auto-Submit" value={autoSubmittedCount} icon={AlertCircle} color="text-amber-600" description="Perlu dibuka" />
        <StatCard label="Submitted" value={submittedSessions.length} icon={Unlock} color="text-blue-600" description="Total reopen" />
        <StatCard label="Total Sesi" value={sessions.length} icon={Users} description="Semua sesi" />
      </div>

      {error ? (
        <Card><CardContent className="p-6"><EmptyState icon={AlertCircle} title="Gagal memuat" description={error} /></CardContent></Card>
      ) : loading && sessions.length === 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0,1,2].map(i => <Skeleton key={i} className="h-40" />)}</div>
      ) : submittedSessions.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState icon={Unlock} title="Tidak ada sesi perlu dibuka" description="Sesi mahasiswa yang auto-submit akan muncul di sini" />
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {submittedSessions.map((s) => {
            const sb = statusBadge(s.status)
            return (
              <Card key={s.id} className={s.autoSubmitted ? 'border-destructive/30' : ''}>
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.mahasiswa.name}</div>
                      <div className="text-xs text-muted-foreground">{s.mahasiswa.nim || '-'}</div>
                    </div>
                    <Badge variant={sb.variant} className="flex-shrink-0">{sb.label}</Badge>
                  </div>

                  {/* Ujian info */}
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="font-medium text-foreground truncate">{s.ujian?.title}</div>
                    <div>{s.ujian?.type} • {s.ujian?.durationMin} menit</div>
                    {s.ujian?.dosenAjar?.mataKuliah?.name && (
                      <div>{s.ujian.dosenAjar.mataKuliah.name}</div>
                    )}
                  </div>

                  {/* Violation info */}
                  {s.reason && (
                    <div className="text-xs text-destructive bg-destructive/5 rounded p-2">
                      <strong>Alasan:</strong> {s.reason}
                    </div>
                  )}
                  {s.violationCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertCircle className="w-3 h-3" />
                      {s.violationCount}x pelanggaran terdeteksi
                    </div>
                  )}

                  {/* Submit time */}
                  {s.submittedAt && (
                    <div className="text-xs text-muted-foreground">
                      Submit: {formatDateTime(s.submittedAt)}
                    </div>
                  )}

                  {/* Action */}
                  <Button size="sm" className="w-full" onClick={() => { setReopenId(s.id); setReopenName(s.mahasiswa.name) }}>
                    <Unlock className="w-3.5 h-3.5 mr-1" />
                    Buka Kembali
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
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
              Semua sesi yang sudah submit/auto-submit akan dibuka kembali sekaligus.
              Mahasiswa dapat melanjutkan ujian mereka.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkReopen} disabled={actionLoading}>
              {actionLoading ? 'Memproses...' : `Ya, Buka Semua (${submittedSessions.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}
