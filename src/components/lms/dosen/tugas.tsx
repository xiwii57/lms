'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  FileText, Plus, RefreshCw, Pencil, Trash2, AlertCircle, Eye,
  Download, Save, Paperclip, X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDateTime, timeUntil, bytesToSize } from '@/components/lms/shared/format'
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
interface TugasRow {
  id: string
  title: string
  description: string
  deadline: string
  fileName?: string | null
  filePath?: string | null
  fileSize?: number | null
  fileType?: string | null
  createdAt: string
  dosenAjar: DosenAjar
  _count?: { submissions: number }
}
interface SubmissionRow {
  id: string
  fileName: string
  filePath: string
  fileSize?: number | null
  note?: string | null
  nilai?: number | null
  feedback?: string | null
  submittedAt: string
  gradedAt?: string | null
  mahasiswa: { id: string; name: string; nim: string | null; email: string }
}

function toLocalInput(d: string | Date): string {
  try {
    return new Date(d).toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

function fileNameFromPath(p?: string | null): string {
  if (!p) return ''
  const parts = p.split('/')
  return parts[parts.length - 1] || ''
}

export function DosenTugas() {
  const [tugasList, setTugasList] = useState<TugasRow[]>([])
  const [dosenAjarList, setDosenAjarList] = useState<DosenAjar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TugasRow | null>(null)
  const [form, setForm] = useState({
    dosenAjarId: '',
    title: '',
    description: '',
    deadline: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  // Delete dialog
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingTitle, setDeletingTitle] = useState('')

  // Submission dialog
  const [subDialogOpen, setSubDialogOpen] = useState(false)
  const [subTugas, setSubTugas] = useState<TugasRow | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [subLoading, setSubLoading] = useState(false)
  const [subSavingId, setSubSavingId] = useState<string | null>(null)

  const loadTugas = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dosen/tugas', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat tugas')
      setTugasList(json.tugas || [])
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat tugas')
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
    loadTugas()
    loadDosenAjar()
  }, [loadTugas, loadDosenAjar])

  function openCreate() {
    if (dosenAjarList.length === 0) {
      toast.error('Belum ada penugasan kelas. Hubungi admin.')
      return
    }
    setEditing(null)
    setForm({
      dosenAjarId: '',
      title: '',
      description: '',
      deadline: toLocalInput(new Date(Date.now() + 7 * 86400_000)),
    })
    setFile(null)
    setDialogOpen(true)
  }

  function openEdit(t: TugasRow) {
    setEditing(t)
    setForm({
      dosenAjarId: t.dosenAjar.id,
      title: t.title,
      description: t.description || '',
      deadline: toLocalInput(t.deadline),
    })
    setFile(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.dosenAjarId) { toast.error('Pilih kelas / mata kuliah'); return }
    if (!form.title.trim()) { toast.error('Judul wajib diisi'); return }
    if (!form.deadline) { toast.error('Deadline wajib diisi'); return }
    try {
      setSaving(true)
      const fd = new FormData()
      fd.append('dosenAjarId', form.dosenAjarId)
      fd.append('title', form.title.trim())
      fd.append('description', form.description)
      fd.append('deadline', form.deadline)
      if (file) fd.append('file', file)

      const url = editing ? `/api/dosen/tugas/${editing.id}` : '/api/dosen/tugas'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, { method, body: fd, credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan')
      toast.success(editing ? 'Tugas diperbarui' : 'Tugas dibuat')
      setDialogOpen(false)
      await loadTugas()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    try {
      const res = await fetch(`/api/dosen/tugas/${deletingId}`, {
        method: 'DELETE', credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('Tugas dihapus')
      setDeletingId(null)
      await loadTugas()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  async function openSubmissions(t: TugasRow) {
    setSubTugas(t)
    setSubDialogOpen(true)
    setSubLoading(true)
    setSubmissions([])
    try {
      const res = await fetch(`/api/dosen/tugas/${t.id}/submissions`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat submission')
      setSubmissions(json.submissions || [])
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat submission')
    } finally {
      setSubLoading(false)
    }
  }

  async function saveSubmissionGrade(sub: SubmissionRow, nilai: string, feedback: string) {
    if (!subTugas) return
    try {
      setSubSavingId(sub.id)
      const res = await fetch(`/api/dosen/tugas/${subTugas.id}/submissions/${sub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nilai: nilai === '' ? null : Number(nilai),
          feedback,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan nilai')
      toast.success('Nilai disimpan')
      // update local state
      setSubmissions((prev) =>
        prev.map((s) => s.id === sub.id ? { ...s, nilai: json.submission.nilai, feedback: json.submission.feedback, gradedAt: json.submission.gradedAt } : s)
      )
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSubSavingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Tugas"
        description="Kelola tugas, deadline, dan penilaian submission"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Buat Tugas
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm flex-1">{error}</span>
              <Button variant="outline" size="sm" onClick={loadTugas}>
                <RefreshCw className="w-4 h-4 mr-2" /> Coba Lagi
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : tugasList.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Belum ada tugas"
              description="Buat tugas pertama Anda dengan tombol di atas"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul</TableHead>
                    <TableHead>Kelas / MK</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Submission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tugasList.map((t) => {
                    const overdue = new Date(t.deadline).getTime() < Date.now()
                    const subCount = t._count?.submissions || 0
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="font-medium">{t.title}</div>
                          {t.fileName && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Paperclip className="w-3 h-3" />
                              {t.fileName}
                              <span className="text-[10px]">({bytesToSize(t.fileSize || 0)})</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{t.dosenAjar.mataKuliah.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.dosenAjar.mataKuliah.code} · {t.dosenAjar.kelas.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{formatDateTime(t.deadline)}</div>
                          <div className={overdue ? 'text-destructive' : 'text-muted-foreground'}>
                            {overdue ? 'Berakhir' : timeUntil(t.deadline)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{subCount} submission</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={overdue ? 'secondary' : 'default'}>
                            {overdue ? 'Closed' : 'Open'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openSubmissions(t)}
                            title="Lihat submission"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openEdit(t)}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { setDeletingId(t.id); setDeletingTitle(t.title) }}
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Tugas' : 'Buat Tugas'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Perbarui informasi tugas' : 'Buat tugas baru untuk kelas Anda'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kelas / Mata Kuliah</Label>
              <Select
                value={form.dosenAjarId}
                onValueChange={(v) => setForm((f) => ({ ...f, dosenAjarId: v }))}
                disabled={!!editing}
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
            <div className="space-y-2">
              <Label htmlFor="t-title">Judul</Label>
              <Input
                id="t-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Judul tugas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-desc">Deskripsi</Label>
              <Textarea
                id="t-desc"
                rows={4}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Instruksi tugas..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-deadline">Deadline</Label>
              <Input
                id="t-deadline"
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-file">File (opsional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="t-file"
                  type="file"
                  accept=".pdf,.doc,.docx,.zip,.rar"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file && (
                  <Button variant="ghost" size="icon" onClick={() => setFile(null)} title="Hapus file">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {editing?.fileName && !file && (
                <p className="text-xs text-muted-foreground">
                  File saat ini: {editing.fileName} (kosongkan jika tidak diubah)
                </p>
              )}
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} ({bytesToSize(file.size)})
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Buat Tugas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submissions Dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Submission Tugas</DialogTitle>
            <DialogDescription>
              {subTugas?.title} — {subTugas?.dosenAjar.mataKuliah.code} · {subTugas?.dosenAjar.kelas.name}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            {subLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : submissions.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Belum ada submission"
                description="Mahasiswa belum mengumpulkan tugas ini"
              />
            ) : (
              <div className="space-y-3 py-2">
                {submissions.map((s) => (
                  <SubmissionCard
                    key={s.id}
                    sub={s}
                    saving={subSavingId === s.id}
                    onSave={saveSubmissionGrade}
                  />
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setSubDialogOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Tugas?</AlertDialogTitle>
            <AlertDialogDescription>
              Tugas &quot;{deletingTitle}&quot; beserta semua submission akan dihapus permanen.
              Tindakan ini tidak dapat dibatalkan.
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

function SubmissionCard({
  sub, saving, onSave,
}: {
  sub: SubmissionRow
  saving: boolean
  onSave: (sub: SubmissionRow, nilai: string, feedback: string) => void
}) {
  const [nilai, setNilai] = useState<string>(sub.nilai != null ? String(sub.nilai) : '')
  const [feedback, setFeedback] = useState<string>(sub.feedback || '')
  const filename = fileNameFromPath(sub.filePath)

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{sub.mahasiswa.name}</div>
          <div className="text-xs text-muted-foreground">
            {sub.mahasiswa.nim || 'no NIM'} · {sub.mahasiswa.email}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Submit: {formatDateTime(sub.submittedAt)}
            {sub.gradedAt && ' · Dinilai: ' + formatDateTime(sub.gradedAt)}
          </div>
        </div>
        {sub.nilai != null && (
          <Badge variant="default">Nilai: {sub.nilai}</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <a
          href={sub.filePath ? `/api${sub.filePath}` : '#'}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Download className="w-3 h-3" />
          {sub.fileName || filename}
        </a>
        {sub.fileSize != null && (
          <span className="text-muted-foreground">({bytesToSize(sub.fileSize)})</span>
        )}
      </div>

      {sub.note && (
        <div className="text-xs bg-muted/50 rounded p-2 border">
          <span className="font-medium">Catatan mhs:</span> {sub.note}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2">
        <div className="space-y-1">
          <Label htmlFor={`n-${sub.id}`} className="text-xs">Nilai (0-100)</Label>
          <Input
            id={`n-${sub.id}`}
            type="number"
            min={0}
            max={100}
            value={nilai}
            onChange={(e) => setNilai(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`f-${sub.id}`} className="text-xs">Feedback</Label>
          <Textarea
            id={`f-${sub.id}`}
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback untuk mahasiswa..."
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => onSave(sub, nilai, feedback)}
        >
          <Save className="w-3.5 h-3.5 mr-1" />
          {saving ? 'Menyimpan...' : 'Simpan Nilai'}
        </Button>
      </div>
    </div>
  )
}
