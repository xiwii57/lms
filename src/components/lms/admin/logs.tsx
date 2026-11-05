'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  History, RefreshCw, AlertCircle, Info, TriangleAlert, OctagonAlert,
  Search,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageHeader, EmptyState } from '@/components/lms/shared/ui'
import { formatDateTime } from '@/components/lms/shared/format'
import { toast } from 'sonner'

interface LogRow {
  id: string
  action: string
  detail: string
  level: string
  createdAt: string
  user?: { id: string; name: string; email: string; role: string } | null
}

function levelBadge(level: string) {
  switch (level) {
    case 'ERROR':
      return { variant: 'destructive' as const, icon: OctagonAlert, label: level }
    case 'WARN':
      return { variant: 'secondary' as const, icon: TriangleAlert, label: level }
    default:
      return { variant: 'outline' as const, icon: Info, label: level }
  }
}

export function AdminLogs() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [levelFilter, setLevelFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const params = new URLSearchParams({ limit: '100' })
      if (levelFilter !== 'ALL') params.set('level', levelFilter)
      if (actionFilter.trim()) params.set('action', actionFilter.trim())
      const res = await fetch(`/api/admin/logs?${params.toString()}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat')
      setLogs(json.logs || [])
      setTotal(json.total || 0)
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
      if (!loading) toast.error(e.message || 'Gagal memuat log')
    } finally {
      setLoading(false)
    }
  }, [levelFilter, actionFilter])

  // Initial + on filter change
  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      load()
    }, 10000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoRefresh, load])

  return (
    <div>
      <PageHeader
        title="Log History"
        description={`Total ${total} catatan aktivitas sistem`}
        action={
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari action... (contoh: LOGIN, CREATE_USER)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Level</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
            <SelectItem value="WARN">Warning</SelectItem>
            <SelectItem value="ERROR">Error</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-card">
          <Switch
            id="auto-refresh"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
          <Label htmlFor="auto-refresh" className="text-xs cursor-pointer whitespace-nowrap">
            Auto-refresh 10s
          </Label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
              <Button variant="outline" size="sm" onClick={load} className="ml-auto">Coba Lagi</Button>
            </div>
          ) : loading && logs.length === 0 ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState icon={History} title="Tidak ada log" description="Belum ada aktivitas yang tercatat dengan filter saat ini" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const lb = levelBadge(log.level)
                  const Icon = lb.icon
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        {log.user ? (
                          <div>
                            <div className="text-sm font-medium">{log.user.name}</div>
                            <div className="text-xs text-muted-foreground">{log.user.email}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">System</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate" title={log.detail}>
                        {log.detail}
                      </TableCell>
                      <TableCell>
                        <Badge variant={lb.variant} className="gap-1">
                          <Icon className="w-3 h-3" />
                          {lb.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Menampilkan {logs.length} dari {total} log
          {autoRefresh && ' · Auto-refresh aktif (10s)'}
        </p>
      )}
    </div>
  )
}
