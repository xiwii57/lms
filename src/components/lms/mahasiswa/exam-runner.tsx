'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Shield, Clock, Send, CheckCircle, AlertTriangle, ChevronLeft, Loader2, FileCheck, FileText } from 'lucide-react'
import { toast } from 'sonner'
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

type Phase = 'intro' | 'running' | 'submitting' | 'submitted'

// ==========================================================================
// HELPER: Request fullscreen cross-browser
// ==========================================================================
async function requestFullscreenCrossBrowser(): Promise<void> {
  const el = document.documentElement as any
  const fn =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen ||
    el.mozRequestFullScreen
  if (fn) {
    try {
      await fn.call(el)
    } catch {
      /* user may decline, ignore */
    }
  }
}

// ==========================================================================
// HELPER: Exit fullscreen cross-browser
// ==========================================================================
function exitFullscreenCrossBrowser(): void {
  const d = document as any
  const fn =
    document.exitFullscreen ||
    d.webkitExitFullscreen ||
    d.msExitFullscreen ||
    d.mozCancelFullScreen
  if (fn) {
    try {
      fn.call(document)
    } catch {
      /* ignore */
    }
  }
}

export function ExamRunner({ ujian, onExit }: ExamRunnerProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [starting, setStarting] = useState(false)
  const [soal, setSoal] = useState<Soal[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [session, setSession] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitReason, setSubmitReason] = useState<string | null>(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [currentSoalIdx, setCurrentSoalIdx] = useState(0)
  const [violationWarning, setViolationWarning] = useState<string | null>(null)
  const submittedRef = useRef(false)

  // ==========================================================================
  // AUTO-SAVE BATCH OPTIMASI
  // ==========================================================================
  // Ref ke answers terbaru (untuk akses dalam interval tanpa re-create interval)
  const answersRef = useRef<Record<string, string>>({})
  // Track jawaban yang dirty (berubah sejak save terakhir)
  const dirtyAnswersRef = useRef<Set<string>>(new Set())
  // Track apakah save sedang in-flight
  const savingRef = useRef(false)

  // Update answersRef setiap kali answers berubah
  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  // Batch auto-save setiap 5 detik — kirim hanya jawaban yang berubah
  const flushAutoSave = useCallback(async () => {
    if (savingRef.current) return
    const dirty = dirtyAnswersRef.current
    if (dirty.size === 0) return

    const ujianId = ujian.id
    // Ambil snapshot jawaban dirty, lalu clear set dirty
    const payload = Array.from(dirty).map((soalId) => ({
      soalId,
      answer: answersRef.current[soalId] ?? '',
    }))
    dirty.clear()
    savingRef.current = true

    try {
      await fetch('/api/mahasiswa/ujian/save-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ujianId, answers: payload }),
      })
    } catch {
      // Kalau gagal, kembalikan ke dirty set supaya save di retry
      payload.forEach((p) => dirtyAnswersRef.current.add(p.soalId))
    } finally {
      savingRef.current = false
    }
  }, [ujian.id])

  // Jalankan auto-save setiap 5 detik saat phase = running
  useEffect(() => {
    if (phase !== 'running') return
    const interval = setInterval(flushAutoSave, 5000)
    // Flush saat unload juga
    const handleBeforeUnload = () => flushAutoSave()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Final flush saat exit running phase
      flushAutoSave()
    }
  }, [phase, flushAutoSave])

  // ==========================================================================
  // HANDLE VIOLATION — auto submit dengan inline answers (1 request saja)
  // ==========================================================================
  const handleViolation = useCallback(
    async (v: any) => {
      if (submittedRef.current) return
      submittedRef.current = true
      setViolationWarning(v.detail)
      setPhase('submitting')
      setSubmitReason(v.detail)
      toast.error(`PELANGGARAN: ${v.detail}`)

      // Kumpulkan semua jawaban untuk inline submit
      const allAnswers = Object.entries(answersRef.current).map(([soalId, answer]) => ({
        soalId,
        answer,
      }))

      // 1 request: submit + inline answers
      try {
        await fetch('/api/mahasiswa/ujian/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ujianId: ujian.id,
            reason: v.detail,
            violationType: v.type,
            answers: allAnswers,
          }),
        })
      } catch {
        /* best effort */
      }

      // 1 request: log violation (terpisah supaya submit tidak gagal kalau log error)
      try {
        await fetch('/api/mahasiswa/ujian/violation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ujianId: ujian.id, type: v.type, detail: v.detail }),
        })
      } catch {
        /* ignore */
      }

      exitFullscreenCrossBrowser()
      setTimeout(() => setPhase('submitted'), 2000)
    },
    [ujian.id],
  )

  // ==========================================================================
  // ANTI-CHEAT HOOK (cross-browser, Android 7+, iOS)
  // ==========================================================================
  useAntiCheat({
    enabled: phase === 'running',
    onViolation: handleViolation,
    detectSplitScreen: true,
    enforceFullscreen: true,
  })

  // ==========================================================================
  // START EXAM
  // ==========================================================================
  async function handleStart() {
    if (starting) return // cegah double-click
    setStarting(true)
    try {
      // Request fullscreen SEBELUM fetch & setPhase('running') — supaya
      // browser sempat masuk fullscreen sebelum anti-cheat aktif.
      // User gesture (klik tombol Mulai Ujian) masih fresh → browser izinkan.
      await requestFullscreenCrossBrowser()

      const res = await fetch('/api/mahasiswa/ujian/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ujianId: ujian.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Gagal memulai ujian')
        setStarting(false)
        return
      }
      setSession(data.session)
      setSoal(data.soal)
      const ans: Record<string, string> = {}
      data.soal.forEach((s: Soal) => {
        if (s.existingAnswer) ans[s.id] = s.existingAnswer
      })
      setAnswers(ans)
      answersRef.current = ans
      dirtyAnswersRef.current.clear()
      setPhase('running')
      toast.success('Ujian dimulai - jangan tinggalkan halaman ini!')

      // Cek apakah fullscreen berhasil masuk — kalau tidak, tampilkan tombol manual
      setTimeout(() => {
        if (!document.fullscreenElement) {
          toast.warning(
            'Klik di mana saja untuk mengaktifkan mode fullscreen. Ujian butuh fullscreen untuk anti-cheat.',
            { duration: 8000 },
          )
        }
      }, 500)
    } catch (e: any) {
      toast.error(e.message || 'Gagal memulai ujian')
    } finally {
      setStarting(false)
    }
  }

  // Tombol manual untuk aktifkan fullscreen kalau auto-request ditolak browser
  async function handleManualFullscreen() {
   try {
      await requestFullscreenCrossBrowser()
      if (document.fullscreenElement) {
        toast.success('Fullscreen aktif')
      } else {
        toast.error('Browser menolak fullscreen. Lanjutkan ujian dengan resiko sendiri.')
      }
    } catch {
      toast.error('Gagal aktifkan fullscreen')
    }
  }

  // ==========================================================================
  // MANUAL SUBMIT (1 request dengan inline answers)
  // ==========================================================================
  const handleSubmitFinal = useCallback(
    async (reason?: string) => {
      if (submittedRef.current) return
      submittedRef.current = true
      setPhase('submitting')
      setSubmitReason(reason || null)

      // Final flush dirty answers dulu (best effort)
      await flushAutoSave()

      // Kumpulkan semua jawaban untuk inline submit
      const allAnswers = Object.entries(answersRef.current).map(([soalId, answer]) => ({
        soalId,
        answer,
      }))

      try {
        const res = await fetch('/api/mahasiswa/ujian/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ujianId: ujian.id,
            reason,
            answers: allAnswers,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || 'Gagal submit')
        } else {
          toast.success('Ujian berhasil di-submit')
        }
      } catch (e: any) {
        toast.error(e.message || 'Gagal submit')
      }

      exitFullscreenCrossBrowser()
      setTimeout(() => setPhase('submitted'), 1500)
    },
    [ujian.id, flushAutoSave],
  )

  // ==========================================================================
  // TIMER
  // ==========================================================================
  useEffect(() => {
    if (phase !== 'running' || !session) return
    const updateTimer = () => {
      const endTime = new Date(session.endTime).getTime()
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !submittedRef.current) {
        handleSubmitFinal('Waktu ujian habis')
      }
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [phase, session, handleSubmitFinal])

  // ==========================================================================
  // SAVE ANSWER (local only — dirty flag, actual save via batch interval)
  // ==========================================================================
  const saveAnswer = useCallback((soalId: string, answer: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [soalId]: answer }
      answersRef.current = next
      return next
    })
    dirtyAnswersRef.current.add(soalId)
  }, [])

  // ==========================================================================
  // CLEANUP
  // ==========================================================================
  useEffect(() => {
    return () => {
      exitFullscreenCrossBrowser()
    }
  }, [])

  // ==========================================================================
  // INTRO PHASE — clean & friendly
  // ==========================================================================
  if (phase === 'intro') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Back button — minimalis */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onExit}
          className="mb-4 -ml-2 text-muted-foreground"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Kembali
        </Button>

        {/* Hero — judul + info singkat */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
            <FileCheck className="w-3.5 h-3.5" />
            {ujian.type}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{ujian.title}</h1>
          <div className="text-sm text-muted-foreground">
            {ujian.dosenAjar?.mataKuliah?.name} · {ujian.dosenAjar?.kelas?.name}
          </div>
        </div>

        {/* Info cards — grid 3 kolom di desktop */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="rounded-lg border bg-card p-3 text-center">
            <Clock className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
            <div className="text-xs text-muted-foreground">Durasi</div>
            <div className="text-sm font-semibold">{ujian.durationMin} mnt</div>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <FileText className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
            <div className="text-xs text-muted-foreground">Tipe</div>
            <div className="text-sm font-semibold">{ujian.type}</div>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <Shield className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
            <div className="text-xs text-muted-foreground">Anti-Cheat</div>
            <div className="text-sm font-semibold text-emerald-600">Aktif</div>
          </div>
        </div>

        {/* Deskripsi singkat */}
        {ujian.description && (
          <div className="mb-4 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
            {ujian.description}
          </div>
        )}

        {/* Instruksi — collapsible */}
        {ujian.instruction && (
          <details className="mb-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20">
            <summary className="cursor-pointer p-3 text-sm font-medium text-amber-900 dark:text-amber-200 select-none">
              📋 Petunjuk pengerjaan (klik untuk lihat)
            </summary>
            <div className="px-3 pb-3 text-sm text-amber-800 dark:text-amber-300 whitespace-pre-line">
              {ujian.instruction}
            </div>
          </details>
        )}

        {/* Aturan — compact, gunakan icons */}
        <div className="mb-6 p-4 rounded-lg border-2 border-destructive/20 bg-destructive/5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-destructive" />
            <h3 className="font-semibold text-sm text-destructive">Aturan Anti-Cheat</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-destructive/80">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              Buka tab baru → auto-submit
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              Split screen → auto-submit
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              Keluar browser → auto-submit
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              Keluar fullscreen → auto-submit
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              Rotate landscape → auto-submit
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              Copy-paste diblokir
            </div>
          </div>
        </div>

        {/* CTA — tombol besar di tengah */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleStart}
            size="lg"
            disabled={starting}
            className="w-full h-14 text-base font-semibold"
          >
            {starting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Menyiapkan Ujian...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5 mr-2" />
                Mulai Ujian Sekarang
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={onExit} disabled={starting} className="text-muted-foreground">
            Batal
          </Button>
        </div>
      </div>
    )
  }

  // ==========================================================================
  // SUBMITTING PHASE
  // ==========================================================================
  if (phase === 'submitting') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="text-lg font-semibold">Sedang menyimpan jawaban...</div>
        {submitReason && (
          <div className="text-sm text-destructive max-w-md text-center">{submitReason}</div>
        )}
      </div>
    )
  }

  // ==========================================================================
  // SUBMITTED PHASE
  // ==========================================================================
  if (phase === 'submitted') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <div className="text-2xl font-bold">Ujian Selesai</div>
        <div className="text-muted-foreground max-w-md">
          Jawaban Anda telah tersimpan.
          {submitReason && submitReason !== 'Waktu ujian habis' && (
            <div className="mt-2 text-destructive">Auto-submit karena: {submitReason}</div>
          )}
        </div>
        <Button onClick={onExit}>Kembali ke Daftar Ujian</Button>
      </div>
    )
  }

  // ==========================================================================
  // RUNNING PHASE
  // ==========================================================================
  const totalSeconds = ujian.durationMin * 60
  const progressPercent = ((totalSeconds - timeLeft) / totalSeconds) * 100
  const hours = Math.floor(timeLeft / 3600)
  const minutes = Math.floor((timeLeft % 3600) / 60)
  const seconds = timeLeft % 60
  const timeStr = `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`
  const isLowTime = timeLeft < 300

  const currentSoal = soal[currentSoalIdx]
  const answeredCount = Object.values(answers).filter((a) => a && a.trim()).length

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto">
      {/* Top bar — compact */}
      <div className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-xs sm:text-sm truncate">{ujian.title}</div>
              <div className="text-[10px] text-muted-foreground truncate hidden sm:block">
                {ujian.dosenAjar?.mataKuliah?.name}
              </div>
            </div>
          </div>
          {/* Timer — prominent di top bar */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono font-bold text-sm sm:text-base ${
              isLowTime
                ? 'bg-destructive text-destructive-foreground animate-pulse'
                : 'bg-primary/10 text-primary'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{timeStr}</span>
          </div>
        </div>
        {/* Progress bar waktu — tipis */}
        <Progress value={progressPercent} className="h-0.5 rounded-none" />
      </div>

      {/* Warning kalau fullscreen belum aktif — tampilkan tombol manual */}
      {!document.fullscreenElement && (
        <div className="sticky top-[44px] z-20 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-3 py-2">
          <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto">
            <div className="text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Fullscreen belum aktif. Aktifkan untuk keamanan ujian.
            </div>
            <Button size="sm" variant="outline" onClick={handleManualFullscreen} className="h-7 text-xs">
              Aktifkan
            </Button>
          </div>
        </div>
      )}

      {/* Violation warning */}
      {violationWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[90%]">
          <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm font-medium">{violationWarning}</div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-32">
        {/* Progress jawaban — compact */}
        <div className="mb-4 flex items-center justify-between text-xs">
          <div className="font-medium">
            Soal <span className="text-primary text-base font-bold">{currentSoalIdx + 1}</span>
            <span className="text-muted-foreground">/{soal.length}</span>
          </div>
          <div className="text-muted-foreground">
            Terjawab <span className="text-emerald-600 font-bold">{answeredCount}</span>
            /{soal.length}
          </div>
        </div>

        {/* Question card */}
        {currentSoal && (
          <Card className="border-2 mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-start gap-2 leading-relaxed">
                <Badge variant="secondary" className="mt-1 flex-shrink-0 text-xs">
                  #{currentSoal.order}
                </Badge>
                <span>{currentSoal.pertanyaan}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentSoal.type === 'MULTIPLE_CHOICE' && currentSoal.options ? (
                <RadioGroup
                  value={answers[currentSoal.id] || ''}
                  onValueChange={(v) => saveAnswer(currentSoal.id, v)}
                  className="space-y-2"
                >
                  {currentSoal.options.map((opt, idx) => {
                    const letter = String.fromCharCode(65 + idx)
                    const isSelected = answers[currentSoal.id] === letter
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 p-3 sm:p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50 hover:bg-accent/50'
                        }`}
                      >
                        <RadioGroupItem
                          value={letter}
                          id={`${currentSoal.id}-${idx}`}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`${currentSoal.id}-${idx}`}
                          className="cursor-pointer flex-1 text-sm sm:text-base leading-relaxed"
                        >
                          <span className="font-bold mr-2 text-primary">{letter}.</span>
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
                    placeholder="Tulis jawaban Anda di sini..."
                    rows={8}
                    className="resize-y text-sm sm:text-base"
                  />
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Jawaban tersimpan otomatis setiap 5 detik
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation — tombol besar friendly mobile */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setCurrentSoalIdx(Math.max(0, currentSoalIdx - 1))}
            disabled={currentSoalIdx === 0}
            className="h-12 text-sm sm:text-base"
          >
            <ChevronLeft className="w-5 h-5" />
            Sebelumnya
          </Button>
          {currentSoalIdx === soal.length - 1 ? (
            <Button variant="destructive" size="lg" onClick={() => setShowSubmitConfirm(true)} className="h-12 text-sm sm:text-base">
              <Send className="w-5 h-5" />
              Submit Ujian
            </Button>
          ) : (
            <Button size="lg" onClick={() => setCurrentSoalIdx(Math.min(soal.length - 1, currentSoalIdx + 1))} className="h-12 text-sm sm:text-base">
              Selanjutnya
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </Button>
          )}
        </div>

        {/* Nomor soal — scrollable horizontal di mobile */}
        <div className="mt-4 mb-6">
          <div className="text-xs text-muted-foreground mb-2">Loncat ke soal:</div>
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {soal.map((s, i) => {
              const answered = answers[s.id] && answers[s.id].trim()
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSoalIdx(i)}
                  className={`flex-shrink-0 w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                    i === currentSoalIdx
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                      : answered
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 hover:bg-emerald-200'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sticky bottom bar — tombol submit cepat untuk akses cepat */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-card/95 backdrop-blur border-t px-3 py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {answeredCount} dari {soal.length} terjawab
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowSubmitConfirm(true)}
            className="h-9"
          >
            <Send className="w-3.5 h-3.5" />
            Submit
          </Button>
        </div>
      </div>

      {/* Submit confirmation — lebih friendly */}
      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-destructive" />
              Submit Ujian?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Anda telah menjawab <strong>{answeredCount}</strong> dari <strong>{soal.length}</strong> soal.
              </span>
              {answeredCount < soal.length && (
                <span className="block p-2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs">
                  ⚠ Masih ada {soal.length - answeredCount} soal belum dijawab.
                </span>
              )}
              <span className="block text-xs text-muted-foreground">
                Setelah submit, jawaban tidak bisa diubah lagi.
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
