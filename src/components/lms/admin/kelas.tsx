'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  School, Plus, RefreshCw, Pencil, Trash2, AlertCircle,
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
interface KelasRow {
  id: string
  name: string
  prodiId: string
  prodi?: { name: string; code: string }
  _count?: { mahasiswaKelas: number; dosenAjar: number }
}

interface FormState {
  name: string
  prodiId: string
}
const emptyForm: FormState = { name: '', prodiId: '' }

export function AdminKelas() {
  const [kelas, setKelas] = useState<KelasRow[]>([])
  const [prodiList, setProdiList] = useState<Prodi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<KelasRow | null>(null)
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
      const res = await fetch('/api/admin/kelas', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setKelas(json.kelas || [])
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
    setForm({ name: '', prodiId: prodiList[0]?.id || '' })
    setDialogOpen(true)
  }
  function openEdit(k: KelasRow) {
    setEditing(k)
    setForm({ name: k.name, prodiId: k.prodiId })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.prodiId) {
      toast.error('Nama dan prodi wajib diisi')
      return
    }
    try {
      setSaving(true)
      const body = { name: form.name.trim(), prodiId: form.prodiId }
      if (editing) {
        const res = await fetch(`/api/admin/kelas/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal update')
        toast.success('Kelas berhasil diperbarui')
      } else {
        const res = await fetch('/api/admin/kelas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal tambah')
        toast.success('Kelas berhasil ditambahkan')
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
      const res = await fetch(`/api/admin/kelas/${deletingId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('Kelas berhasil dihapus')
      setDeletingId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  return (
    <div>
      <PageHeader
        title="Kelas"
        description="Kelola daftar kelas per program studi"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Tambah Kelas
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
          ) : kelas.length === 0 ? (
            <EmptyState icon={School} title="Belum ada kelas" description="Tambahkan kelas untuk mengelompokkan mahasiswa" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Kelas</TableHead>
                  <TableHead>Program Studi</TableHead>
                  <TableHead>Mahasiswa</TableHead>
                  <TableHead>Penugasan Dosen</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kelas.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {k.prodi?.code || '-'}
                        <span className="text-muted-foreground ml-1">· {k.prodi?.name}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>{k._count?.mahasiswaKelas ?? 0}</TableCell>
                    <TableCell>{k._count?.dosenAjar ?? 0}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(k)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => { setDeletingId(k.id); setDeletingName(k.name) }}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Kelas' : 'Tambah Kelas'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Perbarui informasi kelas' : 'Buat kelas baru untuk sebuah program studi'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="k-name">Nama Kelas</Label>
              <Input id="k-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="TI-3A" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-prodi">Program Studi</Label>
              <Select value={form.prodiId} onValueChange={(v) => setForm({ ...form, prodiId: v })}>
                <SelectTrigger id="k-prodi" className="w-full">
                  <SelectValue placeholder="Pilih prodi" />
                </SelectTrigger>
                <SelectContent>
                  {prodiList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <AlertDialogTitle>Hapus Kelas?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <span className="font-medium text-foreground">{deletingName}</span>?
              Data penempatan mahasiswa dan penugasan dosen akan ikut terhapus.
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
