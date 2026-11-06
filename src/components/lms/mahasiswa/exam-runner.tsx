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
import { Shield, Clock, Send, CheckCircle, AlertTriangle, Eye, ChevronLeft } from 'lucide-react'
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

export function ExamRunner({ ujian, onExit }: ExamRunnerProps) {
  const [phase, setPhase] = useState<Phase>('intro')
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
  const handleViolation = useCallback(async (v: any) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setViolationWarning(v.detail)
    setPhase('submitting')
    setSubmitReason(v.detail)
    toast.error(`PELANGGARAN: ${v.detail}`)

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

    try {
      await fetch('/api/mahasiswa/ujian/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ujianId: ujian.id, reason: v.detail, violationType: v.type }),
      })
    } catch {}

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

  // Anti-cheat: tab switch + window blur + keyboard shortcuts (NO camera/screen)
  useAntiCheat({
    enabled: phase === 'running',
    onViolation: handleViolation,
    requireCamera: false,
    requireScreenShare: false,
    cameraStream: null,
    screenStream: null,
  })

  // Start exam
  async function handleStart() {
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

      // Request fullscreen
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen()
        }
      } catch {}
    } catch (e: any) {
      toast.error(e.message || 'Gagal memulai ujian')
    }
  }

  // Manual submit
  const handleSubmitFinal = useCallback(async (reason?: string) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setPhase('submitting')
    setSubmitReason(reason || null)

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

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }

    setTimeout(() => setPhase('submitted'), 1500)
  }, [answers, ujian.id])

  // Timer
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

  // Auto-save answer
  const saveAnswer = useCallback((soalId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [soalId]: answer }))
    if (saveTimerRef.current[soalId]) {
      clearTimeout(saveTimerRef.current[soalId])
    }
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  // ===== INTRO PHASE =====
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
                <h4 className="font-semibold mb-1 text-amber-900 dark:text-amber-200">Instruksi</h4>
                <p className="text-sm text-amber-800 dark:text-amber-300">{ujian.instruction}</p>
              </div>
            )}
            <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-destructive" />
                Aturan Ujian
              </h4>
              <ul className="text-sm space-y-1 text-destructive/90 list-disc list-inside">
                <li>Dilarang <strong>buka tab baru</strong> — jawaban otomatis ter-submit</li>
                <li>Dilarang <strong>keluar browser</strong> — jawaban otomatis ter-submit</li>
                <li>Dilarang <strong>mengecilkan/split layar</strong> — jawaban otomatis ter-submit</li>
                <li>Soal <strong>diacak</strong> — setiap mahasiswa dapat urutan berbeda</li>
                <li>Jawaban <strong>tersimpan otomatis</strong> saat mengetik</li>
                <li>Mode <strong>fullscreen</strong> akan diaktifkan</li>
                <li>Klik kanan dan shortcut (Ctrl+T/N/W, F5) diblokir</li>
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onExit}>Batal</Button>
              <Button onClick={handleStart} size="lg">
                <Shield className="w-4 h-4 mr-2" />
                Mulai Ujian
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ===== SUBMITTING PHASE =====
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

  // ===== SUBMITTED PHASE =====
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

  // ===== RUNNING PHASE =====
  const totalSeconds = ujian.durationMin * 60
  const progressPercent = ((totalSeconds - timeLeft) / totalSeconds) * 100
  const hours = Math.floor(timeLeft / 3600)
  const minutes = Math.floor((timeLeft % 3600) / 60)
  const seconds = timeLeft % 60
  const timeStr = `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
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
        {/* Progress */}
        <div className="mb-4 flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Soal {currentSoalIdx + 1} dari {soal.length} • Terjawab: {answeredCount}/{soal.length}
          </div>
          <Badge variant="outline">{currentSoal?.points || 0} poin</Badge>
        </div>

        {/* Question */}
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
          <Button variant="outline" onClick={() => setCurrentSoalIdx(Math.max(0, currentSoalIdx - 1))} disabled={currentSoalIdx === 0}>
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
              <strong>Anti-Cheating Aktif:</strong> Jangan pindah tab, keluar browser, atau mengecilkan layar. Pelanggaran akan menyebabkan auto-submit otomatis.
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
