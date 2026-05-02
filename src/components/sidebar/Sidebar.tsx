'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Users, Building2, Mic, Shield, LogOut, Plus, CalendarDays, Eye, ShieldCheck, ClipboardList, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Brand, Profile } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toggleViewAsHost } from '@/lib/view-as-actions'

interface SidebarProps {
  profile: Profile | null
  brands: Brand[]
  actualIsAdmin: boolean
  viewingAsHost: boolean
  hasHostProfile: boolean
  headshotUrl?: string | null
}

const adminLinks = [
  { href: '/admin/hosts', label: 'Hosts', icon: Users },
  { href: '/admin/brands', label: 'Brands', icon: Building2 },
  { href: '/admin/producers', label: 'Producers', icon: Mic },
  { href: '/admin/users', label: 'Admins', icon: Shield },
]

export function Sidebar({ profile, brands, actualIsAdmin, viewingAsHost, hasHostProfile, headshotUrl }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  // Effective admin = real admin AND not currently impersonating a host
  const isAdmin = actualIsAdmin && !viewingAsHost
  const [avatarOpen, setAvatarOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-screen bg-card border-r border-border">
      {/* Logo */}
      <div className="px-4 py-5 flex items-center gap-3">
        <Image
          src="/Lyve-Gradient-Icon.png"
          alt="Lyve"
          width={32}
          height={32}
          priority
          className="w-8 h-8 rounded-lg flex-shrink-0 object-contain"
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground leading-none">Lyve</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Internal Scheduler</p>
        </div>
      </div>

      <Separator />

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {/* Calendars section */}
        <div className="pb-1 px-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Calendars</p>
        </div>

        {brands.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground italic">
            No calendars yet.
          </p>
        ) : (
          brands.map(brand => {
            const href = `/calendar/${brand.id}`
            const active = pathname === href || pathname?.startsWith(`${href}/`)
            return (
              <Link
                key={brand.id}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <CalendarDays className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{brand.name}</span>
              </Link>
            )
          })
        )}

        {isAdmin && (
          <Link
            href="/admin/brands"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            Add Brand
          </Link>
        )}

        {/* My Shifts (only when the user is linked to a host record) */}
        {hasHostProfile && (
          <Link
            href="/my-shifts"
            className={cn(
              'mt-4 flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname === '/my-shifts'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <ClipboardList className="w-4 h-4 flex-shrink-0" />
            My Shifts
          </Link>
        )}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Admin</p>
            </div>
            {adminLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  pathname === href
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <Separator />

      {/* View-as-host toggle (real admins only) */}
      {actualIsAdmin && (
        <div className="px-3 pt-3">
          {viewingAsHost && (
            <p className="mb-2 px-2 py-1 text-[10px] font-semibold text-primary bg-primary/15 rounded-md text-center uppercase tracking-wider">
              Viewing as host
            </p>
          )}
          <form action={toggleViewAsHost}>
            <Button
              type="submit"
              variant={viewingAsHost ? 'default' : 'outline'}
              size="sm"
              className="w-full justify-center gap-2 h-8"
            >
              {viewingAsHost ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Back to Admin
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  View as Host
                </>
              )}
            </Button>
          </form>
        </div>
      )}

      {/* User footer */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2.5 mb-2">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            className="rounded-full ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:opacity-80 transition-opacity"
            aria-label="View your profile photo"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center flex-shrink-0">
              {headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headshotUrl}
                  alt={profile?.full_name ?? 'Avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary text-xs font-semibold">{initials}</span>
              )}
            </div>
          </button>
          <div className="min-w-0 flex-1">
            {profile?.full_name && (
              <p className="text-xs font-medium text-foreground truncate">{profile.full_name}</p>
            )}
            <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
          </div>
          <Link
            href="/settings/profile"
            aria-label="Profile settings"
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-md transition-colors flex-shrink-0',
              pathname === '/settings/profile'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground h-8 px-2"
          onClick={handleSignOut}
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </Button>
      </div>

      {/* Avatar zoom dialog */}
      <Dialog open={avatarOpen} onOpenChange={setAvatarOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{profile?.full_name || 'Your profile'}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <div className="w-56 h-56 rounded-full overflow-hidden bg-secondary border-2 border-primary/20 flex items-center justify-center">
              {headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headshotUrl}
                  alt={profile?.full_name ?? 'Profile photo'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-5xl font-bold text-primary">{initials}</span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {profile?.email}
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full gap-2 mt-2"
            onClick={() => setAvatarOpen(false)}
          >
            <Link href="/settings/profile">
              <Settings className="w-3.5 h-3.5" />
              Edit profile
            </Link>
          </Button>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
