'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Camera, MonitorUp, Shield, AlertTriangle, Clock, Send, CheckCircle, XCircle, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useMedia } from './use-media'
import { useAntiCheat } from './use-anti-cheat'

interface Soal {
  id: string
  pertanyaan: string
  type: 'ESSAY' | 'MULTIPLE_CHOICE'
  options?: string[] | null
  points: number
  order: number
  existingAnswer?: string
  jawabanId?: string
}

interface Ujian {
  id: string
  title: string
  type: string
  description?: string
  instruction?: string
  durationMin: number
  startTime: string
  endTime: string
  dosenAjar: { mataKuliah: { name: string }; kelas: { name: string } }
}

interface ExamRunnerProps {
  ujian: Ujian
  onExit: () => void
}

type Phase = 'preparation' | 'running' | 'submitting' | 'submitted'

export function ExamRunner({ ujian, onExit }: ExamRunnerProps) {
  const media = useMedia()
  const [phase, setPhase] = useState<Phase>('preparation')
  const [soal, setSoal] = useState<Soal[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [session, setSession] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitReason, setSubmitReason] = useState<string | null>(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [currentSoalIdx, setCurrentSoalIdx] = useState(0)
  const [violationWarning, setViolationWarning] = useState<string | null>(null)
  const saveTimerRef = useRef<Record<string, number>>({})
  const submittedRef = useRef(false)

  // Handle violation - auto submit
  // NOTE: useAntiCheat already prevents multiple violations via its internal firedRef,
  // so this handler can run unconditionally whenever called.
  const handleViolation = useCallback(async (v: any) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setViolationWarning(v.detail)
    setPhase('submitting')
    setSubmitReason(v.detail)
    toast.error(`PELANGGARAN TERDETEKSI: ${v.detail}`)

    // Save all current answers first
    try {
      await Promise.all(
        Object.entries(answers).map(([soalId, answer]) =>
          fetch('/api/mahasiswa/ujian/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ujianId: ujian.id, soalId, answer }),
          }).catch(() => null)
        )
      )
    } catch {}

    // Submit with reason
    try {
      await fetch('/api/mahasiswa/ujian/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ujianId: ujian.id, reason: v.detail, violationType: v.type }),
      })
    } catch {}

    // Also record the violation
    try {
      await fetch('/api/mahasiswa/ujian/violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ujianId: ujian.id, type: v.type, detail: v.detail }),
      })
    } catch {}

    setTimeout(() => setPhase('submitted'), 2000)
  }, [answers, ujian.id])

  // Anti-cheat only active when running
  // Screen share is required only if browser supports it
  useAntiCheat({
    enabled: phase === 'running',
    onViolation: handleViolation,
    requireCamera: true,
    requireScreenShare: media.screenShareSupported,
    cameraStream: media.cameraStream,
    screenStream: media.screenStream,
  })

  // Start exam - only request permissions if not already granted
  async function handleStart() {
    setPhase('preparation')
    // Only request camera if not already ready
    if (!media.cameraReady) {
      await media.startCamera()
    }
    // Only request screen share if not already ready AND supported
    if (media.screenShareSupported && !media.screenReady) {
      await media.startScreenShare()
    }

    // Camera is mandatory
    if (!media.cameraReady) {
      toast.error('Kamera wajib diaktifkan untuk memulai ujian')
      return
    }
    // Screen share is mandatory IF supported; if not supported, allow proceed with warning
    if (media.screenShareSupported && !media.screenReady) {
      toast.error('Screen share wajib diaktifkan. Jika gagal, coba buka di tab baru.')
      return
    }
    if (!media.screenShareSupported) {
      toast.warning('Screen share tidak didukung di environment ini. Ujian dilanjutkan dengan kamera saja. Untuk keamanan penuh, buka di tab baru.')
    }

    // Request notification permission to detect changes
    if ('Notification' in window) {
      try {
        await Notification.requestPermission()
      } catch {}
    }

    // Start exam session via API
    try {
      const res = await fetch('/api/mahasiswa/ujian/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ujianId: ujian.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Gagal memulai ujian')
        setPhase('preparation')
        return
      }
      setSession(data.session)
      setSoal(data.soal)
      const ans: Record<string, string> = {}
      data.soal.forEach((s: Soal) => {
        if (s.existingAnswer) ans[s.id] = s.existingAnswer
      })
      setAnswers(ans)
      setPhase('running')
      toast.success('Ujian dimulai - jangan tinggalkan halaman ini!')
    } catch (e: any) {
      toast.error(e.message || 'Gagal memulai ujian')
      setPhase('preparation')
    }
  }

  // Manual submit - defined as useCallback so it can be referenced by other effects
  const handleSubmitFinal = useCallback(async (reason?: string) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setPhase('submitting')
    setSubmitReason(reason || null)

    // Save all answers first
    try {
      await Promise.all(
        Object.entries(answers).map(([soalId, answer]) =>
          fetch('/api/mahasiswa/ujian/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ujianId: ujian.id, soalId, answer }),
          }).catch(() => null)
        )
      )
    } catch {}

    // Submit
    try {
      await fetch('/api/mahasiswa/ujian/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ujianId: ujian.id, reason }),
      })
      toast.success('Ujian berhasil di-submit')
    } catch (e: any) {
      toast.error(e.message || 'Gagal submit')
    }

    // Stop media
    media.stopAll()

    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }

    setTimeout(() => setPhase('submitted'), 1500)
  }, [answers, ujian.id, media])

  // Timer countdown
  useEffect(() => {
    if (phase !== 'running' || !session) return
    const updateTimer = () => {
      const endTime = new Date(session.endTime).getTime()
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !submittedRef.current) {
        // Auto submit due to timeout
        handleSubmitFinal('Waktu ujian habis')
      }
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [phase, session, handleSubmitFinal])

  // Send camera + screen captures to server every 10 seconds (for operator monitoring)
  useEffect(() => {
    if (phase !== 'running' || !session) return
    const sendCapture = async () => {
      try {
        let cameraFrame: string | null = null
        let screenFrame: string | null = null
        // Capture camera frame
        if (media.cameraStream) {
          const video = document.createElement('video')
          video.srcObject = media.cameraStream
          video.play()
          await new Promise(r => setTimeout(r, 100))
          const canvas = document.createElement('canvas')
          canvas.width = 160
          canvas.height = 120
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0, 160, 120)
            cameraFrame = canvas.toDataURL('image/jpeg', 0.5)
          }
        }
        // Capture screen frame
        if (media.screenStream) {
          const video = document.createElement('video')
          video.srcObject = media.screenStream
          video.play()
          await new Promise(r => setTimeout(r, 100))
          const canvas = document.createElement('canvas')
          canvas.width = 320
          canvas.height = 180
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0, 320, 180)
            screenFrame = canvas.toDataURL('image/jpeg', 0.4)
          }
        }
        await fetch('/api/mahasiswa/ujian/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId: session.id, cameraFrame, screenFrame }),
        })
      } catch {}
    }
    sendCapture()
    const interval = setInterval(sendCapture, 10000)
    return () => clearInterval(interval)
  }, [phase, session, media.cameraStream, media.screenStream])

  // Auto-save answer (debounced)
  const saveAnswer = useCallback((soalId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [soalId]: answer }))
    // Clear previous timer for this soal
    if (saveTimerRef.current[soalId]) {
      clearTimeout(saveTimerRef.current[soalId])
    }
    // Save after 2s of no typing
    saveTimerRef.current[soalId] = window.setTimeout(async () => {
      try {
        await fetch('/api/mahasiswa/ujian/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ujianId: ujian.id, soalId, answer }),
        })
      } catch {}
    }, 2000)
  }, [ujian.id])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      media.stopAll()
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  // ====== RENDER PHASES ======

  if (phase === 'preparation') {
    return <PreparationView ujian={ujian} media={media} onStart={handleStart} onExit={onExit} />
  }

  if (phase === 'submitting') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="text-lg font-semibold">Sedang menyimpan jawaban...</div>
        {submitReason && (
          <div className="text-sm text-destructive max-w-md text-center">
            {submitReason}
          </div>
        )}
      </div>
    )
  }

  if (phase === 'submitted') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <div className="text-2xl font-bold">Ujian Selesai</div>
        <div className="text-muted-foreground max-w-md">
          Jawaban Anda telah tersimpan. {submitReason && submitReason !== 'Waktu ujian habis' && (
            <div className="mt-2 text-destructive">
              Auto-submit karena: {submitReason}
            </div>
          )}
        </div>
        <Button onClick={onExit}>Kembali ke Daftar Ujian</Button>
      </div>
    )
  }

  // ====== RUNNING PHASE ======
  const totalSeconds = ujian.durationMin * 60
  const progressPercent = ((totalSeconds - timeLeft) / totalSeconds) * 100
  const hours = Math.floor(timeLeft / 3600)
  const minutes = Math.floor((timeLeft % 3600) / 60)
  const seconds = timeLeft % 60
  const timeStr = `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const isLowTime = timeLeft < 300 // less than 5 min

  const currentSoal = soal[currentSoalIdx]
  const answeredCount = Object.values(answers).filter((a) => a && a.trim()).length

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto">
      {/* Top bar with timer and media */}
      <div className="sticky top-0 z-30 bg-card border-b shadow-sm">
        <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Shield className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{ujian.title}</div>
              <div className="text-xs text-muted-foreground truncate">{ujian.dosenAjar?.mataKuliah?.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{ujian.type}</Badge>
            <div className={`flex items-center gap-1.5 font-mono font-bold ${isLowTime ? 'text-destructive' : ''}`}>
              <Clock className="w-4 h-4" />
              <span className="text-lg">{timeStr}</span>
            </div>
            <Button size="sm" variant="destructive" onClick={() => setShowSubmitConfirm(true)}>
              <Send className="w-3.5 h-3.5" />
              Submit
            </Button>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 rounded-none" />
      </div>

      {/* Media preview floating panel */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
        {media.cameraStream && (
          <div className="relative w-40 sm:w-48 border-2 border-primary rounded-lg overflow-hidden shadow-lg bg-black">
            <video
              ref={(el) => {
                if (el && media.cameraStream) el.srcObject = media.cameraStream
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-auto"
            />
            <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <Camera className="w-2.5 h-2.5" /> KAMERA
            </div>
          </div>
        )}
        {media.screenStream && (
          <div className="relative w-40 sm:w-48 border-2 border-primary rounded-lg overflow-hidden shadow-lg bg-black">
            <video
              ref={(el) => {
                if (el && media.screenStream) el.srcObject = media.screenStream
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-auto"
            />
            <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <MonitorUp className="w-2.5 h-2.5" /> SCREEN
            </div>
          </div>
        )}
      </div>

      {/* Violation warning toast */}
      {violationWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md">
          <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm font-medium">{violationWarning}</div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 pb-32">
        {/* Progress info */}
        <div className="mb-4 flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Soal {currentSoalIdx + 1} dari {soal.length} • Terjawab: {answeredCount}/{soal.length}
          </div>
          <Badge variant="outline">{currentSoal.points} poin</Badge>
        </div>

        {/* Question card */}
        {currentSoal && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5">#{currentSoal.order}</Badge>
                <span>{currentSoal.pertanyaan}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentSoal.type === 'MULTIPLE_CHOICE' && currentSoal.options ? (
                <RadioGroup
                  value={answers[currentSoal.id] || ''}
                  onValueChange={(v) => saveAnswer(currentSoal.id, v)}
                >
                  {currentSoal.options.map((opt, idx) => {
                    const letter = String.fromCharCode(65 + idx)
                    return (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent transition-colors cursor-pointer">
                        <RadioGroupItem value={letter} id={`${currentSoal.id}-${idx}`} className="mt-0.5" />
                        <Label htmlFor={`${currentSoal.id}-${idx}`} className="cursor-pointer flex-1 text-sm">
                          <span className="font-medium mr-2">{letter}.</span>
                          {opt}
                        </Label>
                      </div>
                    )
                  })}
                </RadioGroup>
              ) : (
                <div>
                  <Textarea
                    value={answers[currentSoal.id] || ''}
                    onChange={(e) => saveAnswer(currentSoal.id, e.target.value)}
                    placeholder="Tulis jawaban Anda di sini... (jawaban tersimpan otomatis)"
                    rows={10}
                    className="resize-y"
                  />
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                    Jawaban tersimpan otomatis saat mengetik
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentSoalIdx(Math.max(0, currentSoalIdx - 1))}
            disabled={currentSoalIdx === 0}
          >
            ← Sebelumnya
          </Button>
          <div className="flex flex-wrap gap-1 max-w-md">
            {soal.map((s, i) => {
              const answered = answers[s.id] && answers[s.id].trim()
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSoalIdx(i)}
                  className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                    i === currentSoalIdx
                      ? 'bg-primary text-primary-foreground'
                      : answered
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          {currentSoalIdx === soal.length - 1 ? (
            <Button variant="destructive" onClick={() => setShowSubmitConfirm(true)}>
              <Send className="w-4 h-4" /> Submit
            </Button>
          ) : (
            <Button onClick={() => setCurrentSoalIdx(Math.min(soal.length - 1, currentSoalIdx + 1))}>
              Selanjutnya →
            </Button>
          )}
        </div>

        {/* Anti-cheat info */}
        <div className="mt-6 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
          <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
            <Eye className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Mode Anti-Cheating Aktif:</strong> Kamera dan screen share sedang dipantau. Jangan pindah tab, keluar browser, atau menerima notifikasi. Pelanggaran akan menyebabkan auto-submit otomatis.
            </div>
          </div>
        </div>
      </div>

      {/* Submit confirmation */}
      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Submit Ujian</AlertDialogTitle>
            <AlertDialogDescription>
              Anda telah menjawab {answeredCount} dari {soal.length} soal.
              {answeredCount < soal.length && (
                <span className="block mt-2 text-destructive">
                  Masih ada {soal.length - answeredCount} soal yang belum dijawab!
                </span>
              )}
              <span className="block mt-2">
                Setelah di-submit, Anda tidak dapat mengubah jawaban lagi (kecuali dibuka kembali oleh dosen).
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleSubmitFinal()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ya, Submit Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ====== PREPARATION VIEW ======
function PreparationView({ ujian, media, onStart, onExit }: { ujian: Ujian; media: ReturnType<typeof useMedia>; onStart: () => void; onExit: () => void }) {
  const [step, setStep] = useState<'intro' | 'permissions'>('intro')
  const [permissionStatus, setPermissionStatus] = useState<{ camera: boolean; screen: boolean; notification: boolean }>({
    camera: false,
    screen: false,
    notification: false,
  })

  async function requestCamera() {
    await media.startCamera()
    setPermissionStatus((s) => ({ ...s, camera: media.cameraReady }))
  }
  async function requestScreen() {
    if (!media.screenShareSupported) {
      // Open in new tab as fallback
      let url = window.location.href
      try {
        if (window.top !== window.self) {
          url = window.top?.location?.href || window.location.href
        }
      } catch {
        url = document.referrer || window.location.href
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    await media.startScreenShare()
    setPermissionStatus((s) => ({ ...s, screen: media.screenReady }))
  }
  async function requestNotification() {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission()
      setPermissionStatus((s) => ({ ...s, notification: perm === 'denied' || perm === 'granted' }))
    } else {
      setPermissionStatus((s) => ({ ...s, notification: true }))
    }
  }

  // allReady: camera + notification required; screen required only if supported
  const allReady = media.cameraReady
    && (!media.screenShareSupported || media.screenReady)
    && permissionStatus.notification

  if (step === 'intro') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{ujian.title}</CardTitle>
            <div className="text-sm text-muted-foreground">
              {ujian.dosenAjar?.mataKuliah?.name} • {ujian.dosenAjar?.kelas?.name} • {ujian.type} • {ujian.durationMin} menit
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {ujian.description && (
              <div>
                <h4 className="font-semibold mb-1">Deskripsi</h4>
                <p className="text-sm text-muted-foreground">{ujian.description}</p>
              </div>
            )}
            {ujian.instruction && (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <h4 className="font-semibold mb-1 text-amber-900 dark:text-amber-200">Instruksi Penting</h4>
                <p className="text-sm text-amber-800 dark:text-amber-300">{ujian.instruction}</p>
              </div>
            )}
            <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Aturan Anti-Cheating (Wajib Dipatuhi)
              </h4>
              <ul className="text-sm space-y-1 text-destructive/90 list-disc list-inside">
                <li>Wajib mengaktifkan <strong>kamera</strong> dan <strong>screen share SELURUH LAYAR</strong> (bukan window/tab)</li>
                <li>Dilarang <strong>buka tab baru</strong> - auto-submit otomatis</li>
                <li>Dilarang <strong>keluar browser</strong> - auto-submit otomatis</li>
                <li>Jika <strong>screen share dihentikan</strong> - jawaban otomatis ter-submit</li>
                <li>Wajib <strong>nonaktifkan notifikasi</strong> - notifikasi masuk = auto-submit</li>
                <li>Wajib menulis jawaban sendiri</li>
                <li>Mode <strong>fullscreen</strong> akan diaktifkan</li>
                <li>Klik kanan dan keyboard shortcut (Ctrl+T/N/W) diblokir</li>
              </ul>
            </div>
            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={onExit}>Batal</Button>
              <Button onClick={() => setStep('permissions')}>Lanjut - Aktifkan Permission</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Permissions step
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Show prominent warning if screen share not supported */}
      {!media.screenShareSupported && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm flex-1">
                <p className="font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Screen Share Tidak Didukung di Preview Ini
                </p>
                <p className="text-amber-800 dark:text-amber-300 text-xs mb-2">
                  Browser/preview Anda tidak mendukung <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">getDisplayMedia</code> API.
                  Ini biasanya karena halaman berjalan di dalam iframe (preview panel) yang membatasi akses screen share.
                </p>
                <p className="text-amber-800 dark:text-amber-300 text-xs mb-2">
                  <strong>Opsi A — Lanjut tanpa screen share:</strong> Anda tetap bisa ujian dengan kamera saja. Anti-cheat kamera, deteksi tab switch, dan auto-submit tetap aktif. Cukup aktifkan kamera + notifikasi di bawah, lalu klik "Mulai Ujian".
                </p>
                <p className="text-amber-800 dark:text-amber-300 text-xs mb-2">
                  <strong>Opsi B — Keamanan penuh:</strong> Buka halaman ini di tab baru (keluar dari iframe). Login ulang sebagai mahasiswa, lalu mulai ujian. Screen share akan berfungsi normal di tab baru.
                </p>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => {
                    let url = window.location.href
                    try {
                      if (window.top !== window.self) {
                        url = window.top?.location?.href || window.location.href
                      }
                    } catch {
                      url = document.referrer || window.location.href
                    }
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }}
                >
                  <MonitorUp className="w-4 h-4 mr-2" />
                  Buka di Tab Baru (Opsi B)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Aktifkan Permission Wajib</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PermissionRow
            icon={Camera}
            title="Izin Kamera"
            description="Kamera wajib aktif selama ujian untuk memantau"
            done={media.cameraReady}
            error={media.cameraError}
            onAction={requestCamera}
            actionLabel="Izinkan Kamera"
            unsupported={!media.cameraSupported}
          />
          <PermissionRow
            icon={MonitorUp}
            title={media.screenShareSupported ? "Izin Screen Share (WAJIB Seluruh Layar)" : "Izin Screen Share (Tidak Didukung di Preview)"}
            description={media.screenShareSupported
              ? "Bagikan SELURUH LAYAR / ENTIRE SCREEN Anda — bukan jendela aplikasi atau tab browser. Saat dialog browser muncul, pilih tab 'Entire Screen' lalu klik Share."
              : "Browser/preview ini tidak mendukung screen share (biasanya karena iframe). Anda tetap bisa ujian dengan kamera saja. Untuk keamanan penuh, buka di tab baru."
            }
            done={media.screenReady || !media.screenShareSupported}
            error={media.screenError}
            onAction={requestScreen}
            actionLabel={media.screenShareSupported ? "Bagikan Layar Penuh" : "Buka di Tab Baru"}
            unsupported={!media.screenShareSupported}
          />
          <PermissionRow
            icon={AlertTriangle}
            title="Nonaktifkan Notifikasi"
            description="Pastikan tidak ada notifikasi yang akan masuk. Kami menyarankan untuk memilih 'Block' atau menutup aplikasi notifikasi"
            done={permissionStatus.notification}
            onAction={requestNotification}
            actionLabel="Atur Notifikasi"
          />

          <div className="flex justify-between gap-3 pt-4">
            <Button variant="outline" onClick={() => setStep('intro')}>Kembali</Button>
            <Button onClick={onStart} disabled={!allReady}>
              {!allReady ? 'Selesaikan semua permission dulu' : 'Mulai Ujian Sekarang'}
            </Button>
          </div>

          {media.cameraStream && (
            <div className="mt-4">
              <Label className="text-xs">Preview Kamera:</Label>
              <video
                ref={(el) => { if (el && media.cameraStream) el.srcObject = media.cameraStream }}
                autoPlay playsInline muted
                className="w-32 h-24 object-cover rounded border"
              />
            </div>
          )}
          {media.screenStream && (
            <div>
              <Label className="text-xs">Preview Screen Share:</Label>
              <video
                ref={(el) => { if (el && media.screenStream) el.srcObject = media.screenStream }}
                autoPlay playsInline muted
                className="w-32 h-24 object-cover rounded border"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PermissionRow({ icon: Icon, title, description, done, error, onAction, actionLabel, unsupported }: {
  icon: any; title: string; description: string; done: boolean; error?: string | null; onAction: () => void; actionLabel: string; unsupported?: boolean
}) {
  // Determine display state: unsupported takes precedence for styling
  const showAsDone = done && !unsupported
  const showAsUnsupported = unsupported
  const showAsPending = !done && !unsupported

  return (
    <div className={`flex items-start gap-3 p-3 rounded-md border ${
      showAsDone ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200' :
      showAsUnsupported ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300' :
      'bg-card'
    }`}>
      <div className={`p-2 rounded-md flex-shrink-0 ${
        showAsDone ? 'bg-emerald-100 text-emerald-700' :
        showAsUnsupported ? 'bg-amber-100 text-amber-700' :
        'bg-muted text-muted-foreground'
      }`}>
        {showAsDone ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm flex items-center gap-2">
          {title}
          {showAsUnsupported && (
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
              Opsional (Tidak Didukung)
            </Badge>
          )}
          {showAsDone && (
            <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
              ✓ Aktif
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        {error && <div className="text-xs text-destructive mt-1 whitespace-pre-wrap">{error}</div>}
      </div>
      {showAsPending && (
        <Button size="sm" variant="outline" onClick={onAction}>{actionLabel}</Button>
      )}
      {showAsUnsupported && (
        <Button
          size="sm"
          variant="outline"
          onClick={onAction}
        >
          <MonitorUp className="w-3.5 h-3.5 mr-1" />
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
