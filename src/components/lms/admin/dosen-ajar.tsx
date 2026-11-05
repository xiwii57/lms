'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Calendar, Plus, RefreshCw, Pencil, Trash2, AlertCircle, DoorOpen,
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
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { DAYS } from '@/components/lms/shared/format'
import { toast } from 'sonner'

interface DosenOpt {
  id: string
  name: string
  email: string
  nip?: string | null
}
interface MkOpt {
  id: string
  name: string
  code: string
}
interface KelasOpt {
  id: string
  name: string
}
interface DosenAjarRow {
  id: string
  dosenId: string
  mataKuliahId: string
  kelasId: string
  scheduleDay: string
  scheduleTime: string
  room?: string | null
  dosen?: { id: string; name: string; email: string; nip?: string | null }
  mataKuliah?: { id: string; name: string; code: string; prodi?: { code: string } }
  kelas?: { id: string; name: string; prodi?: { code: string } }
}

interface FormState {
  dosenId: string
  mataKuliahId: string
  kelasId: string
  scheduleDay: string
  scheduleTime: string
  room: string
}
const emptyForm: FormState = {
  dosenId: '', mataKuliahId: '', kelasId: '',
  scheduleDay: DAYS[0], scheduleTime: '08:00-10:00', room: '',
}

function dayColor(day: string): string {
  const i = DAYS.indexOf(day)
  const colors = [
    'text-rose-600', 'text-emerald-600', 'text-amber-600',
    'text-purple-600', 'text-orange-600', 'text-sky-600', 'text-pink-600',
  ]
  return colors[i] || 'text-muted-foreground'
}

export function AdminDosenAjar() {
  const [list, setList] = useState<DosenAjarRow[]>([])
  const [dosenList, setDosenList] = useState<DosenOpt[]>([])
  const [mkList, setMkList] = useState<MkOpt[]>([])
  const [kelasList, setKelasList] = useState<KelasOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DosenAjarRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadOptions = useCallback(async () => {
    try {
      const [dRes, kRes, mRes] = await Promise.all([
        fetch('/api/admin/users?role=DOSEN', { credentials: 'include' }),
        fetch('/api/admin/kelas', { credentials: 'include' }),
        fetch('/api/admin/mata-kuliah', { credentials: 'include' }),
      ])
      const dJson = await dRes.json()
      const kJson = await kRes.json()
      const mJson = await mRes.json()
      if (dRes.ok) setDosenList(dJson.users || [])
      if (kRes.ok) setKelasList(kJson.kelas || [])
      if (mRes.ok) setMkList(mJson.mataKuliah || [])
    } catch {}
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/dosen-ajar', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setList(json.dosenAjar || [])
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    loadOptions()
  }, [load, loadOptions])

  function openCreate() {
    if (dosenList.length === 0) {
      toast.error('Belum ada dosen. Tambahkan user dengan role DOSEN terlebih dahulu.')
      return
    }
    if (mkList.length === 0 || kelasList.length === 0) {
      toast.error('Lengkapi data mata kuliah dan kelas terlebih dahulu')
      return
    }
    setEditing(null)
    setForm({
      ...emptyForm,
      dosenId: dosenList[0]?.id || '',
      mataKuliahId: mkList[0]?.id || '',
      kelasId: kelasList[0]?.id || '',
    })
    setDialogOpen(true)
  }
  function openEdit(d: DosenAjarRow) {
    setEditing(d)
    setForm({
      dosenId: d.dosenId,
      mataKuliahId: d.mataKuliahId,
      kelasId: d.kelasId,
      scheduleDay: d.scheduleDay,
      scheduleTime: d.scheduleTime,
      room: d.room || '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.dosenId || !form.mataKuliahId || !form.kelasId || !form.scheduleDay || !form.scheduleTime.trim()) {
      toast.error('Semua field bertanda * wajib diisi')
      return
    }
    try {
      setSaving(true)
      const body = {
        dosenId: form.dosenId,
        mataKuliahId: form.mataKuliahId,
        kelasId: form.kelasId,
        scheduleDay: form.scheduleDay,
        scheduleTime: form.scheduleTime.trim(),
        room: form.room.trim() || null,
      }
      if (editing) {
        const res = await fetch(`/api/admin/dosen-ajar/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal update')
        toast.success('Penugasan berhasil diperbarui')
      } else {
        const res = await fetch('/api/admin/dosen-ajar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal tambah')
        toast.success('Penugasan dosen berhasil ditambahkan')
      }
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    try {
      const res = await fetch(`/api/admin/dosen-ajar/${deletingId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('Penugasan berhasil dihapus')
      setDeletingId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  return (
    <div>
      <PageHeader
        title="Penugasan Dosen"
        description="Atur jadwal mengajar dosen untuk mata kuliah di kelas tertentu"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Tambah Penugasan
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
              <Button variant="outline" size="sm" onClick={load} className="ml-auto">Coba Lagi</Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={Calendar} title="Belum ada penugasan" description="Tambahkan penugasan untuk membuat jadwal mengajar dosen" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dosen</TableHead>
                  <TableHead>Mata Kuliah</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Hari</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Ruangan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-medium">{d.dosen?.name}</div>
                      <div className="text-xs text-muted-foreground">{d.dosen?.nip || d.dosen?.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">{d.mataKuliah?.code}</Badge>
                      <div className="text-xs text-muted-foreground mt-0.5">{d.mataKuliah?.name}</div>
                    </TableCell>
                    <TableCell>{d.kelas?.name}</TableCell>
                    <TableCell>
                      <span className={`font-medium ${dayColor(d.scheduleDay)}`}>{d.scheduleDay}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.scheduleTime}</TableCell>
                    <TableCell>
                      {d.room ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <DoorOpen className="w-3.5 h-3.5 text-muted-foreground" /> {d.room}
                        </span>
                      ) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setDeletingId(d.id)}
                        className="text-destructive hover:text-destructive"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Penugasan' : 'Tambah Penugasan Dosen'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Perbarui jadwal mengajar' : 'Tugaskan dosen untuk mengajar mata kuliah di kelas tertentu'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dosen *</Label>
              <Select value={form.dosenId} onValueChange={(v) => setForm({ ...form, dosenId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih dosen" />
                </SelectTrigger>
                <SelectContent>
                  {dosenList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} {d.nip ? `· ${d.nip}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mata Kuliah *</Label>
              <Select value={form.mataKuliahId} onValueChange={(v) => setForm({ ...form, mataKuliahId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih mata kuliah" />
                </SelectTrigger>
                <SelectContent>
                  {mkList.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.code} · {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kelas *</Label>
              <Select value={form.kelasId} onValueChange={(v) => setForm({ ...form, kelasId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih kelas" />
                </SelectTrigger>
                <SelectContent>
                  {kelasList.map((k) => (
                    <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hari *</Label>
                <Select value={form.scheduleDay} onValueChange={(v) => setForm({ ...form, scheduleDay: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-time">Waktu *</Label>
                <Input id="d-time" value={form.scheduleTime} onChange={(e) => setForm({ ...form, scheduleTime: e.target.value })} placeholder="08:00-10:00" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-room">Ruangan (opsional)</Label>
              <Input id="d-room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Ruang 101 / Online" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</> : editing ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Penugasan?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus penugasan dosen beserta seluruh data tugas, absensi, dan ujian terkait.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
