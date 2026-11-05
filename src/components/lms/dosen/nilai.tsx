'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Award, Search, RefreshCw, AlertCircle, Download, FileText, FileCheck,
  ChevronLeft, User, ClipboardList,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDateTime, formatDate } from '@/components/lms/shared/format'
import { useUIStore } from '@/lib/store'
import { toast } from 'sonner'

interface TugasSubmissionNilai {
  id: string
  fileName: string
  filePath: string
  fileSize?: number | null
  note?: string | null
  nilai: number | null
  feedback?: string | null
  submittedAt: string
  gradedAt?: string | null
  tugas: {
    id: string
    title: string
    dosenAjar: { mataKuliah: { code: string; name: string }; kelas: { name: string } }
  }
  mahasiswa: { id: string; name: string; nim: string | null }
}
interface UjianJawabanNilai {
  id: string
  answer: string
  nilai: number | null
  catatan?: string | null
  createdAt: string
  updatedAt: string
  ujian: {
    id: string
    title: string
    type: string
    dosenAjar: { mataKuliah: { code: string; name: string }; kelas: { name: string } }
  }
  soal: { id: string; pertanyaan: string; points: number }
  mahasiswa: { id: string; name: string; nim: string | null }
}

function fileNameFromPath(p?: string | null): string {
  if (!p) return ''
  const parts = p.split('/')
  return parts[parts.length - 1] || ''
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

function initials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}

// Group ujian jawaban by (ujianId + mahasiswaId)
interface UjianGroup {
  key: string
  ujianId: string
  ujianTitle: string
  ujianType: string
  mataKuliahCode: string
  mataKuliahName: string
  kelasName: string
  mahasiswaId: string
  mahasiswaName: string
  mahasiswaNim: string | null
  jawaban: UjianJawabanNilai[]
  totalNilai: number
  totalPoints: number
  gradedCount: number
  totalCount: number
}

export function DosenNilai() {
  const [tugasSubs, setTugasSubs] = useState<TugasSubmissionNilai[]>([])
  const [ujianJaw, setUjianJaw] = useState<UjianJawabanNilai[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { setPage, setPendingNav } = useUIStore()

  // Navigate to Ujian page → jawaban-detail for specific ujian + mahasiswa
  function openJawabanDetail(ujianId: string, mahasiswaId: string) {
    setPendingNav({ page: 'dosen-ujian', ujianId, mahasiswaId })
    setPage('dosen-ujian')
  }

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dosen/nilai', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat nilai')
      setTugasSubs(json.tugasSubmissions || [])
      setUjianJaw(json.ujianJawaban || [])
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Gagal memuat nilai')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredTugas = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tugasSubs
    return tugasSubs.filter((s) => {
      const name = s.mahasiswa.name.toLowerCase()
      const nim = (s.mahasiswa.nim || '').toLowerCase()
      const title = s.tugas.title.toLowerCase()
      return name.includes(q) || nim.includes(q) || title.includes(q)
    })
  }, [tugasSubs, search])

  // Group ujian jawaban by (ujian + mahasiswa)
  const ujianGroups = useMemo(() => {
    const map = new Map<string, UjianGroup>()
    for (const j of ujianJaw) {
      const key = `${j.ujian.id}|${j.mahasiswa.id}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          ujianId: j.ujian.id,
          ujianTitle: j.ujian.title,
          ujianType: j.ujian.type,
          mataKuliahCode: j.ujian.dosenAjar.mataKuliah.code,
          mataKuliahName: j.ujian.dosenAjar.mataKuliah.name,
          kelasName: j.ujian.dosenAjar.kelas.name,
          mahasiswaId: j.mahasiswa.id,
          mahasiswaName: j.mahasiswa.name,
          mahasiswaNim: j.mahasiswa.nim,
          jawaban: [],
          totalNilai: 0,
          totalPoints: 0,
          gradedCount: 0,
          totalCount: 0,
        })
      }
      const g = map.get(key)!
      g.jawaban.push(j)
      g.totalPoints += j.soal.points
      if (j.nilai != null) {
        g.totalNilai += j.nilai
        g.gradedCount++
      }
      g.totalCount++
    }
    return Array.from(map.values())
  }, [ujianJaw])

  const filteredUjianGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ujianGroups
    return ujianGroups.filter((g) => {
      const name = g.mahasiswaName.toLowerCase()
      const nim = (g.mahasiswaNim || '').toLowerCase()
      const title = g.ujianTitle.toLowerCase()
      return name.includes(q) || nim.includes(q) || title.includes(q)
    })
  }, [ujianGroups, search])

  return (
    <div>
      <PageHeader
        title="Nilai"
        description="Daftar nilai tugas dan ujian — klik mahasiswa pada Nilai Ujian untuk detail per soal"
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </Button>
        }
      />

      {error ? (
        <Card className="border-destructive/50">
          <CardContent className="p-6 flex items-center gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm flex-1">{error}</span>
            <Button variant="outline" size="sm" onClick={load}>Coba Lagi</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search */}
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama / NIM / judul..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Tabs defaultValue="tugas">
            <TabsList className="mb-4">
              <TabsTrigger value="tugas" className="gap-1">
                <FileText className="w-3.5 h-3.5" />
                Nilai Tugas
                <Badge variant="secondary" className="ml-1 text-[10px]">{filteredTugas.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ujian" className="gap-1">
                <FileCheck className="w-3.5 h-3.5" />
                Nilai Ujian
                <Badge variant="secondary" className="ml-1 text-[10px]">{filteredUjianGroups.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Tugas tab - table view (already friendly per user feedback) */}
            <TabsContent value="tugas">
              <Card>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : filteredTugas.length === 0 ? (
                    <EmptyState
                      icon={Award}
                      title="Belum ada nilai tugas"
                      description={search ? 'Coba kata kunci lain' : 'Nilai submission dari halaman Tugas akan muncul di sini'}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mahasiswa</TableHead>
                            <TableHead>Tugas</TableHead>
                            <TableHead>File</TableHead>
                            <TableHead>Nilai</TableHead>
                            <TableHead>Feedback</TableHead>
                            <TableHead>Submit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTugas.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell>
                                <div className="text-sm font-medium">{s.mahasiswa.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{s.mahasiswa.nim || '-'}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">{s.tugas.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {s.tugas.dosenAjar.mataKuliah.code} · {s.tugas.dosenAjar.kelas.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                {s.filePath ? (
                                  <a
                                    href={s.filePath ? `/api${s.filePath}` : '#'}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <Download className="w-3 h-3" />
                                    {truncate(s.fileName, 20)}
                                  </a>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={s.nilai != null ? 'default' : 'outline'}>
                                  {s.nilai != null ? s.nilai : 'Belum'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-48">
                                {truncate(s.feedback || '-', 60)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(s.submittedAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Ujian tab - card list with clickable rows */}
            <TabsContent value="ujian">
              <Card>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : filteredUjianGroups.length === 0 ? (
                    <EmptyState
                      icon={Award}
                      title="Belum ada nilai ujian"
                      description={search ? 'Coba kata kunci lain' : 'Nilai jawaban ujian dari halaman Ujian akan muncul di sini'}
                    />
                  ) : (
                    <div className="divide-y">
                      {filteredUjianGroups.map((g) => {
                        const percent = g.totalPoints > 0 ? Math.round((g.totalNilai / g.totalPoints) * 100) : 0
                        const allGraded = g.gradedCount === g.totalCount && g.totalCount > 0
                        return (
                          <button
                            key={g.key}
                            onClick={() => openJawabanDetail(g.ujianId, g.mahasiswaId)}
                            className="w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left"
                          >
                            <Avatar className="w-10 h-10 flex-shrink-0">
                              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                {initials(g.mahasiswaName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">{g.mahasiswaName}</div>
                              <div className="text-xs text-muted-foreground">
                                {g.mahasiswaNim || 'no NIM'} · {g.mataKuliahCode} {g.mataKuliahName} ({g.kelasName})
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                <Badge variant="outline" className="text-[10px] mr-1">{g.ujianType}</Badge>
                                {g.ujianTitle}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs text-muted-foreground">
                                {g.gradedCount}/{g.totalCount} dinilai
                              </div>
                              {allGraded ? (
                                <Badge variant={percent >= 70 ? 'default' : percent >= 50 ? 'secondary' : 'destructive'} className="text-xs">
                                  {g.totalNilai}/{g.totalPoints} ({percent}%)
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  {g.totalNilai}/{g.totalPoints} poin
                                </Badge>
                              )}
                            </div>
                            <ChevronLeft className="w-5 h-5 text-muted-foreground rotate-180 flex-shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground mt-2 px-2">
                💡 Klik baris untuk membuka detail penilaian per soal
              </p>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
