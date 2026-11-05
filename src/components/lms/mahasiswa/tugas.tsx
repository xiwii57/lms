'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDate, formatDateTime, timeUntil, bytesToSize } from '@/components/lms/shared/format'
import { FileText, Upload, AlertCircle, CheckCircle, Clock, FileUp, Download } from 'lucide-react'
import { toast } from 'sonner'

interface Tugas {
  id: string
  title: string
  description: string
  deadline: string
  fileName?: string | null
  filePath?: string | null
  fileSize?: number | null
  fileType?: string | null
  dosenAjar: { mataKuliah: { name: string }; kelas: { name: string }; dosen: { name: string } }
  submissions?: any[]
}

export function MahasiswaTugas() {
  const [tugas, setTugas] = useState<Tugas[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Tugas | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function fetchTugas() {
    setLoading(true)
    try {
      const res = await fetch('/api/mahasiswa/tugas', { credentials: 'include' })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setTugas(d.tugas)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTugas()
  }, [])

  async function handleSubmit() {
    if (!selected || !file) {
      toast.error('Pilih file terlebih dahulu')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('tugasId', selected.id)
      fd.append('file', file)
      fd.append('note', note)
      const res = await fetch('/api/mahasiswa/tugas/submit', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success('Tugas berhasil di-submit!')
      setSelected(null)
      setFile(null)
      setNote('')
      fetchTugas()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState icon={AlertCircle} title="Gagal memuat" description={error} />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daftar Tugas"
        description="Tugas mata kuliah yang perlu dikerjakan"
      />

      {tugas.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState icon={FileText} title="Belum ada tugas" description="Tidak ada tugas aktif untuk kelas Anda" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tugas.map((t) => {
            const submission = t.submissions?.[0]
            const isSubmitted = !!submission
            const isLate = !isSubmitted && new Date(t.deadline) < new Date()
            return (
              <Card key={t.id} className="overflow-hidden">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold">{t.title}</h3>
                        {isSubmitted ? (
                          <Badge variant="secondary">
                            <CheckCircle className="w-3 h-3 mr-1" /> Sudah Submit
                          </Badge>
                        ) : isLate ? (
                          <Badge variant="destructive">
                            <Clock className="w-3 h-3 mr-1" /> Terlambat
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="w-3 h-3 mr-1" /> {timeUntil(t.deadline)} lagi
                          </Badge>
                        )}
                        {submission?.nilai != null && (
                          <Badge variant="default">Nilai: {submission.nilai}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{t.description}</p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>{t?.dosenAjar?.mataKuliah?.name || '-'} • {t?.dosenAjar?.kelas?.name || '-'}</div>
                        <div>Dosen: {t?.dosenAjar?.dosen?.name || '-'}</div>
                        <div>Deadline: {formatDateTime(t.deadline)}</div>
                      </div>
                      {isLate && (
                        <div className="mt-2 text-xs text-destructive font-medium">
                          ⚠ Tugas telah berakhir — deadline sudah lewat
                        </div>
                      )}
                      {t.filePath && (
                        <a
                          href={t.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline"
                        >
                          <Download className="w-3 h-3" />
                          {t.fileName} ({bytesToSize(t.fileSize)})
                        </a>
                      )}
                      {submission && (
                        <div className="mt-2 p-2 rounded-md bg-secondary/50 text-xs">
                          <div className="flex items-center gap-1.5 mb-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>Submitted: {formatDateTime(submission.submittedAt)}</span>
                          </div>
                          <div className="text-muted-foreground">
                            File: {submission.fileName} ({bytesToSize(submission.fileSize)})
                          </div>
                          {submission.feedback && (
                            <div className="mt-1 text-muted-foreground">
                              Feedback: {submission.feedback}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        setSelected(t)
                        setFile(null)
                        setNote(submission?.note || '')
                      }}
                        variant={isSubmitted ? 'outline' : 'default'}
                        className="flex-shrink-0"
                        disabled={isLate}
                      >
                      <Upload className="w-4 h-4" />
                      {isLate ? 'Berakhir' : isSubmitted ? 'Update Submission' : 'Submit Tugas'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Submit Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Tugas</DialogTitle>
            <DialogDescription>
              {selected?.title} - Deadline: {selected ? formatDateTime(selected.deadline) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">File Jawaban</Label>
              <div className="border-2 border-dashed border-border rounded-md p-6 text-center hover:border-primary transition-colors cursor-pointer">
                <input
                  id="file"
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setFile(f)
                      toast.success(`File dipilih: ${f.name}`)
                    }
                  }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.md,.png,.jpg,.jpeg"
                />
                <label htmlFor="file" className="cursor-pointer flex flex-col items-center gap-2">
                  <FileUp className="w-8 h-8 text-muted-foreground" />
                  {file ? (
                    <div>
                      <div className="font-medium text-sm">{file.name}</div>
                      <div className="text-xs text-muted-foreground">{bytesToSize(file.size)}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-medium text-sm">Klik untuk pilih file</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        PDF, DOC, DOCX, XLS, ZIP, RAR, TXT (max 50MB)
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Catatan (opsional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Catatan untuk dosen..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={!file || submitting}>
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Mengupload...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
