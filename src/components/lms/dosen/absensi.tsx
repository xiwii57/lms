'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ClipboardCheck, Plus, RefreshCw, Trash2, AlertCircle, Eye,
  Lock, Save, Users, FileText, Download, Timer,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDate, formatDateTime, statusBadge, bytesToSize } from '@/components/lms/shared/format'
import { toast } from 'sonner'

interface MataKuliah { id: string; name: string; code: string }
interface Kelas { id: string; name: string }
interface DosenAjar {
  id: string
  scheduleDay: string
  scheduleTime: string
  mataKuliah: MataKuliah
  kelas: Kelas
}
interface AbsensiRow {
  id: string
  tanggal: string
  pertemuan: number
  topic?: string | null
  status: string // OPEN | CLOSED | EXPIRED
  openedAt?: string | null
  closedAt?: string | null
  expiresAt?: string | null
  durationMin?: number | null
  dosenAjar: DosenAjar
  _count?: { records: number }
}
interface AbsensiRecordRow {
  id?: string
  mahasiswaId: string
  status: string
  note?: string | null
  fileName?: string | null
  filePath?: string | null
  fileSize?: number | null
  mahasiswa: { id: string; name: string; nim: string | null; email: string }
}
interface AbsensiDetail extends AbsensiRow {
  records: AbsensiRecordRow[]
}

type StatusType = 'HADIR' | 'IZIN' | 'SAKIT' | 'ALFA'
const STATUS_OPTIONS: StatusType[] = ['HADIR', 'IZIN', 'SAKIT', 'ALFA']

function todayDateInput(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  // datetime-local format: YYYY-MM-DDTHH:mm
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

export function DosenAbsensi() {
  const [absensiList, setAbsensiList] = useState<AbsensiRow[]>([])
  const [dosenAjarList, setDosenAjarList] = useState<DosenAjar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    dosenAjarId: '',
    tanggal: todayDateInput(),
    pertemuan: '1',
    topic: '',
    durationMin: '60',
  })
  const [saving, setSaving] = useState(false)

  // Manage dialog
  const [manageOpen, setManageOpen] = useState(false)
  const [detail, setDetail] = useState<AbsensiDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [recordDraft, setRecordDraft] = useState<Record<string, { status: StatusType; note: string }>>({})
  const [savingRecords, setSavingRecords] = useState(false)

  // Delete dialog
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingLabel, setDeletingLabel] = useState('')

  const loadAbsensi = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dosen/absensi', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat absensi')
      setAbsensiList(json.absensi || [])
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat absensi')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDosenAjar = useCallback(async () => {
    try {
      const res = await fetch('/api/dosen/dosen-ajar', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat dosenAjar')
      setDosenAjarList(json.dosenAjar || [])
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat kelas')
    }
  }, [])

  useEffect(() => {
    loadAbsensi()
    loadDosenAjar()
  }, [loadAbsensi, loadDosenAjar])

  function openCreate() {
    if (dosenAjarList.length === 0) {
      toast.error('Belum ada penugasan kelas. Hubungi admin.')
      return
    }
    setForm({
      dosenAjarId: '',
      tanggal: todayDateInput(),
      pertemuan: '1',
      topic: '',
      durationMin: '60',
    })
    setDialogOpen(true)
  }

  async function handleCreate() {
    if (!form.dosenAjarId) { toast.error('Pilih kelas'); return }
    if (!form.tanggal) { toast.error('Tanggal wajib'); return }
    if (!form.pertemuan || Number(form.pertemuan) < 1) { toast.error('Pertemuan tidak valid'); return }
    if (!form.durationMin || Number(form.durationMin) < 1) { toast.error('Durasi tidak valid'); return }
    try {
      setSaving(true)
      const res = await fetch('/api/dosen/absensi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dosenAjarId: form.dosenAjarId,
          tanggal: form.tanggal,
          pertemuan: Number(form.pertemuan),
          topic: form.topic.trim() || undefined,
          durationMin: Number(form.durationMin),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal membuat absensi')
      toast.success('Sesi absen dibuka')
      setDialogOpen(false)
      await loadAbsensi()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  async function openManage(row: AbsensiRow) {
    setManageOpen(true)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/dosen/absensi/${row.id}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat detail')
      const d: AbsensiDetail = json.absensi
      setDetail(d)
      // initialize draft from existing records; missing mahasiswa default HADIR
      const draft: Record<string, { status: StatusType; note: string }> = {}
      for (const r of d.records) {
        draft[r.mahasiswaId] = {
          status: (r.status as StatusType) || 'HADIR',
          note: r.note || '',
        }
      }
      setRecordDraft(draft)
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
      setManageOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  async function saveRecords() {
    if (!detail) return
    try {
      setSavingRecords(true)
      const records = Object.entries(recordDraft).map(([mahasiswaId, v]) => ({
        mahasiswaId,
        status: v.status,
        note: v.note || undefined,
      }))
      const res = await fetch(`/api/dosen/absensi/${detail.id}/records`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ records }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan')
      toast.success(`${json.count || records.length} record disimpan`)
      // refresh detail and list
      await openManage(detail)
      await loadAbsensi()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSavingRecords(false)
    }
  }

  async function closeAbsensi(row: AbsensiRow) {
    try {
      const res = await fetch(`/api/dosen/absensi/${row.id}?action=close`, {
        method: 'PUT',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menutup absensi')
      toast.success('Sesi absen ditutup')
      await loadAbsensi()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    try {
      const res = await fetch(`/api/dosen/absensi/${deletingId}`, {
        method: 'DELETE', credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('Absensi dihapus')
      setDeletingId(null)
      await loadAbsensi()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  // Summary counts for current draft
  const summary = useMemo(() => {
    const c: Record<StatusType, number> = { HADIR: 0, IZIN: 0, SAKIT: 0, ALFA: 0 }
    for (const v of Object.values(recordDraft)) c[v.status]++
    return c
  }, [recordDraft])

  return (
    <div>
      <PageHeader
        title="Absensi"
        description="Buka sesi absen dan kelola kehadiran mahasiswa"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Buka Sesi Absen
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm flex-1">{error}</span>
              <Button variant="outline" size="sm" onClick={loadAbsensi}>
                <RefreshCw className="w-4 h-4 mr-2" /> Coba Lagi
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : absensiList.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Belum ada sesi absen"
              description="Buka sesi absen pertama Anda dengan tombol di atas"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Pertemuan</TableHead>
                    <TableHead>Kelas / MK</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Topik</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absensiList.map((a) => {
                    const sb = statusBadge(a.status)
                    const recCount = a._count?.records || 0
                    // Check expiry time display
                    const now = new Date()
                    const isExpired = a.status === 'EXPIRED' || (a.expiresAt && new Date(a.expiresAt) < now && a.status === 'OPEN')
                    const expiryText = a.expiresAt
                      ? (new Date(a.expiresAt) < now
                        ? `Berakhir ${formatDate(a.expiresAt)}`
                        : `Berakhir ${formatDate(a.expiresAt)}`)
                      : '-'
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant="outline">#{a.pertemuan}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{a.dosenAjar.mataKuliah.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.dosenAjar.mataKuliah.code} · {a.dosenAjar.kelas.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDate(a.tanggal)}
                          {a.durationMin && (
                            <div className="text-muted-foreground">{a.durationMin} menit</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-48 truncate">{a.topic || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={sb.variant}>{sb.label}</Badge>
                          {a.expiresAt && a.status === 'OPEN' && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{expiryText}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{recCount} record</Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => openManage(a)} title="Kelola">
                            <Eye className="w-4 h-4" />
                          </Button>
                          {a.status === 'OPEN' && !isExpired && (
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => closeAbsensi(a)}
                              title="Tutup sesi"
                              className="text-amber-600"
                            >
                              <Lock className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => {
                              setDeletingId(a.id)
                              setDeletingLabel(`${a.dosenAjar.mataKuliah.code} · Pertemuan ${a.pertemuan}`)
                            }}
                            className="text-destructive hover:text-destructive"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buka Sesi Absen</DialogTitle>
            <DialogDescription>Buat sesi absen baru untuk pertemuan kali ini</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kelas / Mata Kuliah</Label>
              <Select
                value={form.dosenAjarId}
                onValueChange={(v) => setForm((f) => ({ ...f, dosenAjarId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih kelas..." />
                </SelectTrigger>
                <SelectContent>
                  {dosenAjarList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.mataKuliah.code} · {d.kelas.name} ({d.scheduleDay})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="a-tgl">Tanggal & Jam</Label>
                <Input
                  id="a-tgl"
                  type="datetime-local"
                  value={form.tanggal}
                  onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-per">Pertemuan</Label>
                <Input
                  id="a-per"
                  type="number"
                  min={1}
                  value={form.pertemuan}
                  onChange={(e) => setForm((f) => ({ ...f, pertemuan: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-topic">Topik (opsional)</Label>
              <Input
                id="a-topic"
                value={form.topic}
                onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                placeholder="Topik / materi pertemuan..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-dur">Durasi Sesi (menit) — auto-expire</Label>
              <Input
                id="a-dur"
                type="number"
                min={1}
                value={form.durationMin}
                onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                💡 Sesi akan otomatis berakhir (EXPIRED) setelah durasi ini, mahasiswa yang belum absen akan menjadi Alfa
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Membuka...' : 'Buka Sesi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Records Dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Kelola Absensi</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.dosenAjar.mataKuliah.code} · ${detail.dosenAjar.kelas.name} — Pertemuan ${detail.pertemuan} (${formatDate(detail.tanggal)})` : 'Memuat...'}
            </DialogDescription>
          </DialogHeader>

          {/* Summary */}
          {detail && (
            <div className="grid grid-cols-4 gap-2">
              {STATUS_OPTIONS.map((s) => {
                const sb = statusBadge(s)
                return (
                  <div key={s} className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                    <div className="text-[11px] uppercase text-muted-foreground tracking-wide">{sb.label}</div>
                    <div className="text-lg font-bold">{summary[s]}</div>
                  </div>
                )
              })}
            </div>
          )}

          <ScrollArea className="flex-1 -mx-6 px-6 max-h-[55vh]">
            {detailLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !detail || detail.records.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Belum ada mahasiswa"
                description="Tidak ada mahasiswa di kelas ini"
              />
            ) : (
              <div className="space-y-2 py-2">
                {detail.records.map((r) => {
                  const draft = recordDraft[r.mahasiswaId] || { status: 'HADIR' as StatusType, note: '' }
                  return (
                    <div key={r.mahasiswaId} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{r.mahasiswa.name}</div>
                          <div className="text-xs text-muted-foreground">{r.mahasiswa.nim || 'no NIM'}</div>
                        </div>
                      </div>
                      <RadioGroup
                        value={draft.status}
                        onValueChange={(v) =>
                          setRecordDraft((prev) => ({
                            ...prev,
                            [r.mahasiswaId]: { ...prev[r.mahasiswaId], status: v as StatusType },
                          }))
                        }
                        className="grid grid-cols-4 gap-1"
                      >
                        {STATUS_OPTIONS.map((s) => {
                          const sb = statusBadge(s)
                          return (
                            <Label
                              key={s}
                              htmlFor={`${r.mahasiswaId}-${s}`}
                              className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                                draft.status === s
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'hover:bg-accent'
                              }`}
                            >
                              <RadioGroupItem
                                id={`${r.mahasiswaId}-${s}`}
                                value={s}
                                className="sr-only"
                              />
                              <span>{sb.label}</span>
                            </Label>
                          )
                        })}
                      </RadioGroup>
                      <Input
                        placeholder="Catatan (opsional)..."
                        value={draft.note}
                        onChange={(e) =>
                          setRecordDraft((prev) => ({
                            ...prev,
                            [r.mahasiswaId]: { ...prev[r.mahasiswaId], note: e.target.value },
                          }))
                        }
                        className="text-xs h-8"
                      />
                      {/* Show uploaded file (surat sakit / bukti izin) */}
                      {r.filePath && (
                        <a
                          href={r.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <FileText className="w-3 h-3" />
                          {r.fileName || 'Lihat file'}
                          {r.fileSize && <span className="text-muted-foreground">({bytesToSize(r.fileSize)})</span>}
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Tutup</Button>
            <Button onClick={saveRecords} disabled={savingRecords || !detail}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {savingRecords ? 'Menyimpan...' : 'Simpan Semua'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Absensi?</AlertDialogTitle>
            <AlertDialogDescription>
              Sesi absen &quot;{deletingLabel}&quot; beserta semua record kehadiran akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
