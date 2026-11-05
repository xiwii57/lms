'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatTime, DAYS } from '@/components/lms/shared/format'
import { CalendarDays, AlertCircle, MapPin, Download, FileText } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { generateSchedulePDF } from './schedule-pdf'
import { toast } from 'sonner'

export function MahasiswaJadwal() {
  const { user } = useAuthStore()
  const [data, setData] = useState<{ dosenAjar: any[]; kelas: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/mahasiswa/schedule', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function handleDownloadPDF() {
    if (!data || data.dosenAjar.length === 0) {
      toast.error('Tidak ada jadwal untuk di-download')
      return
    }
    setGenerating(true)
    try {
      const kelasName = data.kelas?.[0]?.name || ''
      generateSchedulePDF(data.dosenAjar, {
        name: user?.name || 'Mahasiswa',
        nim: user?.nim,
        kelas: kelasName,
      })
      toast.success('PDF berhasil didownload')
    } catch (e: any) {
      toast.error('Gagal generate PDF: ' + (e.message || ''))
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
    </div>
  )
  if (error || !data) return (
    <Card><CardContent className="p-6">
      <EmptyState icon={AlertCircle} title="Gagal memuat jadwal" description={error || ''} />
    </CardContent></Card>
  )

  // Group by day
  const byDay: Record<string, any[]> = {}
  data.dosenAjar.forEach((da) => {
    const day = da.scheduleDay
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(da)
  })
  Object.keys(byDay).forEach((day) => {
    byDay[day].sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jadwal Kuliah"
        description="Jadwal mata kuliah Anda"
        action={
          <Button
            onClick={handleDownloadPDF}
            disabled={generating || data.dosenAjar.length === 0}
            className="gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Generate...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PDF
              </>
            )}
          </Button>
        }
      />

      {data.dosenAjar.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState icon={CalendarDays} title="Belum ada jadwal" description="Anda belum terdaftar di kelas manapun" />
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {/* Summary card */}
          <Card className="bg-primary/5 border-primary/30">
            <CardContent className="p-4 flex items-center gap-4">
              <FileText className="w-8 h-8 text-primary flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-sm">Total {data.dosenAjar.length} mata kuliah</div>
                <div className="text-xs text-muted-foreground">
                  {data.kelas?.[0]?.name && `Kelas: ${data.kelas[0].name} · `}
                  {Object.keys(byDay).length} hari aktif
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={generating}>
                <Download className="w-3.5 h-3.5 mr-1" />
                PDF
              </Button>
            </CardContent>
          </Card>

          {DAYS.map((day) => {
            const items = byDay[day] || []
            if (items.length === 0) return null
            return (
              <Card key={day}>
                <CardContent className="p-4 sm:p-5">
                  <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    {day}
                    <Badge variant="outline" className="text-xs">{items.length} mata kuliah</Badge>
                  </h3>
                  <div className="space-y-2">
                    {items.map((da) => (
                      <div
                        key={da.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md bg-accent/40 border border-border/50 gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">{da?.mataKuliah?.name || '-'}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {da?.mataKuliah?.code || '-'} • {da?.mataKuliah?.sks || 0} SKS • {da?.kelas?.name || '-'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Dosen: {da?.dosen?.name || '-'}
                            </div>
                        </div>
                        <div className="flex flex-col sm:items-end gap-1">
                          <Badge variant="outline">{da.scheduleTime}</Badge>
                          {da.room && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {da.room}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
