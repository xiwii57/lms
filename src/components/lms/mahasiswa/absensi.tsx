'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDateTime, formatDate, statusBadge, bytesToSize } from '@/components/lms/shared/format'
import {
  ClipboardCheck, AlertCircle, CheckCircle, Clock, Calendar, FileUp, FileText, Download, Timer,
} from 'lucide-react'
import { toast } from 'sonner'

interface Absensi {
  id: string
  tanggal: string
  pertemuan: number
  topic: string | null
  status: string // OPEN | CLOSED | EXPIRED
  openedAt: string | null
  closedAt: string | null
  expiresAt: string | null
  durationMin: number | null
  dosenAjar: {
    mataKuliah: { name: string; code: string }
    kelas: { name: string }
    dosen: { name: string }
  }
  records: {
    id: string
    status: string
    note: string | null
    fileName: string | null
    filePath: string | null
    fileSize: number | null
  }[]
}

function timeUntil(dateStr: string): string {
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const diff = target - now
  if (diff < 0) return 'berakhir'
  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}j ${mins}m lagi`
  }
  if (minutes > 0) return `${minutes}m ${seconds}d lagi`
  return `${seconds}d lagi`
}

export function MahasiswaAbsensi() {
  const [absensiList, setAbsensiList] = useState<Absensi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Absensi | null>(null)
  const [status, setStatus] = useState<'HADIR' | 'IZIN' | 'SAKIT'>('HADIR')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/mahasiswa/absensi', { credentials: 'include' })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setAbsensiList(d.absensi || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 30s to update expiry status
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function handleSubmit() {
    if (!selected) return
    if (status === 'SAKIT' && !file) {
      toast.error('Untuk status Sakit, wajib upload surat dokter (foto/pdf)')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('status', status)
      fd.append('note', note)
      if (file) fd.append('file', file)

      const res = await fetch(`/api/mahasiswa/absensi/${selected.id}/submit`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Gagal submit absen')
        return
      }
      toast.success(`Absen berhasil: ${status}${file ? ' (file terlampir)' : ''}`)
      setSelected(null)
      setNote('')
      setStatus('HADIR')
      setFile(null)
      fetchData()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    )
  }

  if (error) {
    return (
      <Card><CardContent className="p-6">
        <EmptyState icon={AlertCircle} title="Gagal memuat absensi" description={error} />
      </CardContent></Card>
    )
  }

  // Categorize: open active, already absen, expired/closed without record
  const now = new Date()
  const openSessions = absensiList.filter((a) => {
    if (a.records.length > 0) return false
    if (a.status === 'OPEN' && a.expiresAt && new Date(a.expiresAt) < now) return false
    return a.status === 'OPEN'
  })
  const alreadyAbsen = absensiList.filter((a) => a.records.length > 0)
  const expiredNoRecord = absensiList.filter((a) =>
    a.records.length === 0 && (a.status === 'EXPIRED' || a.status === 'CLOSED' || (a.expiresAt && new Date(a.expiresAt) < now))
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absensi"
        description="Daftar sesi absen mata kuliah Anda"
      />

      {/* Open sessions - need action */}
      {openSessions.length > 0 && (
        <Card className="border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Sesi Absen Aktif ({openSessions.length})
            </CardTitle>
            <CardDescription>Segera tandai kehadiran Anda sebelum sesi berakhir</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {openSessions.map((a) => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md bg-card border">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {a.dosenAjar.mataKuliah.name}
                    <Badge variant="outline">Pertemuan {a.pertemuan}</Badge>
                  </div>
                  {a.topic && <div className="text-xs text-muted-foreground mt-0.5">{a.topic}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {a.dosenAjar.kelas.name} · Dosen: {a.dosenAjar.dosen.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                    <Calendar className="w-3 h-3" />
                    {formatDateTime(a.tanggal)}
                  </div>
                  {a.expiresAt && (
                    <div className="text-xs mt-1 flex items-center gap-1 font-medium text-amber-600">
                      <Timer className="w-3 h-3" />
                      {timeUntil(a.expiresAt)}
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => {
                    setSelected(a)
                    setStatus('HADIR')
                    setNote('')
                    setFile(null)
                  }}
                  className="flex-shrink-0"
                >
                  <CheckCircle className="w-4 h-4" />
                  Tandai Kehadiran
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Already absent - history */}
      {alreadyAbsen.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              Riwayat Absensi ({alreadyAbsen.length})
            </CardTitle>
            <CardDescription>Absensi yang sudah Anda tandai</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alreadyAbsen.map((a) => {
              const rec = a.records[0]
              const sb = statusBadge(rec.status)
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 border">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {a.dosenAjar.mataKuliah.name}
                      <Badge variant="outline">Pertemuan {a.pertemuan}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.dosenAjar.kelas.name} · {formatDate(a.tanggal)}
                    </div>
                    {rec.note && <div className="text-xs text-muted-foreground mt-0.5">Catatan: {rec.note}</div>}
                    {rec.filePath && (
                      <a
                        href={rec.filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                      >
                        <Download className="w-3 h-3" />
                        {rec.fileName} ({bytesToSize(rec.fileSize)})
                      </a>
                    )}
                  </div>
                  <Badge variant={sb.variant}>{sb.label}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Expired/Closed sessions without record (ALFA) */}
      {expiredNoRecord.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              Tidak Hadir ({expiredNoRecord.length})
            </CardTitle>
            <CardDescription>
              Sesi absen berakhir tanpa kehadiran Anda — dicatat sebagai Alfa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiredNoRecord.map((a) => {
              const isExpired = a.status === 'EXPIRED' || (a.expiresAt && new Date(a.expiresAt) < now)
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 border">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {a.dosenAjar.mataKuliah.name}
                      <Badge variant="outline">Pertemuan {a.pertemuan}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.dosenAjar.kelas.name} · {formatDate(a.tanggal)}
                    </div>
                    {a.expiresAt && (
                      <div className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Sesi absen berakhir {formatDateTime(a.expiresAt)}
                      </div>
                    )}
                  </div>
                  <Badge variant="destructive">Alfa</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {absensiList.length === 0 && (
        <Card><CardContent className="p-6">
          <EmptyState
            icon={ClipboardCheck}
            title="Belum ada sesi absen"
            description="Belum ada dosen yang membuka sesi absen untuk kelas Anda"
          />
        </CardContent></Card>
      )}

      {/* Submit Absen Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tandai Kehadiran</DialogTitle>
            <DialogDescription>
              {selected?.dosenAjar.mataKuliah.name} — Pertemuan {selected?.pertemuan}
              {selected?.expiresAt && (
                <span className="block mt-1 text-amber-600 flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  {timeUntil(selected.expiresAt)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status Kehadiran</Label>
              <RadioGroup value={status} onValueChange={(v) => setStatus(v as any)}>
                <div className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="HADIR" id="r-hadir" className="mt-0.5" />
                  <label htmlFor="r-hadir" className="cursor-pointer flex-1">
                    <div className="font-medium text-sm">Hadir</div>
                    <div className="text-xs text-muted-foreground">Saya hadir di kelas</div>
                  </label>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="IZIN" id="r-izin" className="mt-0.5" />
                  <label htmlFor="r-izin" className="cursor-pointer flex-1">
                    <div className="font-medium text-sm">Izin</div>
                    <div className="text-xs text-muted-foreground">Tidak hadir dengan izin (bukti WhatsApp/screenshot opsional)</div>
                  </label>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="SAKIT" id="r-sakit" className="mt-0.5" />
                  <label htmlFor="r-sakit" className="cursor-pointer flex-1">
                    <div className="font-medium text-sm">Sakit <span className="text-destructive">*</span></div>
                    <div className="text-xs text-muted-foreground">Wajib upload surat dokter (foto/PDF)</div>
                  </label>
                </div>
              </RadioGroup>
            </div>

            {/* File upload for IZIN/SAKIT */}
            {(status === 'IZIN' || status === 'SAKIT') && (
              <div className="space-y-2">
                <Label>
                  {status === 'SAKIT'
                    ? 'Upload Surat Dokter (Wajib) *'
                    : 'Upload Bukti Izin (opsional)'}
                </Label>
                <div className="border-2 border-dashed border-border rounded-md p-4 text-center hover:border-primary transition-colors cursor-pointer">
                  <input
                    id="absen-file"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        if (f.size > 10 * 1024 * 1024) {
                          toast.error('File terlalu besar (max 10MB)')
                          return
                        }
                        setFile(f)
                        toast.success(`File dipilih: ${f.name}`)
                      }
                    }}
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx"
                  />
                  <label htmlFor="absen-file" className="cursor-pointer flex flex-col items-center gap-2">
                    {file ? (
                      <>
                        <FileText className="w-8 h-8 text-primary" />
                        <div>
                          <div className="font-medium text-sm">{file.name}</div>
                          <div className="text-xs text-muted-foreground">{bytesToSize(file.size)}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <FileUp className="w-8 h-8 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">Klik untuk pilih file</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            PDF, JPG, PNG, WEBP, DOC (max 10MB)
                          </div>
                        </div>
                      </>
                    )}
                  </label>
                </div>
                {status === 'SAKIT' && !file && (
                  <p className="text-xs text-destructive">⚠ Surat dokter wajib diupload untuk status Sakit</p>
                )}
              </div>
            )}

            {/* Note field */}
            {(status === 'IZIN' || status === 'SAKIT') && (
              <div className="space-y-2">
                <Label htmlFor="note">Catatan / Keterangan</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={status === 'SAKIT' ? 'Keterangan sakit...' : 'Alasan izin (mis: izin via WhatsApp dosen)'}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={submitting || (status === 'SAKIT' && !file)}>
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Kirim Absen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
