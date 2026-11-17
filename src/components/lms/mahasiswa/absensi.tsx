'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDateTime, formatDate, statusBadge, bytesToSize } from '@/components/lms/shared/format'
import {
  ClipboardCheck, AlertCircle, CheckCircle, Clock, Calendar, FileUp, FileText,
  Download, Timer, QrCode, ScanLine, Camera, CameraOff, SwitchCamera, RefreshCw, X,
} from 'lucide-react'
import { toast } from 'sonner'
import jsQR from 'jsqr'

interface Absensi {
  id: string
  tanggal: string
  pertemuan: number
  topic: string | null
  status: string
  openedAt: string | null
  closedAt: string | null
  expiresAt: string | null
  durationMin: number | null
  dosenAjar: {
    mataKuliah: { name: string; code: string }
    kelas: { name: string }
    dosen: { name: string }
  }
  records: {
    id: string
    status: string
    note: string | null
    fileName: string | null
    filePath: string | null
    fileSize: number | null
  }[]
}

type ScanStatus = 'idle' | 'starting' | 'scanning' | 'detected' | 'submitting' | 'success' | 'error'

function timeUntil(dateStr: string): string {
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const diff = target - now
  if (diff < 0) return 'berakhir'
  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}j ${mins}m lagi`
  }
  if (minutes > 0) return `${minutes}m ${seconds}d lagi`
  return `${seconds}d lagi`
}

export function MahasiswaAbsensi() {
  const [absensiList, setAbsensiList] = useState<Absensi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Absensi | null>(null)
  const [status, setStatus] = useState<'IZIN' | 'SAKIT'>('IZIN')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Ref ke absensiList terbaru (untuk akses di polling interval tanpa re-create)
  const absensiListRef = useRef<Absensi[]>([])
  useEffect(() => {
    absensiListRef.current = absensiList
  }, [absensiList])

  // QR Scanner state
  const [qrAbsensi, setQrAbsensi] = useState<Absensi | null>(null)
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [detectedQrData, setDetectedQrData] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Cegah submit duplikat untuk QR yang sama
  const lastSubmittedQrRef = useRef<string | null>(null)

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/mahasiswa/absensi', { credentials: 'include' })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setAbsensiList(d.absensi || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Polling lebih lama (60s) — hanya refresh kalau ada sesi OPEN aktif
    // supaya tidak bebankan server saat semua sesi sudah selesai
    const interval = setInterval(() => {
      const hasOpen = absensiListRef.current.some(
        (a) => a.records.length === 0 && ((a as any).effectiveStatus || a.status) === 'OPEN',
      )
      if (hasOpen) fetchData()
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Cek jumlah kamera yang tersedia
  useEffect(() => {
    async function checkCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter((d) => d.kind === 'videoinput')
        setHasMultipleCameras(videoDevices.length > 1)
      } catch {
        // ignore — fitur switch tetap bisa diandalkan toggle facingMode
      }
    }
    checkCameras()
  }, [])

  // Mulai kamera dengan facingMode tertentu
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    setCameraError(null)
    setScanResult(null)
    setDetectedQrData(null)
    setScanStatus('starting')

    // Hentikan stream sebelumnya jika ada
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true')
        await videoRef.current.play()
        setScanStatus('scanning')
        // Mulai interval scan
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
        scanIntervalRef.current = setInterval(scanQrCode, 200)
      }
    } catch (e: any) {
      let msg = 'Gagal mengakses kamera.'
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg = 'Izin kamera ditolak. Aktifkan izin kamera di browser, atau gunakan opsi Upload Foto QR di bawah.'
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        msg = 'Kamera tidak ditemukan di perangkat ini. Gunakan opsi Upload Foto QR.'
      } else if (e.name === 'NotReadableError') {
        msg = 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.'
      } else if (e.message) {
        msg = `Gagal akses kamera: ${e.message}`
      }
      setCameraError(msg)
      setScanStatus('error')
      toast.error(msg, { duration: 6000 })
    }
  }, [])

  // Hentikan kamera & scan
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanStatus('idle')
    setDetectedQrData(null)
  }, [])

  // Toggle kamera depan/belakang
  const switchCamera = useCallback(async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    toast.info(`Beralih ke kamera ${next === 'environment' ? 'belakang' : 'depan'}...`)
    await startCamera(next)
  }, [facingMode, startCamera])

  // Scan QR dari frame video
  const scanQrCode = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    if (scanStatus !== 'scanning') return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return
    if (!video.videoWidth || !video.videoHeight) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    })

    if (code && code.data) {
      // Cegah duplikat: jika QR yang sama sudah dikirim dalam sesi ini, abaikan
      if (lastSubmittedQrRef.current === code.data) return
      lastSubmittedQrRef.current = code.data
      setDetectedQrData(code.data)
      setScanStatus('detected')
      // Hentikan scan, biarkan kamera tetap aktif sampai submit selesai
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current)
        scanIntervalRef.current = null
      }
      toast.success('QR terdeteksi! Mengirim data kehadiran...', { duration: 3000 })
      submitQrScan(code.data)
    }
  }, [scanStatus])

  // Submit QR hasil scan
  async function submitQrScan(qrData: string) {
    setScanStatus('submitting')
    setScanResult(null)
    try {
      const res = await fetch('/api/mahasiswa/absensi/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ qrData }),
      })
      let d: any
      try {
        d = await res.json()
      } catch {
        d = { error: 'Server error. Coba lagi.' }
      }
      if (!res.ok) {
        const msg = d.error || 'Gagal scan QR. Coba lagi.'
        setScanResult({ success: false, message: msg })
        setScanStatus('error')
        toast.error(msg, { duration: 5000 })
        return
      }
      const successMsg = d.message || 'Kehadiran berhasil! Status: HADIR'
      setScanResult({ success: true, message: successMsg })
      setScanStatus('success')
      toast.success(successMsg, { duration: 4000 })
      fetchData()
      // Tutup dialog otomatis setelah 1.5s
      setTimeout(() => {
        stopCamera()
        setQrAbsensi(null)
        setScanResult(null)
        setDetectedQrData(null)
        lastSubmittedQrRef.current = null
      }, 1500)
    } catch (e: any) {
      const msg = e.message || 'Gagal terhubung ke server. Coba lagi.'
      setScanResult({ success: false, message: msg })
      setScanStatus('error')
      toast.error(msg, { duration: 5000 })
    }
  }

  // Retry submit dengan QR yang sama
  function retrySubmit() {
    if (detectedQrData) {
      setScanResult(null)
      submitQrScan(detectedQrData)
    }
  }

  // Lanjutkan scan (untuk retry manual)
  function resumeScan() {
    setScanResult(null)
    setDetectedQrData(null)
    lastSubmittedQrRef.current = null
    if (streamRef.current && videoRef.current) {
      setScanStatus('scanning')
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = setInterval(scanQrCode, 200)
    } else {
      startCamera(facingMode)
    }
  }

  // Upload QR foto
  async function handleQrPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('File harus berupa gambar (PNG/JPG)')
      return
    }
    setSubmitting(true)
    const toastId = toast.loading('Memproses foto QR...')
    try {
      const img = new Image()
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) {
            toast.error('Gagal memproses gambar', { id: toastId })
            setSubmitting(false)
            return
          }
          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          })
          if (code && code.data) {
            toast.success('QR terdeteksi dari foto! Mengirim...', { id: toastId })
            lastSubmittedQrRef.current = code.data
            await submitQrScan(code.data)
          } else {
            toast.error('QR tidak terdeteksi dari foto. Pastikan foto jelas, QR terlihat penuh, dan tidak blur.', { id: toastId, duration: 5000 })
          }
          URL.revokeObjectURL(img.src)
          setSubmitting(false)
        } catch (err: any) {
          toast.error('Gagal memproses foto: ' + (err.message || 'error'), { id: toastId })
          setSubmitting(false)
        }
      }
      img.onerror = () => {
        toast.error('Gagal memuat foto. File mungkin rusak.', { id: toastId })
        URL.revokeObjectURL(img.src)
        setSubmitting(false)
      }
      img.src = URL.createObjectURL(f)
    } catch (e: any) {
      toast.error(e.message || 'Gagal upload', { id: toastId })
      setSubmitting(false)
    }
    // Reset input agar bisa upload file yang sama lagi
    e.target.value = ''
  }

  // Buka dialog QR
  function openQrDialog(absen: Absensi | null) {
    if (!absen) {
      toast.error('Tidak ada sesi absen yang aktif. Minta dosen membuka sesi absen.')
      return
    }
    setQrAbsensi(absen)
    setScanResult(null)
    setDetectedQrData(null)
    setCameraError(null)
    setScanStatus('idle')
    lastSubmittedQrRef.current = null
    // Auto-start kamera saat dialog terbuka
    setTimeout(() => startCamera('environment'), 100)
  }

  // Tutup dialog QR
  function closeQrDialog() {
    stopCamera()
    setQrAbsensi(null)
    setScanResult(null)
    setDetectedQrData(null)
    setCameraError(null)
    lastSubmittedQrRef.current = null
  }

  // Cleanup saat unmount
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function handleSubmitIzinSakit() {
    if (!selected) return
    if (status === 'SAKIT' && !file) {
      toast.error('Untuk Sakit, wajib upload surat dokter')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('status', status)
      fd.append('note', note)
      if (file) fd.append('file', file)
      const res = await fetch(`/api/mahasiswa/absensi/${selected.id}/submit`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Gagal submit absen')
        return
      }
      toast.success(`Absen berhasil: ${status}`)
      setSelected(null)
      setNote('')
      setFile(null)
      fetchData()
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
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    )
  }

  if (error) {
    return (
      <Card><CardContent className="p-6">
        <EmptyState icon={AlertCircle} title="Gagal memuat absensi" description={error} />
      </CardContent></Card>
    )
  }

  const now = new Date()
  // Pakai effectiveStatus (computed di server: kalau OPEN tapi expired → EXPIRED)
  const effStatus = (a: Absensi) => (a as any).effectiveStatus || a.status
  const openSessions = absensiList.filter(
    (a) => a.records.length === 0 && effStatus(a) === 'OPEN',
  )
  const alreadyAbsen = absensiList.filter((a) => a.records.length > 0)
  const expiredNoRecord = absensiList.filter(
    (a) =>
      a.records.length === 0 &&
      ['EXPIRED', 'CLOSED'].includes(effStatus(a)),
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Absensi" description="Scan QR untuk absen hadir, atau ajukan izin/sakit" />

      {/* Tombol utama scan QR */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 shadow-sm">
              <QrCode className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Absen via QR Code</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Scan QR code yang ditampilkan dosen di kelas untuk tandai kehadiran (HADIR)
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => openQrDialog(openSessions[0] || null)}
                disabled={openSessions.length === 0}
              >
                <ScanLine className="w-4 h-4 mr-1" />
                {openSessions.length > 0 ? 'Scan QR' : 'Tidak ada sesi aktif'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-4 h-4 mr-1" />
                Upload Foto QR
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleQrPhotoUpload}
              />
            </div>
          </div>
          {openSessions.length === 0 && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Belum ada sesi absen aktif. Minta dosen membuka sesi absen di kelas.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sesi absen aktif */}
      {openSessions.length > 0 && (
        <Card className="border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Sesi Absen Aktif ({openSessions.length})
            </CardTitle>
            <CardDescription>Minta dosen menampilkan QR code, lalu scan untuk absen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {openSessions.map((a) => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md bg-card border">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {a.dosenAjar?.mataKuliah?.name}
                    <Badge variant="outline">Pertemuan {a.pertemuan}</Badge>
                  </div>
                  {a.topic && <div className="text-xs text-muted-foreground mt-0.5">{a.topic}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {a.dosenAjar?.kelas?.name} · Dosen: {a.dosenAjar?.dosen?.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                    <Calendar className="w-3 h-3" />
                    {formatDateTime(a.tanggal)}
                  </div>
                  {a.expiresAt && (
                    <div className="text-xs mt-1 flex items-center gap-1 font-medium text-amber-600">
                      <Timer className="w-3 h-3" />
                      {timeUntil(a.expiresAt)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => openQrDialog(a)}
                  >
                    <ScanLine className="w-4 h-4" />
                    Scan QR
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(a)
                      setStatus('IZIN')
                      setNote('')
                      setFile(null)
                    }}
                  >
                    Izin / Sakit
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Riwayat */}
      {alreadyAbsen.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              Riwayat Absensi ({alreadyAbsen.length})
            </CardTitle>
            <CardDescription>Absensi yang sudah Anda tandai</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alreadyAbsen.map((a) => {
              const rec = a.records[0]
              const sb = statusBadge(rec.status)
              const isQr = rec.note?.includes('QR')
              return (
                <div key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-md bg-muted/30 border">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {a.dosenAjar?.mataKuliah?.name}
                      <Badge variant="outline">Pertemuan {a.pertemuan}</Badge>
                      {isQr && (
                        <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                          <QrCode className="w-2.5 h-2.5 mr-0.5" /> Via QR
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.dosenAjar?.kelas?.name} · {formatDate(a.tanggal)}
                    </div>
                    {rec.note && !isQr && <div className="text-xs text-muted-foreground mt-0.5">Catatan: {rec.note}</div>}
                    {rec.filePath && (
                      <a
                        href={rec.filePath.startsWith('/api') ? rec.filePath : `/api${rec.filePath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                      >
                        <Download className="w-3 h-3" />
                        {rec.fileName} ({bytesToSize(rec.fileSize)})
                      </a>
                    )}
                  </div>
                  <Badge variant={sb.variant}>{sb.label}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Tidak hadir */}
      {expiredNoRecord.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              Tidak Hadir ({expiredNoRecord.length})
            </CardTitle>
            <CardDescription>Sesi absen berakhir tanpa kehadiran Anda — dicatat sebagai Alfa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiredNoRecord.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 border">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {a.dosenAjar?.mataKuliah?.name}
                    <Badge variant="outline">Pertemuan {a.pertemuan}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {a.dosenAjar?.kelas?.name} · {formatDate(a.tanggal)}
                  </div>
                  {a.expiresAt && (
                    <div className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Sesi absen berakhir {formatDateTime(a.expiresAt)}
                    </div>
                  )}
                </div>
                <Badge variant="destructive">Alfa</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {absensiList.length === 0 && (
        <Card><CardContent className="p-6">
          <EmptyState icon={ClipboardCheck} title="Belum ada sesi absen" description="Belum ada dosen yang membuka sesi absen untuk kelas Anda" />
        </CardContent></Card>
      )}

      {/* Dialog QR Scanner */}
      <Dialog
        open={!!qrAbsensi}
        onOpenChange={(o) => { if (!o) closeQrDialog() }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Scan QR Code Absensi
            </DialogTitle>
            <DialogDescription>
              {qrAbsensi && (
                <>
                  <span className="font-medium text-foreground">
                    {qrAbsensi.dosenAjar?.mataKuliah?.name}
                  </span>
                  {' — Pertemuan '}
                  {qrAbsensi.pertemuan}
                  {qrAbsensi.dosenAjar?.kelas?.name && (
                    <span className="block mt-0.5">
                      Kelas: {qrAbsensi.dosenAjar.kelas.name}
                    </span>
                  )}
                  {qrAbsensi.expiresAt && (
                    <span className="flex items-center gap-1 mt-1 text-amber-600 font-medium">
                      <Timer className="w-3 h-3" />
                      {timeUntil(qrAbsensi.expiresAt)}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Area video kamera */}
            <div className="relative w-full aspect-square max-w-xs mx-auto bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />

              {/* Overlay frame scanning */}
              {(scanStatus === 'scanning' || scanStatus === 'submitting') && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-6 sm:inset-8 border-2 border-white/70 rounded-lg">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                  </div>
                </div>
              )}

              {/* Status overlay: idle/loading */}
              {(scanStatus === 'idle' || scanStatus === 'starting') && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-black/60">
                  {scanStatus === 'starting' ? (
                    <>
                      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <div className="text-xs">Menyalakan kamera...</div>
                    </>
                  ) : (
                    <>
                      <Camera className="w-8 h-8 opacity-70" />
                      <div className="text-xs">Menunggu kamera...</div>
                    </>
                  )}
                </div>
              )}

              {/* Status overlay: detected */}
              {scanStatus === 'detected' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-emerald-600/80">
                  <CheckCircle className="w-10 h-10" />
                  <div className="text-sm font-medium">QR Terdeteksi!</div>
                </div>
              )}

              {/* Status overlay: submitting */}
              {scanStatus === 'submitting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-blue-600/70">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <div className="text-sm font-medium">Mengirim data...</div>
                </div>
              )}

              {/* Status overlay: success */}
              {scanStatus === 'success' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-emerald-600">
                  <CheckCircle className="w-12 h-12" />
                  <div className="text-sm font-semibold">Berhasil!</div>
                  <div className="text-xs opacity-90">Anda tercatat HADIR</div>
                </div>
              )}

              {/* Tombol switch kamera */}
              {(scanStatus === 'scanning' || scanStatus === 'starting') && (
                <button
                  onClick={switchCamera}
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors backdrop-blur"
                  title={`Kamera ${facingMode === 'environment' ? 'belakang' : 'depan'} — klik untuk switch`}
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}

              {/* Indikator mode kamera */}
              {scanStatus === 'scanning' && (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/50 text-white text-[10px] backdrop-blur">
                  {facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Error kamera */}
            {cameraError && (
              <Alert variant="destructive">
                <CameraOff className="h-4 w-4" />
                <AlertTitle>Gagal akses kamera</AlertTitle>
                <AlertDescription className="text-xs">
                  {cameraError}
                </AlertDescription>
              </Alert>
            )}

            {/* Hasil submit (sukses/gagal) */}
            {scanResult && (
              <Alert variant={scanResult.success ? 'default' : 'destructive'} className={scanResult.success ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : ''}>
                {scanResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertTitle>{scanResult.success ? 'Berhasil' : 'Gagal'}</AlertTitle>
                <AlertDescription className="text-xs">{scanResult.message}</AlertDescription>
              </Alert>
            )}

            {/* Tombol aksi */}
            <div className="flex gap-2">
              {scanStatus === 'error' && detectedQrData && (
                <>
                  <Button variant="outline" className="flex-1" onClick={retrySubmit}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Coba Kirim Lagi
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={resumeScan}>
                    <ScanLine className="w-4 h-4 mr-1" />
                    Scan Ulang
                  </Button>
                </>
              )}
              {scanStatus === 'error' && !detectedQrData && (
                <Button className="flex-1" onClick={() => startCamera(facingMode)}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Coba Kamera Lagi
                </Button>
              )}
              {(scanStatus === 'scanning' || scanStatus === 'starting' || scanStatus === 'detected') && (
                <Button variant="outline" className="flex-1" onClick={stopCamera}>
                  Stop Scan
                </Button>
              )}
              {(scanStatus === 'scanning' || scanStatus === 'starting') && hasMultipleCameras && (
                <Button variant="outline" className="flex-1" onClick={switchCamera}>
                  <SwitchCamera className="w-4 h-4 mr-1" />
                  Switch Kamera
                </Button>
              )}
              {scanStatus === 'idle' && !cameraError && (
                <Button className="flex-1" onClick={() => startCamera(facingMode)}>
                  <ScanLine className="w-4 h-4 mr-2" />
                  Mulai Scan
                </Button>
              )}
            </div>

            {/* Hint fallback */}
            <div className="text-xs text-center text-muted-foreground pt-1 border-t">
              Kamera bermasalah?{' '}
              <button
                className="text-primary underline font-medium"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload foto QR
              </button>
              {' '}sebagai alternatif
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeQrDialog}>
              <X className="w-4 h-4 mr-1" />
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Izin/Sakit */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajukan Izin / Sakit</DialogTitle>
            <DialogDescription>
              {selected?.dosenAjar?.mataKuliah?.name} — Pertemuan {selected?.pertemuan}
              {selected?.expiresAt && (
                <span className="flex items-center gap-1 mt-1 text-amber-600 font-medium">
                  <Timer className="w-3 h-3" />
                  {timeUntil(selected.expiresAt)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <RadioGroup value={status} onValueChange={(v) => setStatus(v as any)}>
                <div className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="IZIN" id="r-izin" className="mt-0.5" />
                  <label htmlFor="r-izin" className="cursor-pointer flex-1">
                    <div className="font-medium text-sm">Izin</div>
                    <div className="text-xs text-muted-foreground">Tidak hadir dengan izin (bukti WhatsApp/screenshot opsional)</div>
                  </label>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent transition-colors cursor-pointer">
                  <RadioGroupItem value="SAKIT" id="r-sakit" className="mt-0.5" />
                  <label htmlFor="r-sakit" className="cursor-pointer flex-1">
                    <div className="font-medium text-sm">Sakit <span className="text-destructive">*</span></div>
                    <div className="text-xs text-muted-foreground">Wajib upload surat dokter (foto/PDF)</div>
                  </label>
                </div>
              </RadioGroup>
            </div>
            {(status === 'IZIN' || status === 'SAKIT') && (
              <div className="space-y-2">
                <Label>
                  {status === 'SAKIT' ? 'Upload Surat Dokter (Wajib) *' : 'Upload Bukti Izin (opsional)'}
                </Label>
                <div className="border-2 border-dashed border-border rounded-md p-4 text-center hover:border-primary transition-colors cursor-pointer">
                  <input
                    id="absen-file"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        if (f.size > 10 * 1024 * 1024) {
                          toast.error('File terlalu besar (max 10MB)')
                          return
                        }
                        setFile(f)
                        toast.success(`File dipilih: ${f.name}`)
                      }
                    }}
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx"
                  />
                  <label htmlFor="absen-file" className="cursor-pointer flex flex-col items-center gap-2">
                    {file ? (
                      <>
                        <FileText className="w-8 h-8 text-primary" />
                        <div>
                          <div className="font-medium text-sm">{file.name}</div>
                          <div className="text-xs text-muted-foreground">{bytesToSize(file.size)}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <FileUp className="w-8 h-8 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">Klik untuk pilih file</div>
                          <div className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (max 10MB)</div>
                        </div>
                      </>
                    )}
                  </label>
                </div>
                {status === 'SAKIT' && !file && (
                  <p className="text-xs text-destructive">Surat dokter wajib diupload untuk status Sakit</p>
                )}
              </div>
            )}
            {(status === 'IZIN' || status === 'SAKIT') && (
              <div className="space-y-2">
                <Label htmlFor="note">Catatan / Keterangan</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={status === 'SAKIT' ? 'Keterangan sakit...' : 'Alasan izin (mis: izin via WhatsApp dosen)'}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
            <Button onClick={handleSubmitIzinSakit} disabled={submitting || (status === 'SAKIT' && !file)}>
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Kirim
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 