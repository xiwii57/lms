'use client'
// Helper functions for formatting

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export function timeUntil(date: string | Date): string {
  const now = new Date()
  const target = new Date(date)
  const diff = target.getTime() - now.getTime()
  if (diff < 0) return 'Berakhir'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}h ${hours}j`
  if (hours > 0) return `${hours}j ${minutes}m`
  return `${minutes}m`
}

export function bytesToSize(bytes: number | null | undefined): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function statusBadge(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const map: Record<string, { label: string; variant: any }> = {
    OPEN: { label: 'Dibuka', variant: 'default' },
    CLOSED: { label: 'Ditutup', variant: 'secondary' },
    EXPIRED: { label: 'Berakhir', variant: 'destructive' },
    DRAFT: { label: 'Draft', variant: 'outline' },
    PUBLISHED: { label: 'Terbit', variant: 'default' },
    ONGOING: { label: 'Berlangsung', variant: 'default' },
    FINISHED: { label: 'Selesai', variant: 'secondary' },
    HADIR: { label: 'Hadir', variant: 'default' },
    IZIN: { label: 'Izin', variant: 'secondary' },
    SAKIT: { label: 'Sakit', variant: 'secondary' },
    ALFA: { label: 'Alfa', variant: 'destructive' },
    NOT_STARTED: { label: 'Belum Mulai', variant: 'outline' },
    IN_PROGRESS: { label: 'Berlangsung', variant: 'default' },
    SUBMITTED: { label: 'Submitted', variant: 'secondary' },
    AUTO_SUBMITTED: { label: 'Auto-Submit', variant: 'destructive' },
  }
  return map[status] || { label: status, variant: 'outline' }
}

export const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
