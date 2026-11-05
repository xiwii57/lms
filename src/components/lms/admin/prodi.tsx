'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  BookMarked, Plus, RefreshCw, Pencil, Trash2, AlertCircle,
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
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { toast } from 'sonner'

interface ProdiRow {
  id: string
  name: string
  code: string
  createdAt: string
  _count?: { kelas: number; mataKuliah: number }
}

interface FormState {
  name: string
  code: string
}

const emptyForm: FormState = { name: '', code: '' }

export function AdminProdi() {
  const [prodi, setProdi] = useState<ProdiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProdiRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/prodi', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setProdi(json.prodi || [])
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }
  function openEdit(p: ProdiRow) {
    setEditing(p)
    setForm({ name: p.name, code: p.code })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Nama dan kode wajib diisi')
      return
    }
    try {
      setSaving(true)
      const body = { name: form.name.trim(), code: form.code.trim() }
      if (editing) {
        const res = await fetch(`/api/admin/prodi/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal update')
        toast.success('Prodi berhasil diperbarui')
      } else {
        const res = await fetch('/api/admin/prodi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal tambah')
        toast.success('Prodi berhasil ditambahkan')
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
      const res = await fetch(`/api/admin/prodi/${deletingId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('Prodi berhasil dihapus')
      setDeletingId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  return (
    <div>
      <PageHeader
        title="Program Studi"
        description="Kelola daftar program studi yang tersedia"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Tambah Prodi
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
          ) : prodi.length === 0 ? (
            <EmptyState icon={BookMarked} title="Belum ada prodi" description="Tambahkan program studi untuk memulai" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Prodi</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Mata Kuliah</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prodi.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">{p.code}</Badge>
                    </TableCell>
                    <TableCell>{p._count?.kelas ?? 0}</TableCell>
                    <TableCell>{p._count?.mataKuliah ?? 0}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => { setDeletingId(p.id); setDeletingName(p.name) }}
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
            <DialogTitle>{editing ? 'Edit Prodi' : 'Tambah Prodi'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Perbarui informasi program studi' : 'Buat program studi baru'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-name">Nama Program Studi</Label>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Teknik Informatika" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-code">Kode Prodi</Label>
              <Input id="p-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="TI" className="font-mono uppercase" />
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
            <AlertDialogTitle>Hapus Prodi?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <span className="font-medium text-foreground">{deletingName}</span>?
              Semua kelas dan mata kuliah terkait juga akan dihapus.
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
