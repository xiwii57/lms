'use client'
import { create } from 'zustand'

export type Role = 'ADMIN' | 'DOSEN' | 'MAHASISWA' | 'OPERATOR'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  nip?: string | null
  nim?: string | null
}

interface AuthState {
  user: SessionUser | null
  loading: boolean
  setUser: (user: SessionUser | null) => void
  setLoading: (loading: boolean) => void
  logout: () => Promise<void>
  fetchSession: () => Promise<void>
}

// NOTE: We intentionally do NOT use zustand persist middleware here.
// Session is managed via HTTP-only cookies on the server side.
// The fetchSession() call reads the cookie and sets the user state.
// This avoids SSR hydration mismatches that cause "client-side exception" errors.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    set({ user: null })
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  },
  fetchSession: async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' })
      const data = await res.json()
      set({ user: data.user || null, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
}))

// UI navigation store - simulates routing in SPA
type AdminPage =
  | 'admin-dashboard'
  | 'admin-users'
  | 'admin-prodi'
  | 'admin-kelas'
  | 'admin-mata-kuliah'
  | 'admin-dosen-ajar'
  | 'admin-mahasiswa-kelas'
  | 'admin-logs'
type DosenPage =
  | 'dosen-dashboard'
  | 'dosen-mahasiswa'
  | 'dosen-tugas'
  | 'dosen-absensi'
  | 'dosen-ujian'
  | 'dosen-nilai'
type MahasiswaPage =
  | 'mhs-dashboard'
  | 'mhs-tugas'
  | 'mhs-ujian'
  | 'mhs-jadwal'

interface UIState {
  currentPage: string
  setPage: (page: string) => void
  // optional context id (e.g. for detail views)
  contextId: string | null
  setContextId: (id: string | null) => void
  // pending navigation intent for cross-page deep linking
  // e.g. from Nilai page → jump to Ujian jawaban-detail for a specific ujian+mahasiswa
  pendingNav: { page: string; ujianId?: string; mahasiswaId?: string } | null
  setPendingNav: (nav: { page: string; ujianId?: string; mahasiswaId?: string } | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  currentPage: 'dashboard',
  contextId: null,
  pendingNav: null,
  setPage: (page) => set({ currentPage: page, contextId: null }),
  setContextId: (id) => set({ contextId: id }),
  setPendingNav: (nav) => set({ pendingNav: nav }),
}))

// Helper to get default page for role
export function defaultPageForRole(role: Role): string {
  switch (role) {
    case 'ADMIN': return 'admin-dashboard'
    case 'DOSEN': return 'dosen-dashboard'
    case 'MAHASISWA': return 'mhs-dashboard'
    case 'OPERATOR': return 'op-dashboard'
  }
}
