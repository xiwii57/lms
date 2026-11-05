'use client'
import { useEffect, Component } from 'react'
import { useAuthStore, useUIStore, defaultPageForRole } from '@/lib/store'
import { LoginForm } from '@/components/lms/login/login-form'
import { AdminApp } from '@/components/lms/admin'
import { DosenApp } from '@/components/lms/dosen'
import { MahasiswaApp } from '@/components/lms/mahasiswa'
import { OperatorApp } from '@/components/lms/operator'
import { GraduationCap, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Client-side error caught:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Terjadi Kesalahan</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Aplikasi mengalami error. Silakan refresh halaman atau coba login ulang.
              </p>
              {this.state.error && (
                <details className="text-left bg-muted/30 rounded-md p-3 mb-4">
                  <summary className="text-xs font-medium cursor-pointer">Detail Error</summary>
                  <pre className="text-xs mt-2 whitespace-pre-wrap text-destructive">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  try { localStorage.removeItem('lms-auth') } catch {}
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button
                onClick={() => {
                  try { localStorage.clear() } catch {}
                  window.location.href = '/'
                }}
              >
                Login Ulang
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function Home() {
  const { user, loading, fetchSession } = useAuthStore()
  const { setPage } = useUIStore()

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  useEffect(() => {
    if (user) {
      setPage(defaultPageForRole(user.role))
    }
  }, [user, setPage])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center animate-pulse">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div className="text-sm text-muted-foreground">Memuat...</div>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginForm />
  }

  return (
    <ErrorBoundary>
      {user.role === 'ADMIN' && <AdminApp />}
      {user.role === 'DOSEN' && <DosenApp />}
      {user.role === 'MAHASISWA' && <MahasiswaApp />}
      {user.role === 'OPERATOR' && <OperatorApp />}
    </ErrorBoundary>
  )
}