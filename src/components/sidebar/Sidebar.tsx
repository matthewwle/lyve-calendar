'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Users, Building2, Mic, Shield, LogOut, Plus, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Brand, Profile } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

interface SidebarProps {
  profile: Profile | null
  brands: Brand[]
}

const adminLinks = [
  { href: '/admin/hosts', label: 'Hosts', icon: Users },
  { href: '/admin/brands', label: 'Brands', icon: Building2 },
  { href: '/admin/producers', label: 'Producers', icon: Mic },
  { href: '/admin/users', label: 'Admins', icon: Shield },
]

export function Sidebar({ profile, brands }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = profile?.role === 'admin'

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

      {/* User footer */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2.5 mb-2">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            {profile?.full_name && (
              <p className="text-xs font-medium text-foreground truncate">{profile.full_name}</p>
            )}
            <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
          </div>
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
    </aside>
  )
}
