'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  UserCheck, Plus, RefreshCw, Trash2, AlertCircle, ChevronDown, ChevronRight,
  Users, School,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { toast } from 'sonner'

interface MhsOpt {
  id: string
  name: string
  email: string
  nim?: string | null
}
interface KelasOpt {
  id: string
  name: string
  prodi?: { code: string; name: string }
}
interface AssignRow {
  id: string
  mahasiswaId: string
  kelasId: string
  createdAt: string
  mahasiswa?: { id: string; name: string; email: string; nim?: string | null }
  kelas?: { id: string; name: string; prodi?: { code: string; name: string } }
}

export function AdminMahasiswaKelas() {
  const [list, setList] = useState<AssignRow[]>([])
  const [mhsList, setMhsList] = useState<MhsOpt[]>([])
  const [kelasList, setKelasList] = useState<KelasOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // assign form
  const [mhsId, setMhsId] = useState('')
  const [kelasId, setKelasId] = useState('')
  const [assigning, setAssigning] = useState(false)

  // unassign confirmation
  const [unassign, setUnassign] = useState<{ mahasiswaId: string; kelasId: string; mhsName: string; kelasName: string } | null>(null)

  // search mhs
  const [mhsSearch, setMhsSearch] = useState('')

  // expanded kelas for grouped view
  const [expandedKelas, setExpandedKelas] = useState<string | null>(null)

  const loadOptions = useCallback(async () => {
    try {
      const [mRes, kRes] = await Promise.all([
        fetch('/api/admin/users?role=MAHASISWA', { credentials: 'include' }),
        fetch('/api/admin/kelas', { credentials: 'include' }),
      ])
      const mJson = await mRes.json()
      const kJson = await kRes.json()
      if (mRes.ok) setMhsList(mJson.users || [])
      if (kRes.ok) setKelasList(kJson.kelas || [])
    } catch {}
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/mahasiswa-kelas', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setList(json.mahasiswaKelas || [])
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

  // Group assignments by kelas
  const grouped = useMemo(() => {
    const map: Record<string, { kelas: KelasOpt; mhs: AssignRow[] }> = {}
    for (const k of kelasList) {
      map[k.id] = { kelas: k, mhs: [] }
    }
    for (const a of list) {
      const key = a.kelasId
      if (!map[key]) {
        map[key] = {
          kelas: { id: a.kelasId, name: a.kelas?.name || 'Kelas', prodi: a.kelas?.prodi },
          mhs: [],
        }
      }
      map[key].mhs.push(a)
    }
    return Object.values(map).sort((a, b) => a.kelas.name.localeCompare(b.kelas.name))
  }, [list, kelasList])

  const filteredMhsList = useMemo(() => {
    if (!mhsSearch.trim()) return mhsList
    const q = mhsSearch.toLowerCase()
    return mhsList.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.nim || '').toLowerCase().includes(q)
    )
  }, [mhsList, mhsSearch])

  const filteredList = useMemo(() => {
    if (!mhsSearch.trim()) return list
    const q = mhsSearch.toLowerCase()
    return list.filter((a) =>
      a.mahasiswa?.name.toLowerCase().includes(q) ||
      a.mahasiswa?.email.toLowerCase().includes(q) ||
      (a.mahasiswa?.nim || '').toLowerCase().includes(q)
    )
  }, [list, mhsSearch])

  async function handleAssign() {
    if (!mhsId || !kelasId) {
      toast.error('Pilih mahasiswa dan kelas terlebih dahulu')
      return
    }
    try {
      setAssigning(true)
      const res = await fetch('/api/admin/mahasiswa-kelas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mahasiswaId: mhsId, kelasId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menempatkan')
      toast.success('Mahasiswa berhasil ditempatkan di kelas')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setAssigning(false)
    }
  }

  async function handleUnassign() {
    if (!unassign) return
    try {
      const params = new URLSearchParams({
        mahasiswaId: unassign.mahasiswaId,
        kelasId: unassign.kelasId,
      })
      const res = await fetch(`/api/admin/mahasiswa-kelas?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menghapus')
      toast.success('Mahasiswa dikeluarkan dari kelas')
      setUnassign(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan')
    }
  }

  return (
    <div>
      <PageHeader
        title="Penempatan Mahasiswa"
        description="Tempatkan mahasiswa ke kelas untuk mengikuti mata kuliah"
      />

      {/* Assign form */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Tempatkan Mahasiswa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-2">
              <Label>Mahasiswa</Label>
              <Select value={mhsId} onValueChange={setMhsId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih mahasiswa" />
                </SelectTrigger>
                <SelectContent>
                  {mhsList.length === 0 ? (
                    <SelectItem value="_none" disabled>Belum ada mahasiswa</SelectItem>
                  ) : (
                    mhsList.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.nim ? `· ${m.nim}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kelas</Label>
              <Select value={kelasId} onValueChange={setKelasId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih kelas" />
                </SelectTrigger>
                <SelectContent>
                  {kelasList.length === 0 ? (
                    <SelectItem value="_none" disabled>Belum ada kelas</SelectItem>
                  ) : (
                    kelasList.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name} {k.prodi ? `· ${k.prodi.code}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAssign} disabled={assigning || !mhsId || !kelasId}>
              {assigning ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Memproses...</>
              ) : (
                <><UserCheck className="w-4 h-4 mr-2" /> Tempatkan</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Input
          placeholder="Cari mahasiswa..."
          value={mhsSearch}
          onChange={(e) => setMhsSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="flat">
        <TabsList>
          <TabsTrigger value="flat">Daftar Penempatan</TabsTrigger>
          <TabsTrigger value="grouped">Per Kelas</TabsTrigger>
        </TabsList>

        {/* Flat list */}
        <TabsContent value="flat">
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
              ) : filteredList.length === 0 ? (
                <EmptyState icon={UserCheck} title="Belum ada penempatan" description="Gunakan form di atas untuk menempatkan mahasiswa ke kelas" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mahasiswa</TableHead>
                      <TableHead>NIM</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Prodi</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredList.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.mahasiswa?.name}</TableCell>
                        <TableCell className="text-muted-foreground">{a.mahasiswa?.nim || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{a.kelas?.name}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.kelas?.prodi ? `${a.kelas.prodi.code} · ${a.kelas.prodi.name}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setUnassign({
                              mahasiswaId: a.mahasiswaId,
                              kelasId: a.kelasId,
                              mhsName: a.mahasiswa?.name || '',
                              kelasName: a.kelas?.name || '',
                            })}
                            title="Keluarkan dari kelas"
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
        </TabsContent>

        {/* Grouped by kelas */}
        <TabsContent value="grouped">
          {error ? (
            <Card>
              <CardContent className="p-6 flex items-center gap-3 text-destructive">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </CardContent>
            </Card>
          ) : loading ? (
            <Card>
              <CardContent className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : grouped.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState icon={School} title="Belum ada kelas" description="Tambahkan kelas terlebih dahulu di menu Kelas" />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {grouped.map(({ kelas, mhs }) => {
                const expanded = expandedKelas === kelas.id
                return (
                  <Card key={kelas.id}>
                    <button
                      onClick={() => setExpandedKelas(expanded ? null : kelas.id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-accent/40 transition-colors text-left"
                    >
                      {expanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <School className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{kelas.name}</div>
                        {kelas.prodi && (
                          <div className="text-xs text-muted-foreground">{kelas.prodi.code} · {kelas.prodi.name}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="gap-1">
                        <Users className="w-3 h-3" />
                        {mhs.length} mhs
                      </Badge>
                    </button>
                    {expanded && (
                      <CardContent className="p-0 border-t">
                        {mhs.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            Belum ada mahasiswa di kelas ini
                          </div>
                        ) : (
                          <div className="divide-y">
                            {mhs.map((a) => (
                              <div key={a.id} className="flex items-center gap-3 p-3">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{a.mahasiswa?.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {a.mahasiswa?.nim || a.mahasiswa?.email}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost" size="sm"
                                  className="text-destructive hover:text-destructive h-8"
                                  onClick={() => setUnassign({
                                    mahasiswaId: a.mahasiswaId,
                                    kelasId: a.kelasId,
                                    mhsName: a.mahasiswa?.name || '',
                                    kelasName: kelas.name,
                                  })}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Keluarkan
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!unassign} onOpenChange={(o) => { if (!o) setUnassign(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluarkan Mahasiswa?</AlertDialogTitle>
            <AlertDialogDescription>
              Keluarkan <span className="font-medium text-foreground">{unassign?.mhsName}</span> dari kelas{' '}
              <span className="font-medium text-foreground">{unassign?.kelasName}</span>?
              Mahasiswa tidak akan lagi terdaftar di kelas ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnassign} className="bg-destructive text-white hover:bg-destructive/90">
              Keluarkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
