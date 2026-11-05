'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  FileCheck, Plus, RefreshCw, Pencil, Trash2, AlertCircle, Eye,
  ListChecks, ClipboardList, X, Save, Unlock, ChevronLeft, ChevronDown, User,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import {
  formatDateTime, formatDate, timeUntil, statusBadge,
} from '@/components/lms/shared/format'
import { useUIStore } from '@/lib/store'
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
interface SoalRow {
  id?: string
  pertanyaan: string
  type: 'ESSAY' | 'MULTIPLE_CHOICE'
  options?: string[] | null
  answerKey?: string | null
  points: number
  order: number
}
interface UjianRow {
  id: string
  title: string
  type: string
  description?: string | null
  startTime: string
  endTime: string
  durationMin: number
  status: string
  instruction?: string | null
  dosenAjar: DosenAjar
  _count?: { soal: number; sessions: number; jawaban: number }
}
interface UjianDetail extends UjianRow {
  soal: SoalRow[]
}
interface SessionRow {
  id: string
  mahasiswaId: string
  startTime: string
  endTime: string
  status: string
  autoSubmitted: boolean
  reason?: string | null
  submittedAt?: string | null
  violationCount: number
  mahasiswa: { id: string; name: string; nim: string | null; email: string }
  jawabanAnswered: number
  totalSoal: number
  totalPointsPossible: number
  totalNilai: number
}
interface JawabanRow {
  id: string
  answer: string
  nilai?: number | null
  catatan?: string | null
  soal: { id: string; pertanyaan: string; type: string; points: number; order: number; answerKey?: string | null }
  mahasiswa: { id: string; name: string; nim: string | null; email: string }
}
interface JawabanGroup {
  mahasiswa: { id: string; name: string; nim: string | null; email: string }
  jawaban: JawabanRow[]
  totalNilai: number
  totalPoints: number
  answeredCount: number
}

const TYPE_LABEL: Record<string, string> = {
  UTS: 'UTS', UAS: 'UAS', QUIZ: 'Quiz',
}

function toLocalInput(d: string | Date): string {
  try {
    return new Date(d).toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

const emptySoal = (): SoalRow => ({
  pertanyaan: '',
  type: 'ESSAY',
  options: null,
  answerKey: '',
  points: 10,
  order: 0,
})

function initials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}

export function DosenUjian() {
  const [ujianList, setUjianList] = useState<UjianRow[]>([])
  const [dosenAjarList, setDosenAjarList] = useState<DosenAjar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UjianRow | null>(null)
  const [editingDetail, setEditingDetail] = useState<UjianDetail | null>(null)
  const [form, setForm] = useState({
    dosenAjarId: '',
    title: '',
    type: 'UTS',
    description: '',
    startTime: '',
    endTime: '',
    durationMin: '90',
    instruction: '',
    shuffleSoal: false,
  })
  const [soalList, setSoalList] = useState<SoalRow[]>([emptySoal()])
  const [saving, setSaving] = useState(false)
  // Wizard step: 1 = Info Ujian, 2 = Daftar Soal
  const [wizardStep, setWizardStep] = useState<1 | 2>(1)

  // Delete dialog
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingTitle, setDeletingTitle] = useState('')

  // Sessions dialog
  const [sessionOpen, setSessionOpen] = useState(false)
  const [sessionUjian, setSessionUjian] = useState<UjianRow | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionLoading, setSessionLoading] = useState(false)
  const [reopeningId, setReopeningId] = useState<string | null>(null)

  // Jawaban in-page navigation (replaces dialog)
  // view: 'list' | 'jawaban-list' | 'jawaban-detail'
  const [view, setView] = useState<'list' | 'jawaban-list' | 'jawaban-detail'>('list')
  const [jawabUjian, setJawabUjian] = useState<UjianRow | null>(null)
  const [jawabanGroups, setJawabanGroups] = useState<JawabanGroup[]>([])
  const [jawabLoading, setJawabLoading] = useState(false)
  const [selectedMahasiswaId, setSelectedMahasiswaId] = useState<string | null>(null)
  const [jawabSavingId, setJawabSavingId] = useState<string | null>(null)

  // UI store for cross-page navigation (from Nilai page → Ujian jawaban-detail)
  const { pendingNav, setPendingNav } = useUIStore()

  const loadUjian = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dosen/ujian', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat ujian')
      setUjianList(json.ujian || [])
      return json.ujian || []
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat ujian')
      return []
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
    loadUjian()
    loadDosenAjar()
  }, [loadUjian, loadDosenAjar])

  // Handle pending navigation from Nilai page (deep link to jawaban-detail)
  useEffect(() => {
    if (!pendingNav || pendingNav.page !== 'dosen-ujian') return
    const { ujianId, mahasiswaId } = pendingNav
    if (!ujianId) return
    // Find ujian in list (might still be loading)
    const findAndOpen = async () => {
      let list = ujianList
      if (list.length === 0) {
        list = await loadUjian()
      }
      const u = list.find((x) => x.id === ujianId)
      if (!u) {
        toast.error('Ujian tidak ditemukan')
        setPendingNav(null)
        return
      }
      // Open jawaban list, then auto-open mahasiswa detail
      setJawabUjian(u)
      setView('jawaban-list')
      setJawabLoading(true)
      setJawabanGroups([])
      try {
        const res = await fetch(`/api/dosen/ujian/${u.id}/jawaban`, { credentials: 'include' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal memuat jawaban')
        setJawabanGroups(json.grouped || [])
        // If mahasiswaId specified, jump directly to detail
        if (mahasiswaId && json.grouped?.some((g: any) => g.mahasiswa.id === mahasiswaId)) {
          setSelectedMahasiswaId(mahasiswaId)
          setView('jawaban-detail')
        }
      } catch (e: any) {
        toast.error(e.message || 'Terjadi kesalahan')
      } finally {
        setJawabLoading(false)
      }
      setPendingNav(null)
    }
    findAndOpen()
  }, [pendingNav])

  function openCreate() {
    if (dosenAjarList.length === 0) {
      toast.error('Belum ada penugasan kelas. Hubungi admin.')
      return
    }
    const now = new Date()
    const start = new Date(now.getTime() + 86400_000)
    const end = new Date(start.getTime() + 90 * 60_000)
    setEditing(null)
    setEditingDetail(null)
    setForm({
      dosenAjarId: '',
      title: '',
      type: 'UTS',
      description: '',
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
      durationMin: '90',
      instruction: '',
      shuffleSoal: false,
    })
    setSoalList([{ ...emptySoal(), pertanyaan: '', type: 'ESSAY' }])
    setWizardStep(1)
    setDialogOpen(true)
  }

  async function openEdit(u: UjianRow) {
    try {
      const res = await fetch(`/api/dosen/ujian/${u.id}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat detail ujian')
      const d: UjianDetail = json.ujian
      setEditing(u)
      setEditingDetail(d)
      setForm({
        dosenAjarId: d.dosenAjar.id,
        title: d.title,
        type: d.type,
        description: d.description || '',
        startTime: toLocalInput(d.startTime),
        endTime: toLocalInput(d.endTime),
        durationMin: String(d.durationMin),
        instruction: d.instruction || '',
        shuffleSoal: (d as any).shuffleSoal || false,
      })
      setSoalList(
        d.soal.length > 0
          ? d.soal.map((s) => ({
              ...s,
              options: Array.isArray(s.options) ? s.options : null,
              type: (s.type === 'MULTIPLE_CHOICE' ? 'MULTIPLE_CHOICE' : 'ESSAY') as 'ESSAY' | 'MULTIPLE_CHOICE',
            }))
          : [emptySoal()]
      )
      setWizardStep(1)
      setDialogOpen(true)
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  // Validate step 1 before proceeding to step 2
  function validateStep1(): boolean {
    if (!form.dosenAjarId) { toast.error('Pilih kelas / mata kuliah'); return false }
    if (!form.title.trim()) { toast.error('Judul ujian wajib diisi'); return false }
    if (!form.startTime) { toast.error('Waktu mulai wajib diisi'); return false }
    if (!form.endTime) { toast.error('Waktu selesai wajib diisi'); return false }
    if (new Date(form.endTime) <= new Date(form.startTime)) {
      toast.error('Waktu selesai harus setelah waktu mulai')
      return false
    }
    if (!form.durationMin || Number(form.durationMin) <= 0) {
      toast.error('Durasi tidak valid')
      return false
    }
    return true
  }

  async function handleSave() {
    if (!form.dosenAjarId) { toast.error('Pilih kelas'); return }
    if (!form.title.trim()) { toast.error('Judul wajib'); return }
    if (!form.startTime || !form.endTime) { toast.error('Waktu mulai & selesai wajib'); return }
    if (!form.durationMin || Number(form.durationMin) <= 0) { toast.error('Durasi tidak valid'); return }
    if (soalList.length === 0) { toast.error('Minimal 1 soal'); return }
    for (let i = 0; i < soalList.length; i++) {
      if (!soalList[i].pertanyaan.trim()) {
        toast.error(`Soal #${i + 1} belum ada pertanyaan`)
        return
      }
      if (soalList[i].type === 'MULTIPLE_CHOICE') {
        const opts = (soalList[i].options || []).filter((o) => o.trim())
        if (opts.length < 2) {
          toast.error(`Soal #${i + 1} butuh minimal 2 pilihan`)
          return
        }
      }
    }
    try {
      setSaving(true)
      const body: any = {
        dosenAjarId: form.dosenAjarId,
        title: form.title.trim(),
        type: form.type,
        description: form.description.trim() || undefined,
        startTime: form.startTime,
        endTime: form.endTime,
        durationMin: Number(form.durationMin),
        instruction: form.instruction.trim() || undefined,
        shuffleSoal: form.shuffleSoal,
        soal: soalList.map((s, i) => ({
          pertanyaan: s.pertanyaan.trim(),
          type: s.type,
          options: s.type === 'MULTIPLE_CHOICE' ? (s.options || []).filter((o) => o.trim()) : null,
          answerKey: s.answerKey?.trim() || null,
          points: Number(s.points) || 0,
          order: i,
        })),
      }
      const url = editing ? `/api/dosen/ujian/${editing.id}` : '/api/dosen/ujian'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan')
      toast.success(editing ? 'Ujian diperbarui' : 'Ujian dibuat')
      setDialogOpen(false)
      await loadUjian()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    try {
      const res = await fetch(`/api/dosen/ujian/${deletingId}`, {
        method: 'DELETE', credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('Ujian dihapus')
      setDeletingId(null)
      await loadUjian()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  async function openSessions(u: UjianRow) {
    setSessionUjian(u)
    setSessionOpen(true)
    setSessionLoading(true)
    setSessions([])
    try {
      const res = await fetch(`/api/dosen/ujian/${u.id}/sessions`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat sesi')
      setSessions(json.sessions || [])
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSessionLoading(false)
    }
  }

  async function reopenSession(sessionId: string) {
    if (!sessionUjian) return
    try {
      setReopeningId(sessionId)
      const res = await fetch(`/api/dosen/ujian/${sessionUjian.id}/sessions/${sessionId}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'Dibuka kembali oleh dosen' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal membuka kembali')
      toast.success(`Sesi dibuka kembali (${json.remainingMin} menit tersisa)`)
      await openSessions(sessionUjian)
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setReopeningId(null)
    }
  }

  // Jawaban: in-page navigation
  async function openJawabanList(u: UjianRow) {
    setJawabUjian(u)
    setView('jawaban-list')
    setJawabLoading(true)
    setJawabanGroups([])
    setSelectedMahasiswaId(null)
    try {
      const res = await fetch(`/api/dosen/ujian/${u.id}/jawaban`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat jawaban')
      setJawabanGroups(json.grouped || [])
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setJawabLoading(false)
    }
  }

  function backToUjianList() {
    setView('list')
    setJawabUjian(null)
    setJawabanGroups([])
    setSelectedMahasiswaId(null)
  }

  function openMahasiswaDetail(mhsId: string) {
    setSelectedMahasiswaId(mhsId)
    setView('jawaban-detail')
  }

  function backToJawabanList() {
    setSelectedMahasiswaId(null)
    setView('jawaban-list')
  }

  async function saveJawabanGrade(jawabanId: string, nilai: string, catatan: string) {
    if (!jawabUjian) return
    try {
      setJawabSavingId(jawabanId)
      const res = await fetch(`/api/dosen/ujian/${jawabUjian.id}/jawaban/${jawabanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nilai: nilai === '' ? null : Number(nilai),
          catatan,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan nilai')
      toast.success('Nilai disimpan')
      // Update local state
      setJawabanGroups((prev) =>
        prev.map((g) => ({
          ...g,
          jawaban: g.jawaban.map((j) =>
            j.id === jawabanId ? { ...j, nilai: json.jawaban.nilai, catatan: json.jawaban.catatan } : j
          ),
          totalNilai: g.jawaban.reduce(
            (sum, j) => sum + (j.id === jawabanId ? (json.jawaban.nilai ?? 0) : (j.nilai ?? 0)), 0
          ),
        }))
      )
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setJawabSavingId(null)
    }
  }

  // ============ RENDER: JAWABAN DETAIL VIEW ============
  if (view === 'jawaban-detail' && jawabUjian && selectedMahasiswaId) {
    const group = jawabanGroups.find((g) => g.mahasiswa.id === selectedMahasiswaId)
    if (!group) {
      backToJawabanList()
      return null
    }
    return (
      <JawabanDetailView
        ujian={jawabUjian}
        group={group}
        savingId={jawabSavingId}
        onSave={saveJawabanGrade}
        onBack={backToJawabanList}
      />
    )
  }

  // ============ RENDER: JAWABAN LIST (per mahasiswa) ============
  if (view === 'jawaban-list' && jawabUjian) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={backToUjianList} className="mb-3 -ml-2">
          <ChevronLeft className="w-4 h-4 mr-1" /> Kembali ke Daftar Ujian
        </Button>
        <PageHeader
          title={`Jawaban: ${jawabUjian.title}`}
          description={`${jawabUjian.dosenAjar.mataKuliah.name} · ${jawabUjian.dosenAjar.kelas.name} — Klik mahasiswa untuk melihat detail jawaban per soal`}
        />

        <Card>
          <CardContent className="p-0">
            {jawabLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : jawabanGroups.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Belum ada jawaban"
                description="Mahasiswa belum menjawab ujian ini"
              />
            ) : (
              <div className="divide-y">
                {jawabanGroups.map((g) => {
                  // Calculate auto-graded vs need-manual counts
                  let autoCorrect = 0, needManual = 0
                  g.jawaban.forEach((j) => {
                    const isPG = j.soal.type === 'MULTIPLE_CHOICE'
                    const correct = (j.soal.answerKey || '').trim().toUpperCase()
                    const ans = (j.answer || '').trim().toUpperCase()
                    if (isPG && correct && ans === correct && j.nilai != null) autoCorrect++
                    else if (j.nilai == null && (!isPG || !correct || ans !== correct)) needManual++
                  })
                  const isFullyGraded = needManual === 0
                  const percent = g.totalPoints > 0 ? Math.round((g.totalNilai / g.totalPoints) * 100) : 0
                  return (
                    <button
                      key={g.mahasiswa.id}
                      onClick={() => openMahasiswaDetail(g.mahasiswa.id)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-accent transition-colors text-left"
                    >
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {initials(g.mahasiswa.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate flex items-center gap-2">
                          {g.mahasiswa.name}
                          {needManual > 0 && (
                            <Badge variant="destructive" className="text-[10px] flex-shrink-0">
                              {needManual} perlu koreksi
                            </Badge>
                          )}
                          {isFullyGraded && autoCorrect > 0 && (
                            <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600 flex-shrink-0">
                              ✓ Selesai
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {g.mahasiswa.nim || 'no NIM'} · {g.mahasiswa.email}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {g.answeredCount}/{g.totalPoints > 0 ? g.jawaban.length : 0} terjawab
                          </Badge>
                          {autoCorrect > 0 ? (
                            <Badge variant={percent >= 70 ? 'default' : percent >= 50 ? 'secondary' : 'destructive'} className="text-[10px]">
                              {g.totalNilai}/{g.totalPoints} poin ({percent}%)
                            </Badge>
                          ) : needManual > 0 ? (
                            <Badge variant="outline" className="text-[10px]">Perlu koreksi</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Belum dinilai</Badge>
                          )}
                        </div>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-muted-foreground rotate-180 flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============ RENDER: UJIAN LIST (default) ============
  return (
    <div>
      <PageHeader
        title="Ujian"
        description="Buat dan kelola ujian beserta soal, sesi, dan penilaian"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Buat Ujian
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm flex-1">{error}</span>
              <Button variant="outline" size="sm" onClick={loadUjian}>
                <RefreshCw className="w-4 h-4 mr-2" /> Coba Lagi
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : ujianList.length === 0 ? (
            <EmptyState
              icon={FileCheck}
              title="Belum ada ujian"
              description="Buat ujian pertama Anda dengan tombol di atas"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Kelas / MK</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead>Selesai</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Soal</TableHead>
                    <TableHead>Sesi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ujianList.map((u) => {
                    const now = Date.now()
                    const upcoming = new Date(u.startTime).getTime() > now
                    const finished = new Date(u.endTime).getTime() < now
                    const sb = statusBadge(
                      upcoming ? 'NOT_STARTED' : finished ? 'FINISHED' : 'ONGOING'
                    )
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">{u.title}</div>
                          {u.description && (
                            <div className="text-xs text-muted-foreground max-w-48 truncate">
                              {u.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline">{TYPE_LABEL[u.type] || u.type}</Badge></TableCell>
                        <TableCell>
                          <div className="text-sm">{u.dosenAjar.mataKuliah.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {u.dosenAjar.mataKuliah.code} · {u.dosenAjar.kelas.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{formatDateTime(u.startTime)}</div>
                          <div className="text-muted-foreground">{upcoming ? timeUntil(u.startTime) : 'dimulai'}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{formatDateTime(u.endTime)}</div>
                          <div className={finished ? 'text-destructive' : 'text-muted-foreground'}>
                            {finished ? 'Berakhir' : timeUntil(u.endTime)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{u.durationMin} mnt</TableCell>
                        <TableCell><Badge variant="secondary">{u._count?.soal || 0}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{u._count?.sessions || 0}</Badge></TableCell>
                        <TableCell><Badge variant={sb.variant}>{sb.label}</Badge></TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => openSessions(u)} title="Lihat sesi">
                            <ListChecks className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openJawabanList(u)} title="Lihat jawaban & nilai">
                            <ClipboardList className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Kelola soal / Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { setDeletingId(u.id); setDeletingTitle(u.title) }}
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

      {/* Create / Edit Ujian Dialog - WIZARD 2 STEPS */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="flex-shrink-0 p-6 pb-3 border-b">
            <DialogTitle>{editing ? 'Kelola Soal & Edit Ujian' : 'Buat Ujian Baru'}</DialogTitle>
            <DialogDescription>
              {editing ? `Edit ujian dan kelola ${soalList.length} soal` : 'Wizard 2 langkah: info ujian, lalu tambah soal'}
            </DialogDescription>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-3">
              <div className={`flex items-center gap-2 ${wizardStep === 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${wizardStep === 1 ? 'bg-primary text-primary-foreground' : wizardStep > 1 ? 'bg-emerald-500 text-white' : 'bg-muted'}`}>
                  {wizardStep > 1 ? '✓' : '1'}
                </div>
                <span className="text-xs font-medium">Info Ujian</span>
              </div>
              <div className={`h-px w-8 ${wizardStep > 1 ? 'bg-emerald-500' : 'bg-border'}`} />
              <div className={`flex items-center gap-2 ${wizardStep === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${wizardStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  2
                </div>
                <span className="text-xs font-medium">Daftar Soal ({soalList.length})</span>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {wizardStep === 1 ? (
              /* STEP 1: Info Ujian */
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Kelas / Mata Kuliah <span className="text-destructive">*</span></Label>
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
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="u-title">Judul <span className="text-destructive">*</span></Label>
                    <Input
                      id="u-title"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="Judul ujian"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipe <span className="text-destructive">*</span></Label>
                    <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTS">UTS - Ujian Tengah Semester</SelectItem>
                        <SelectItem value="UAS">UAS - Ujian Akhir Semester</SelectItem>
                        <SelectItem value="QUIZ">Quiz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="u-desc">Deskripsi</Label>
                  <Textarea
                    id="u-desc"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Deskripsi singkat materi ujian..."
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="u-start">Waktu Mulai <span className="text-destructive">*</span></Label>
                    <Input
                      id="u-start"
                      type="datetime-local"
                      value={form.startTime}
                      onChange={(e) => {
                        const newStart = e.target.value
                        setForm((f) => {
                          // Auto-calculate duration if both start and end are set
                          const updated = { ...f, startTime: newStart }
                          if (newStart && f.endTime) {
                            const diffMs = new Date(f.endTime).getTime() - new Date(newStart).getTime()
                            if (diffMs > 0) {
                              const diffMin = Math.round(diffMs / 60000)
                              updated.durationMin = String(diffMin)
                            }
                          }
                          return updated
                        })
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="u-end">Waktu Selesai <span className="text-destructive">*</span></Label>
                    <Input
                      id="u-end"
                      type="datetime-local"
                      value={form.endTime}
                      onChange={(e) => {
                        const newEnd = e.target.value
                        setForm((f) => {
                          const updated = { ...f, endTime: newEnd }
                          if (f.startTime && newEnd) {
                            const diffMs = new Date(newEnd).getTime() - new Date(f.startTime).getTime()
                            if (diffMs > 0) {
                              const diffMin = Math.round(diffMs / 60000)
                              updated.durationMin = String(diffMin)
                            }
                          }
                          return updated
                        })
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="u-dur">Durasi (menit) <span className="text-destructive">*</span></Label>
                    <Input
                      id="u-dur"
                      type="number"
                      min={1}
                      value={form.durationMin}
                      onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      💡 Otomatis terisi dari selisih waktu mulai & selesai
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="u-ins">Instruksi untuk Mahasiswa</Label>
                  <Textarea
                    id="u-ins"
                    rows={3}
                    value={form.instruction}
                    onChange={(e) => setForm((f) => ({ ...f, instruction: e.target.value }))}
                    placeholder="Contoh: Wajib aktifkan kamera dan screen share. Dilarang buka tab baru..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Instruksi ini akan ditampilkan ke mahasiswa sebelum mereka mulai ujian
                  </p>
                </div>

                {/* Toggle: Acak Soal */}
                <div className="flex items-center justify-between p-3 rounded-md border bg-muted/20">
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      Acak Soal (Shuffle)
                      {form.shuffleSoal && (
                        <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">AKTIF</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Jika aktif, urutan soal akan diacak untuk setiap mahasiswa. Contoh: Mahasiswa A dapat soal #1 = "Apa itu HTML?", Mahasiswa B dapat soal #1 = "Jelaskan CSS". Mencegah contekan antar mahasiswa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, shuffleSoal: !f.shuffleSoal }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${
                      form.shuffleSoal ? 'bg-emerald-600' : 'bg-muted-foreground/30'
                    }`}
                    role="switch"
                    aria-checked={form.shuffleSoal}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        form.shuffleSoal ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 2: Daftar Soal */
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-muted/40 rounded-md p-3">
                  <div>
                    <div className="text-sm font-semibold">Total {soalList.length} soal</div>
                    <div className="text-xs text-muted-foreground">
                      Total poin: {soalList.reduce((sum, s) => sum + (Number(s.points) || 0), 0)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setSoalList((prev) => [...prev, emptySoal()])}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Tambah Soal
                  </Button>
                </div>

                <div className="space-y-4">
                  {soalList.map((s, i) => (
                    <SoalBuilder
                      key={i}
                      index={i}
                      soal={s}
                      onChange={(ns) =>
                        setSoalList((prev) => prev.map((p, j) => (j === i ? ns : p)))
                      }
                      onRemove={() => {
                        if (soalList.length === 1) {
                          toast.error('Minimal 1 soal')
                          return
                        }
                        setSoalList((prev) => prev.filter((_, j) => j !== i))
                      }}
                    />
                  ))}
                </div>

                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => setSoalList((prev) => [...prev, emptySoal()])}
                >
                  <Plus className="w-4 h-4 mr-2" /> Tambah Soal Lagi
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 p-6 pt-3 border-t flex items-center justify-between">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <div className="flex gap-2">
              {wizardStep === 2 && (
                <Button variant="outline" onClick={() => setWizardStep(1)} disabled={saving}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Kembali
                </Button>
              )}
              {wizardStep === 1 ? (
                <Button onClick={() => { if (validateStep1()) setWizardStep(2) }}>
                  Lanjut ke Daftar Soal →
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      {editing ? 'Simpan Perubahan' : 'Buat Ujian'}
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sessions Dialog - FIXED SCROLL */}
      <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="flex-shrink-0 p-6 pb-3 border-b">
            <DialogTitle>Sesi Ujian</DialogTitle>
            <DialogDescription>
              {sessionUjian?.title} — {sessionUjian?.dosenAjar.mataKuliah.code} · {sessionUjian?.dosenAjar.kelas.name}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {sessionLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="Belum ada sesi"
                description="Mahasiswa belum memulai ujian ini"
              />
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => {
                  const sb = statusBadge(s.status)
                  return (
                    <div key={s.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{s.mahasiswa.name}</div>
                          <div className="text-xs text-muted-foreground">{s.mahasiswa.nim || 'no NIM'}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                            <span>Mulai: {formatDateTime(s.startTime)}</span>
                            <span>· Akhir: {formatDateTime(s.endTime)}</span>
                          </div>
                          {s.submittedAt && (
                            <div className="text-xs text-muted-foreground">
                              Submit: {formatDateTime(s.submittedAt)}
                            </div>
                          )}
                          {s.reason && (
                            <div className="text-xs text-amber-600 mt-0.5">Alasan: {s.reason}</div>
                          )}
                          {s.violationCount > 0 && (
                            <div className="text-xs text-destructive mt-0.5">
                              Pelanggaran: {s.violationCount}x
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={sb.variant} className="text-xs">{sb.label}</Badge>
                          {s.autoSubmitted && (
                            <Badge variant="destructive" className="text-xs">Auto</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline">
                          Jawab: {s.jawabanAnswered}/{s.totalSoal}
                        </Badge>
                        <Badge variant="outline">
                          Nilai: {s.totalNilai}/{s.totalPointsPossible}
                        </Badge>
                        {['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'].includes(s.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-7 text-xs"
                            disabled={reopeningId === s.id}
                            onClick={() => reopenSession(s.id)}
                          >
                            <Unlock className="w-3 h-3 mr-1" />
                            {reopeningId === s.id ? 'Membuka...' : 'Buka Kembali'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter className="flex-shrink-0 p-6 pt-3 border-t">
            <Button variant="outline" onClick={() => setSessionOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Ujian?</AlertDialogTitle>
            <AlertDialogDescription>
              Ujian &quot;{deletingTitle}&quot; beserta semua soal, sesi, dan jawaban akan dihapus permanen.
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

// ============ JAWABAN DETAIL VIEW (per mahasiswa, per soal) ============
function JawabanDetailView({
  ujian, group, savingId, onSave, onBack,
}: {
  ujian: UjianRow
  group: JawabanGroup
  savingId: string | null
  onSave: (jawabanId: string, nilai: string, catatan: string) => void
  onBack: () => void
}) {
  const percent = group.totalPoints > 0 ? Math.round((group.totalNilai / group.totalPoints) * 100) : 0
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 -ml-2">
        <ChevronLeft className="w-4 h-4 mr-1" /> Kembali ke Daftar Mahasiswa
      </Button>

      <Card className="mb-4">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <Avatar className="w-12 h-12 flex-shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {initials(group.mahasiswa.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base">{group.mahasiswa.name}</div>
              <div className="text-xs text-muted-foreground">
                {group.mahasiswa.nim || 'no NIM'} · {group.mahasiswa.email}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Ujian: <span className="font-medium text-foreground">{ujian.title}</span> ({TYPE_LABEL[ujian.type] || ujian.type})
              </div>
              {/* Status badges: auto-graded vs need manual grading */}
              <div className="flex flex-wrap items-center gap-1 mt-2">
                {(() => {
                  let autoCorrect = 0, needManual = 0, totalAnswered = 0
                  group.jawaban.forEach((j) => {
                    const isPG = j.soal.type === 'MULTIPLE_CHOICE'
                    const correct = (j.soal.answerKey || '').trim().toUpperCase()
                    const ans = (j.answer || '').trim().toUpperCase()
                    if (j.answer) totalAnswered++
                    if (isPG && correct && ans === correct && j.nilai != null) autoCorrect++
                    else if (!isPG || (isPG && ans !== correct)) {
                      if (j.nilai == null) needManual++
                    }
                  })
                  return (
                    <>
                      <Badge variant="outline" className="text-[10px]">
                        {totalAnswered}/{group.jawaban.length} dijawab
                      </Badge>
                      {autoCorrect > 0 && (
                        <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                          ✓ {autoCorrect} auto-graded benar
                        </Badge>
                      )}
                      {needManual > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          ⚠ {needManual} perlu koreksi
                        </Badge>
                      )}
                      {needManual === 0 && autoCorrect > 0 && (
                        <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                          Semua sudah dinilai
                        </Badge>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Nilai</div>
              <div className={`text-3xl font-bold ${percent >= 70 ? 'text-emerald-600' : percent >= 50 ? 'text-amber-600' : 'text-destructive'}`}>
                {group.totalNilai}
                <span className="text-base text-muted-foreground font-normal">/{group.totalPoints}</span>
              </div>
              <Badge variant={percent >= 70 ? 'default' : percent >= 50 ? 'secondary' : 'destructive'}>
                {percent}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {group.jawaban.length === 0 && (
          <Card>
            <CardContent className="p-6">
              <EmptyState icon={ClipboardList} title="Belum ada jawaban" description="Mahasiswa ini belum menjawab soal apapun" />
            </CardContent>
          </Card>
        )}
        {group.jawaban.map((j, idx) => (
          <JawabanItem
            key={j.id}
            index={idx}
            jawaban={j}
            saving={savingId === j.id}
            onSave={(nilai, catatan) => onSave(j.id, nilai, catatan)}
          />
        ))}
      </div>
    </div>
  )
}

// ============ Jawaban Item (per soal) ============
function JawabanItem({
  index, jawaban, saving, onSave,
}: {
  index: number
  jawaban: JawabanRow
  saving: boolean
  onSave: (nilai: string, catatan: string) => void
}) {
  const [nilai, setNilai] = useState<string>(jawaban.nilai != null ? String(jawaban.nilai) : '')
  const [catatan, setCatatan] = useState<string>(jawaban.catatan || '')

  // Determine auto-grade status for PG questions
  const isPG = jawaban.soal.type === 'MULTIPLE_CHOICE'
  const correctAnswer = (jawaban.soal.answerKey || '').trim().toUpperCase()
  const studentAnswer = (jawaban.answer || '').trim().toUpperCase()
  const isCorrectPG = isPG && correctAnswer && studentAnswer === correctAnswer
  const isWrongPG = isPG && correctAnswer && studentAnswer !== correctAnswer && studentAnswer !== ''
  const isGraded = jawaban.nilai !== null && jawaban.nilai !== undefined

  return (
    <Card className={isCorrectPG ? 'border-emerald-300' : isWrongPG && !isGraded ? 'border-amber-300' : ''}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Soal header with auto-grade badge */}
        <div className="flex items-start gap-3">
          <Badge variant="secondary" className="font-mono flex-shrink-0">#{index + 1}</Badge>
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <Badge variant="outline" className="text-[10px]">
                {isPG ? 'Pilihan Ganda' : 'Essay'}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{jawaban.soal.points} poin</Badge>
              {isCorrectPG && isGraded && (
                <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                  ✓ Auto-graded: BENAR (nilai {jawaban.nilai})
                </Badge>
              )}
              {isWrongPG && !isGraded && (
                <Badge variant="destructive" className="text-[10px]">
                  ⚠ Jawaban SALAH - perlu koreksi manual
                </Badge>
              )}
              {isPG && !isCorrectPG && !isWrongPG && !isGraded && (
                <Badge variant="outline" className="text-[10px]">Belum dijawab</Badge>
              )}
              {!isPG && !isGraded && (
                <Badge variant="secondary" className="text-[10px]">Perlu koreksi manual</Badge>
              )}
              {isGraded && !isCorrectPG && (
                <Badge variant="default" className="text-[10px]">Sudah dinilai: {jawaban.nilai}</Badge>
              )}
            </div>
            <div className="text-sm font-medium">{jawaban.soal.pertanyaan}</div>
          </div>
        </div>

        <Separator />

        {/* Jawaban mahasiswa */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Jawaban Mahasiswa</div>
          <div className={`text-sm whitespace-pre-wrap rounded-md p-3 border ${
            isCorrectPG ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 text-emerald-900 dark:text-emerald-100' :
            isWrongPG ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300' :
            'bg-muted/30'
          }`}>
            {jawaban.answer || <span className="text-muted-foreground italic">(kosong)</span>}
          </div>
        </div>

        {/* Kunci jawaban (only show for dosen) */}
        {jawaban.soal.answerKey && (
          <div className="text-xs">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Kunci / Rubrik: </span>
            <span className="text-muted-foreground">{jawaban.soal.answerKey}</span>
          </div>
        )}

        <Separator />

        {/* Grade input - disabled if auto-graded correct */}
        <div className="grid sm:grid-cols-[120px_1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Nilai (0-{jawaban.soal.points})</Label>
            <Input
              type="number"
              min={0}
              max={jawaban.soal.points}
              value={nilai}
              onChange={(e) => setNilai(e.target.value)}
              placeholder={isWrongPG ? '0 (salah)' : '0'}
              className="h-9"
              disabled={isCorrectPG && isGraded}
            />
            {isCorrectPG && isGraded && (
              <p className="text-[10px] text-muted-foreground">Auto-graded, tidak bisa diubah</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Catatan untuk mahasiswa</Label>
            <Input
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Catatan / feedback..."
              className="h-9"
              disabled={isCorrectPG && isGraded}
            />
          </div>
          <Button
            size="sm"
            disabled={saving || (isCorrectPG && isGraded)}
            onClick={() => onSave(nilai, catatan)}
            className="h-9"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            {saving ? 'Menyimpan...' : isCorrectPG && isGraded ? 'Locked' : 'Simpan'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Soal Builder Sub-component (Collapsible) ============
function SoalBuilder({
  index, soal, onChange, onRemove,
}: {
  index: number
  soal: SoalRow
  onChange: (s: SoalRow) => void
  onRemove: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  function update<K extends keyof SoalRow>(key: K, value: SoalRow[K]) {
    onChange({ ...soal, [key]: value })
  }

  function addOption() {
    const opts = soal.options ? [...soal.options] : []
    opts.push('')
    update('options', opts)
  }
  function updateOption(i: number, val: string) {
    const opts = soal.options ? [...soal.options] : []
    opts[i] = val
    update('options', opts)
  }
  function removeOption(i: number) {
    const opts = soal.options ? [...soal.options] : []
    opts.splice(i, 1)
    update('options', opts)
  }

  // Build summary preview for collapsed state
  const previewText = soal.pertanyaan.trim()
    ? (soal.pertanyaan.length > 80 ? soal.pertanyaan.slice(0, 80) + '...' : soal.pertanyaan)
    : '(kosong - klik untuk edit)'
  const typeLabel = soal.type === 'MULTIPLE_CHOICE' ? 'PG' : 'Essay'
  const isFilled = !!soal.pertanyaan.trim()

  return (
    <div className={`border rounded-lg bg-card overflow-hidden ${isFilled ? 'border-emerald-300' : 'border-border'}`}>
      {/* Header - always visible, click to collapse/expand */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground rotate-[-90deg]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
        <Badge variant="secondary" className="font-mono flex-shrink-0">#{index + 1}</Badge>
        <Badge variant="outline" className="text-[10px] flex-shrink-0">{typeLabel}</Badge>
        <Badge variant="outline" className="text-[10px] flex-shrink-0">{soal.points} pt</Badge>
        <div className="flex-1 min-w-0 text-sm truncate">
          {previewText}
        </div>
        {isFilled && (
          <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Sudah diisi" />
        )}
        <Button
          variant="ghost" size="icon"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="text-destructive hover:text-destructive h-7 w-7 flex-shrink-0"
          title="Hapus soal"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Body - hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-3 border-t bg-muted/10 pt-3">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Pertanyaan <span className="text-destructive">*</span></Label>
            <Textarea
              rows={3}
              value={soal.pertanyaan}
              onChange={(e) => update('pertanyaan', e.target.value)}
              placeholder="Tulis pertanyaan di sini..."
              autoFocus={!isFilled}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Tipe Soal</Label>
              <Select
                value={soal.type}
                onValueChange={(v) => {
                  const newType = v as 'ESSAY' | 'MULTIPLE_CHOICE'
                  onChange({
                    ...soal,
                    type: newType,
                    options: newType === 'MULTIPLE_CHOICE' ? (soal.options || ['', '', '', '']) : null,
                    answerKey: newType === 'MULTIPLE_CHOICE' ? (soal.answerKey || 'A') : soal.answerKey,
                  })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ESSAY">Essay (isi jawaban bebas)</SelectItem>
                  <SelectItem value="MULTIPLE_CHOICE">Pilihan Ganda (A, B, C, D)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Poin</Label>
              <Input
                type="number"
                min={0}
                value={soal.points}
                onChange={(e) => update('points', Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {soal.type === 'MULTIPLE_CHOICE' && (
            <div className="space-y-2 bg-background rounded-md p-3 border">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Pilihan Jawaban (min. 2)</Label>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addOption}>
                  <Plus className="w-3 h-3 mr-1" /> Tambah Opsi
                </Button>
              </div>
              <div className="space-y-1.5">
                {(soal.options || []).map((opt, i) => {
                  const letter = String.fromCharCode(65 + i)
                  const isCorrect = (soal.answerKey || '').toUpperCase() === letter
                  return (
                    <div key={i} className={`flex items-center gap-2 rounded p-1 ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300' : ''}`}>
                      <Badge variant="outline" className="font-mono w-7 justify-center">{letter}</Badge>
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Opsi ${letter}`}
                        className="h-8 text-sm"
                      />
                      <Button
                        variant={isCorrect ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => update('answerKey', letter)}
                        className={`h-8 text-xs flex-shrink-0 ${isCorrect ? 'bg-emerald-600 hover:bg-emerald-600' : ''}`}
                        title="Tandai sebagai kunci jawaban"
                      >
                        {isCorrect ? '✓ Kunci' : 'Set Kunci'}
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => removeOption(i)}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Hapus opsi"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
                {(soal.options || []).length === 0 && (
                  <p className="text-xs text-muted-foreground">Belum ada opsi. Klik &quot;Tambah Opsi&quot;.</p>
                )}
              </div>
              <div className="pt-2 border-t">
                <Label className="text-xs font-medium">
                  Kunci Jawaban:{' '}
                  <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                    {soal.answerKey || '(belum dipilih)'}
                  </Badge>
                </Label>
                <p className="text-[11px] text-muted-foreground mt-1">
                  💡 Klik tombol "Set Kunci" di samping opsi yang benar. Jawaban benar otomatis dinilai penuh saat mahasiswa submit.
                </p>
              </div>
            </div>
          )}

          {soal.type === 'ESSAY' && (
            <div className="space-y-2 bg-background rounded-md p-3 border">
              <Label className="text-xs font-medium">Rubrik / Catatan Kunci Jawaban</Label>
              <Textarea
                rows={2}
                value={soal.answerKey || ''}
                onChange={(e) => update('answerKey', e.target.value)}
                placeholder="Poin-poin kunci untuk penilaian essay, mis: 'Sebutkan 3 komponen utama HTML, CSS, JS - masing-masing 5 poin'"
              />
              <p className="text-xs text-muted-foreground">
                💡 Rubrik ini hanya dilihat oleh dosen saat menilai, tidak ditampilkan ke mahasiswa
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
