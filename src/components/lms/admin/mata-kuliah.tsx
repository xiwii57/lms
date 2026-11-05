'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Library, Plus, RefreshCw, Pencil, Trash2, AlertCircle,
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
import { toast } from 'sonner'

interface Prodi {
  id: string
  name: string
  code: string
}
interface MkRow {
  id: string
  name: string
  code: string
  sks: number
  semester: number
  prodiId: string
  prodi?: { name: string; code: string }
  _count?: { dosenAjar: number }
}

interface FormState {
  name: string
  code: string
  sks: string
  semester: string
  prodiId: string
}
const emptyForm: FormState = {
  name: '', code: '', sks: '3', semester: '1', prodiId: '',
}

export function AdminMataKuliah() {
  const [mk, setMk] = useState<MkRow[]>([])
  const [prodiList, setProdiList] = useState<Prodi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MkRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState('')

  const loadProdi = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/prodi', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setProdiList(json.prodi || [])
    } catch {}
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/mata-kuliah', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setMk(json.mataKuliah || [])
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    loadProdi()
  }, [load, loadProdi])

  function openCreate() {
    if (prodiList.length === 0) {
      toast.error('Tambahkan program studi terlebih dahulu')
      return
    }
    setEditing(null)
    setForm({ ...emptyForm, prodiId: prodiList[0]?.id || '' })
    setDialogOpen(true)
  }
  function openEdit(m: MkRow) {
    setEditing(m)
    setForm({
      name: m.name,
      code: m.code,
      sks: String(m.sks),
      semester: String(m.semester),
      prodiId: m.prodiId,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.code.trim() || !form.prodiId) {
      toast.error('Nama, kode, dan prodi wajib diisi')
      return
    }
    const sks = Number(form.sks)
    const semester = Number(form.semester)
    if (isNaN(sks) || sks < 1 || sks > 8) {
      toast.error('SKS harus angka 1-8')
      return
    }
    if (isNaN(semester) || semester < 1 || semester > 14) {
      toast.error('Semester harus angka 1-14')
      return
    }
    try {
      setSaving(true)
      const body = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        sks,
        semester,
        prodiId: form.prodiId,
      }
      if (editing) {
        const res = await fetch(`/api/admin/mata-kuliah/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal update')
        toast.success('Mata kuliah berhasil diperbarui')
      } else {
        const res = await fetch('/api/admin/mata-kuliah', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal tambah')
        toast.success('Mata kuliah berhasil ditambahkan')
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
      const res = await fetch(`/api/admin/mata-kuliah/${deletingId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('Mata kuliah berhasil dihapus')
      setDeletingId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  return (
    <div>
      <PageHeader
        title="Mata Kuliah"
        description="Kelola daftar mata kuliah per program studi"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Tambah Mata Kuliah
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
          ) : mk.length === 0 ? (
            <EmptyState icon={Library} title="Belum ada mata kuliah" description="Tambahkan mata kuliah untuk mulai membuat penugasan dosen" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>SKS</TableHead>
                  <TableHead>Semester</TableHead>
                  <TableHead>Prodi</TableHead>
                  <TableHead>Dosen</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mk.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">{m.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.sks}</TableCell>
                    <TableCell>{m.semester}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{m.prodi?.code}</span>
                      <span className="text-muted-foreground"> · {m.prodi?.name}</span>
                    </TableCell>
                    <TableCell>{m._count?.dosenAjar ?? 0}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(m)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => { setDeletingId(m.id); setDeletingName(m.name) }}
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
            <DialogTitle>{editing ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Perbarui informasi mata kuliah' : 'Buat mata kuliah baru'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="m-name">Nama Mata Kuliah</Label>
              <Input id="m-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pemrograman Web" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="m-code">Kode</Label>
                <Input id="m-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="PW" className="font-mono uppercase" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-prodi">Program Studi</Label>
                <Select value={form.prodiId} onValueChange={(v) => setForm({ ...form, prodiId: v })}>
                  <SelectTrigger id="m-prodi" className="w-full">
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {prodiList.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="m-sks">SKS</Label>
                <Input id="m-sks" type="number" min={1} max={8} value={form.sks} onChange={(e) => setForm({ ...form, sks: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-sem">Semester</Label>
                <Input id="m-sem" type="number" min={1} max={14} value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} />
              </div>
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
            <AlertDialogTitle>Hapus Mata Kuliah?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <span className="font-medium text-foreground">{deletingName}</span>?
              Semua penugasan dosen, tugas, absensi, dan ujian terkait akan dihapus.
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
