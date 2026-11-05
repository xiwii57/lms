'use client'
import { useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GraduationCap, Shield, BookOpen, Users, LogIn, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const DUMMY_ACCOUNTS = [
  { role: 'Admin', email: 'admin@lms.id', password: 'admin123', icon: Shield, color: 'text-rose-600' },
  { role: 'Dosen', email: 'dosen@lms.id', password: 'dosen123', icon: GraduationCap, color: 'text-emerald-600' },
  { role: 'Mahasiswa 1', email: 'mhs1@lms.id', password: 'mhs123', icon: BookOpen, color: 'text-amber-600' },
  { role: 'Mahasiswa 2', email: 'mhs2@lms.id', password: 'mhs123', icon: BookOpen, color: 'text-amber-600' },
  { role: 'Mahasiswa 3', email: 'mhs3@lms.id', password: 'mhs123', icon: BookOpen, color: 'text-amber-600' },
]

export function LoginForm() {
  const { setUser, fetchSession } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login gagal')
        toast.error(data.error || 'Login gagal')
        return
      }
      toast.success(`Selamat datang, ${data.user.name}!`)
      await fetchSession()
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  function fillDummy(acc: typeof DUMMY_ACCOUNTS[number]) {
    setEmail(acc.email)
    setPassword(acc.password)
    setError(null)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-amber-50 dark:from-emerald-950/30 dark:via-background dark:to-amber-950/30 p-4">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left: Branding */}
        <div className="hidden lg:flex flex-col gap-6 p-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">LMS Ujian Online</h1>
              <p className="text-sm text-muted-foreground">Sistem Manajemen Pembelajaran</p>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-bold leading-tight">
              Ujian Online Aman, <span className="text-primary">Tanpa Conteakan</span>
            </h2>
            <p className="text-muted-foreground">
              Platform pembelajaran terpadu dengan proteksi anti-cheating tingkat lanjut: wajib kamera, screen share, deteksi tab baru, dan auto-submit otomatis saat pelanggaran terdeteksi.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-4">
              <FeatureCard icon={Shield} title="Anti-Cheat" desc="Camera + Screen monitoring" />
              <FeatureCard icon={Users} title="3 Role" desc="Admin, Dosen, Mahasiswa" />
              <FeatureCard icon={BookOpen} title="Lengkap" desc="Tugas, Absensi, Ujian" />
            </div>
          </div>
        </div>

        {/* Right: Login form */}
        <Card className="w-full max-w-md mx-auto shadow-lg">
          <CardHeader className="space-y-1">
            <div className="lg:hidden flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">LMS Ujian Online</CardTitle>
                <CardDescription>Sistem Manajemen Pembelajaran</CardDescription>
              </div>
            </div>
            <CardTitle className="text-2xl">Masuk ke Akun</CardTitle>
            <CardDescription>Masukkan email dan password untuk melanjutkan</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@lms.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Masuk
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <div className="w-full">
              <p className="text-xs text-center text-muted-foreground mb-2">
                Akun Demo (klik untuk auto-fill):
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DUMMY_ACCOUNTS.map((acc) => {
              const Icon = acc.icon
              return (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDummy(acc)}
                  className="flex items-center gap-2 p-2 rounded-md border border-border hover:border-primary hover:bg-accent transition-colors text-left"
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${acc.color}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{acc.role}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{acc.email}</div>
                  </div>
                </button>
              )
            })}
              </div>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-card border border-border">
      <Icon className="w-5 h-5 text-primary" />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </div>
  )
}
