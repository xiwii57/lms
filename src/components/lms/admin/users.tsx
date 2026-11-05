'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Users, Plus, Search, RefreshCw, Pencil, Trash2, AlertCircle,
  KeyRound, Copy, Shield, GraduationCap, BookOpen, Monitor,
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
import { formatDateTime } from '@/components/lms/shared/format'
import { toast } from 'sonner'

type Role = 'ADMIN' | 'DOSEN' | 'MAHASISWA' | 'OPERATOR'


interface UserRow {
  id: string
  email: string
  name: string
  role: Role
  nip?: string | null
  nim?: string | null
  phone?: string | null
  createdAt: string
  mahasiswaKelas?: Array<{ kelas: { id: string; name: string; prodi?: { name: string } } }>
  dosenAjar?: Array<{ id: string }>
}

interface FormState {
  name: string
  email: string
  password: string
  role: Role
  nip: string
  nim: string
  phone: string
}

const emptyForm: FormState = {
  name: '', email: '', password: '', role: 'MAHASISWA',
  nip: '', nim: '', phone: '',
}

function roleBadge(role: Role) {
  const map: Record<Role, { label: string; variant: 'default' | 'secondary' | 'outline'; icon: any; color: string }> = {
    ADMIN: { label: 'Admin', variant: 'default', icon: Shield, color: 'text-rose-600' },
    DOSEN: { label: 'Dosen', variant: 'secondary', icon: GraduationCap, color: 'text-emerald-600' },
    MAHASISWA: { label: 'Mahasiswa', variant: 'outline', icon: BookOpen, color: 'text-amber-600' },
    OPERATOR: { label: 'Operator', variant: 'secondary', icon: Monitor, color: 'text-blue-600' },
  }
  return map[role]
}

function genPassword(): string {
  // Generate 12-char alphanumeric password client-side as a suggestion
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [generatedPwd, setGeneratedPwd] = useState<string | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (roleFilter !== 'ALL') params.set('role', roleFilter)
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/users?${params.toString()}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setUsers(json.users || [])
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [roleFilter, search])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setGeneratedPwd(null)
    setDialogOpen(true)
  }

  function openEdit(u: UserRow) {
    setEditing(u)
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      nip: u.nip || '',
      nim: u.nim || '',
      phone: u.phone || '',
    })
    setGeneratedPwd(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Nama dan email wajib diisi')
      return
    }
    try {
      setSaving(true)
      const body: any = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        nip: form.role === 'DOSEN' ? form.nip.trim() : null,
        nim: form.role === 'MAHASISWA' ? form.nim.trim() : null,
        phone: form.phone.trim() || null,
      }
      if (form.password.trim()) body.password = form.password.trim()

      if (editing) {
        const res = await fetch(`/api/admin/users/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal update')
        toast.success('User berhasil diperbarui')
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Gagal tambah')
        toast.success('User berhasil ditambahkan')
        if (json.generatedPassword) {
          setGeneratedPwd(json.generatedPassword)
        }
      }
      if (!generatedPwd || editing) {
        setDialogOpen(false)
      }
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
      const res = await fetch(`/api/admin/users/${deletingId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      toast.success('User berhasil dihapus')
      setDeletingId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  return (
    <div>
      <PageHeader
        title="Manajemen User"
        description="Kelola akun admin, dosen, dan mahasiswa"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Tambah User
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Role</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="DOSEN">Dosen</SelectItem>
            <SelectItem value="MAHASISWA">Mahasiswa</SelectItem>
            <SelectItem value="OPERATOR">Operator</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Muat ulang">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table / Loading / Empty / Error */}
      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="Belum ada user" description="Tambahkan user baru untuk memulai" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>NIP/NIM</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const rb = roleBadge(u.role)
                  const Icon = rb.icon
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={rb.variant} className="gap-1">
                          <Icon className={`w-3 h-3 ${rb.color}`} />
                          {rb.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.role === 'DOSEN' ? (u.nip || '-') : u.role === 'MAHASISWA' ? (u.nim || '-') : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-48">
                        {u.role === 'MAHASISWA' && u.mahasiswaKelas && u.mahasiswaKelas.length > 0 ? (
                          <span>{u.mahasiswaKelas.map((k) => k.kelas.name).join(', ')}</span>
                        ) : u.role === 'DOSEN' ? (
                          <span>{u.dosenAjar?.length || 0} penugasan</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { setDeletingId(u.id); setDeletingName(u.name) }}
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
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setGeneratedPwd(null) }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit User' : 'Tambah User'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Perbarui informasi user' : 'Buat akun baru untuk admin, dosen, atau mahasiswa'}
            </DialogDescription>
          </DialogHeader>

          {generatedPwd ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <KeyRound className="w-4 h-4" />
                  <span className="text-sm font-medium">Password dibuat otomatis</span>
                </div>
                <div className="font-mono text-lg font-bold tracking-wide bg-background border rounded px-3 py-2 select-all">
                  {generatedPwd}
                </div>
                <p className="text-xs text-muted-foreground">
                  Catat password ini. Demi keamanan, password tidak akan ditampilkan lagi.
                </p>
                <Button
                  variant="outline" size="sm" className="w-full"
                  onClick={() => {
                    navigator.clipboard?.writeText(generatedPwd)
                    toast.success('Password disalin ke clipboard')
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-2" /> Salin Password
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => { setDialogOpen(false); setGeneratedPwd(null) }} className="w-full">
                  Selesai
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="u-name">Nama Lengkap</Label>
                  <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama lengkap" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="u-email">Email</Label>
                  <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@lms.id" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="u-role">Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                    <SelectTrigger id="u-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="DOSEN">Dosen</SelectItem>
                      <SelectItem value="MAHASISWA">Mahasiswa</SelectItem>
                      <SelectItem value="OPERATOR">Operator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.role === 'DOSEN' && (
                  <div className="space-y-2">
                    <Label htmlFor="u-nip">NIP</Label>
                    <Input id="u-nip" value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} placeholder="Nomor Induk Pegawai" />
                  </div>
                )}
                {form.role === 'MAHASISWA' && (
                  <div className="space-y-2">
                    <Label htmlFor="u-nim">NIM</Label>
                    <Input id="u-nim" value={form.nim} onChange={(e) => setForm({ ...form, nim: e.target.value })} placeholder="Nomor Induk Mahasiswa" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="u-phone">No. Telepon (opsional)</Label>
                  <Input id="u-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="u-password">
                      Password {editing && <span className="text-xs text-muted-foreground">(kosongkan jika tidak diubah)</span>}
                    </Label>
                    {!editing && (
                      <Button
                        type="button" variant="ghost" size="sm"
                        onClick={() => setForm({ ...form, password: genPassword() })}
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1" /> Generate
                      </Button>
                    )}
                  </div>
                  <Input
                    id="u-password"
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editing ? '••••••••' : 'Kosongkan untuk auto-generate'}
                  />
                  {!editing && (
                    <p className="text-xs text-muted-foreground">
                      Jika dikosongkan, sistem akan membuat password acak dan menampilkannya setelah user dibuat.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                  Batal
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...
                    </>
                  ) : editing ? 'Simpan Perubahan' : 'Tambah User'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus User?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <span className="font-medium text-foreground">{deletingName}</span>?
              Tindakan ini tidak dapat dibatalkan dan akan menghapus semua data terkait.
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
