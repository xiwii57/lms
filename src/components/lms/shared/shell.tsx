'use client'
import { useAuthStore, useUIStore, defaultPageForRole } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { GraduationCap, LogOut, Menu, User } from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  id: string
  label: string
  icon: any
}

interface ShellProps {
  navItems: NavItem[]
  children: React.ReactNode
  roleLabel: string
}

export function DashboardShell({ navItems, children, roleLabel }: ShellProps) {
  const { user, logout } = useAuthStore()
  const { currentPage, setPage } = useUIStore()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const initials = user.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  const NavContent = (
    <nav className="flex flex-col gap-1 p-3">
      <div className="px-3 py-2 mb-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Menu</div>
      </div>
      {navItems.map((item) => {
        const Icon = item.icon
        const active = currentPage === item.id
        return (
          <button
            key={item.id}
            onClick={() => {
              setPage(item.id)
              setOpen(false)
            }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-left ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground/70 hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30 flex items-center px-4 gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="h-14 border-b flex items-center px-4 gap-2">
              <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">LMS Ujian</div>
                <div className="text-xs text-muted-foreground">{roleLabel}</div>
              </div>
            </div>
            {NavContent}
          </SheetContent>
        </Sheet>

        {/* Logo / Brand */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold leading-tight">LMS Ujian Online</div>
            <div className="text-xs text-muted-foreground leading-tight">{roleLabel}</div>
          </div>
        </div>

        <div className="flex-1" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <div className="text-sm font-medium leading-tight max-w-[160px] truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground leading-tight truncate max-w-[160px]">{user.email}</div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
              {user.nip && <div className="text-xs text-muted-foreground mt-0.5">NIP: {user.nip}</div>}
              {user.nim && <div className="text-xs text-muted-foreground mt-0.5">NIM: {user.nim}</div>}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 flex">
        {/* Desktop sidebar */}
        <aside className="w-60 border-r bg-card/50 hidden lg:flex flex-col">
          <div className="flex-1 overflow-y-auto">{NavContent}</div>
          <div className="p-3 border-t">
            <div className="text-xs text-muted-foreground text-center">
              &copy; 2026 LMS Ujian Online
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
