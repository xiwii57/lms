'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Users, Search, RefreshCw, AlertCircle, Mail, Phone, Hash,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { toast } from 'sonner'

interface MataKuliah { id: string; name: string; code: string }
interface Kelas { id: string; name: string; prodi?: { name: string } | null }
interface DosenAjar {
  id: string
  scheduleDay: string
  scheduleTime: string
  mataKuliah: MataKuliah
  kelas: Kelas
}
interface MahasiswaRow {
  id: string
  mahasiswa: {
    id: string
    name: string
    email: string
    nim: string | null
    phone?: string | null
  }
  kelas: Kelas
}

export function DosenMahasiswa() {
  const [dosenAjarList, setDosenAjarList] = useState<DosenAjar[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedDA, setSelectedDA] = useState<string>('')

  const [mahasiswa, setMahasiswa] = useState<MahasiswaRow[]>([])
  const [mhsLoading, setMhsLoading] = useState(false)
  const [mhsError, setMhsError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Load dosen ajar list once
  const loadList = useCallback(async () => {
    try {
      setListLoading(true)
      setListError(null)
      const res = await fetch('/api/dosen/dosen-ajar', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat data')
      setDosenAjarList(json.dosenAjar || [])
      if (json.dosenAjar?.length > 0 && !selectedDA) {
        setSelectedDA(json.dosenAjar[0].id)
      }
    } catch (e: any) {
      setListError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat data kelas')
    } finally {
      setListLoading(false)
    }
  }, [selectedDA])

  useEffect(() => {
    loadList()
  }, [loadList])

  // Load mahasiswa when selectedDA changes
  const loadMahasiswa = useCallback(async () => {
    if (!selectedDA) {
      setMahasiswa([])
      return
    }
    try {
      setMhsLoading(true)
      setMhsError(null)
      const res = await fetch(`/api/dosen/mahasiswa?dosenAjarId=${encodeURIComponent(selectedDA)}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat mahasiswa')
      setMahasiswa(json.mahasiswa || [])
    } catch (e: any) {
      setMhsError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat mahasiswa')
    } finally {
      setMhsLoading(false)
    }
  }, [selectedDA])

  useEffect(() => {
    loadMahasiswa()
  }, [loadMahasiswa])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return mahasiswa
    return mahasiswa.filter((m) => {
      const name = m.mahasiswa.name.toLowerCase()
      const nim = (m.mahasiswa.nim || '').toLowerCase()
      return name.includes(q) || nim.includes(q)
    })
  }, [mahasiswa, search])

  const selectedDosenAjar = dosenAjarList.find((d) => d.id === selectedDA)

  return (
    <div>
      <PageHeader
        title="Mahasiswa"
        description="Lihat daftar mahasiswa per kelas yang Anda ampu"
      />

      {/* Class selector + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {listLoading ? (
          <Skeleton className="h-9 w-full sm:w-72" />
        ) : (
          <Select value={selectedDA} onValueChange={setSelectedDA}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Pilih kelas / mata kuliah" />
            </SelectTrigger>
            <SelectContent>
              {dosenAjarList.length === 0 ? (
                <SelectItem value="_empty" disabled>Belum ada penugasan</SelectItem>
              ) : (
                dosenAjarList.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.mataKuliah.code} · {d.kelas.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau NIM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            disabled={!selectedDA}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => { loadList(); loadMahasiswa() }}
          disabled={mhsLoading || listLoading}
          title="Muat ulang"
        >
          <RefreshCw className={`w-4 h-4 ${(mhsLoading || listLoading) ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {listError ? (
        <Card className="border-destructive/50">
          <CardContent className="p-6 flex items-center gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{listError}</span>
          </CardContent>
        </Card>
      ) : !selectedDA && !listLoading ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="Belum ada kelas dipilih"
              description="Pilih kelas dan mata kuliah di atas untuk melihat daftar mahasiswa"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {selectedDosenAjar && (
              <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{selectedDosenAjar.mataKuliah.code}</Badge>
                <span className="text-sm font-medium">{selectedDosenAjar.mataKuliah.name}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm text-muted-foreground">{selectedDosenAjar.kelas.name}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm text-muted-foreground">{selectedDosenAjar.scheduleDay} {selectedDosenAjar.scheduleTime}</span>
                <div className="flex-1" />
                <Badge variant="outline">{mahasiswa.length} mahasiswa</Badge>
              </div>
            )}

            {mhsError ? (
              <div className="p-6 flex items-center gap-3 text-destructive">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{mhsError}</span>
              </div>
            ) : mhsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Tidak ada mahasiswa"
                description={search ? 'Coba kata kunci lain' : 'Belum ada mahasiswa di kelas ini'}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">NIM</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telepon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">
                        {m.mahasiswa.nim ? (
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3 text-muted-foreground" />
                            {m.mahasiswa.nim}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="font-medium">{m.mahasiswa.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.mahasiswa.email ? (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {m.mahasiswa.email}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.mahasiswa.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {m.mahasiswa.phone}
                          </span>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
