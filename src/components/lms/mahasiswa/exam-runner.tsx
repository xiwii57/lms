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
import { Shield, Clock, Send, CheckCircle, AlertTriangle, Eye, ChevronLeft, Loader2 } from 'lucide-react'
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

      // Request fullscreen (cross-browser)
      await requestFullscreenCrossBrowser()
    } catch (e: any) {
      toast.error(e.message || 'Gagal memulai ujian')
    } finally {
      setStarting(false)
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
  // INTRO PHASE
  // ==========================================================================
  if (phase === 'intro') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={onExit} className="mb-2 -ml-2">
          <ChevronLeft className="w-4 h-4 mr-1" /> Kembali ke Daftar Ujian
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{ujian.title}</CardTitle>
            <div className="text-sm text-muted-foreground">
              {ujian.dosenAjar?.mataKuliah?.name} • {ujian.dosenAjar?.kelas?.name} • {ujian.type} •{' '}
              {ujian.durationMin} menit
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
                <h4 className="font-semibold mb-1 text-amber-900 dark:text-amber-200">Instruksi</h4>
                <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-line">
                  {ujian.instruction}
                </p>
              </div>
            )}
            <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-destructive" />
                Aturan Ujian
              </h4>
              <ul className="text-sm space-y-1 text-destructive/90 list-disc list-inside">
                <li>Dilarang <strong>buka tab baru</strong> — auto-submit langsung</li>
                <li>Dilarang <strong>keluar browser</strong> — auto-submit langsung</li>
                <li>Dilarang <strong>split screen</strong> — auto-submit langsung</li>
                <li>Dilarang <strong>rotate ke landscape</strong> (HP) — auto-submit</li>
                <li>Dilarang <strong>keluar fullscreen</strong> — auto-submit</li>
                <li>Dilarang <strong>overlay app lain</strong> — auto-submit</li>
                <li>Soal <strong>diacak</strong> — setiap mahasiswa dapat urutan berbeda</li>
                <li>Jawaban <strong>tersimpan otomatis</strong> setiap 5 detik</li>
                <li>Mode <strong>fullscreen</strong> akan diaktifkan</li>
                <li>Klik kanan, copy-paste, dan shortcut diblokir</li>
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onExit} disabled={starting}>
                Batal
              </Button>
              <Button onClick={handleStart} size="lg" disabled={starting}>
                {starting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Menyiapkan Ujian...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Mulai Ujian
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
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
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-card border-b shadow-sm">
        <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Shield className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{ujian.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {ujian.dosenAjar?.mataKuliah?.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{ujian.type}</Badge>
            <div
              className={`flex items-center gap-1.5 font-mono font-bold ${isLowTime ? 'text-destructive' : ''}`}
            >
              <Clock className="w-4 h-4" />
              <span className="text-lg">{timeStr}</span>
            </div>
            <Button size="sm" variant="destructive" onClick={() => setShowSubmitConfirm(true)}>
              <Send className="w-3.5 h-3.5" /> Submit
            </Button>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 rounded-none" />
      </div>

      {/* Violation warning */}
      {violationWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md">
          <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm font-medium">{violationWarning}</div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 pb-32">
        {/* Progress — lebih friendly mobile */}
        <div className="mb-4 p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center justify-between text-sm mb-2">
            <div className="font-medium">
              Soal <span className="text-primary">{currentSoalIdx + 1}</span>
              <span className="text-muted-foreground"> dari {soal.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Terjawab: <span className="ml-1 font-bold text-emerald-600">{answeredCount}</span>
                <span className="text-muted-foreground">/{soal.length}</span>
              </Badge>
              <Badge variant="secondary" className="text-xs">{currentSoal?.points || 0} poin</Badge>
            </div>
          </div>
          <Progress value={(answeredCount / soal.length) * 100} className="h-2" />
        </div>

        {/* Question */}
        {currentSoal && (
          <Card className="border-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-start gap-2 leading-relaxed">
                <Badge variant="secondary" className="mt-1 flex-shrink-0">
                  #{currentSoal.order}
                </Badge>
                <span>{currentSoal.pertanyaan}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setCurrentSoalIdx(Math.max(0, currentSoalIdx - 1))}
            disabled={currentSoalIdx === 0}
            className="h-12 text-base"
          >
            <ChevronLeft className="w-5 h-5" />
            Sebelumnya
          </Button>
        </div>

        {/* Nomor soal — scrollable horizontal di mobile */}
        <div className="mt-4">
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
              <strong>Anti-Cheating Aktif:</strong> Jangan pindah tab, keluar browser, split screen,
              rotate landscape, atau buka app lain. Pelanggaran akan menyebabkan auto-submit otomatis.
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
                Setelah di-submit, Anda tidak dapat mengubah jawaban lagi.
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
