'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, X, CalendarPlus, CalendarX2 } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { formatPT, cn } from '@/lib/utils'
import type { Notification } from '@/lib/supabase/types'

interface NotificationBellProps {
  userId: string
  initial: Notification[]
}

export function NotificationBell({ userId, initial }: NotificationBellProps) {
  const [items, setItems] = useState<Notification[]>(initial)
  const [open, setOpen] = useState(false)

  // Realtime subscription: prepend INSERTs, drop DELETEs from other tabs.
  useEffect(() => {
    const supabase = createClient()
    // Cast around the strict typed-client overload — Database is `any` here so
    // TS picks the wrong overload for postgres_changes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload: { new: Notification }) => {
          setItems(prev => {
            if (prev.some(i => i.id === payload.new.id)) return prev
            return [payload.new, ...prev]
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload: { old: { id: string } }) => {
          setItems(prev => prev.filter(i => i.id !== payload.old.id))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const unreadCount = useMemo(() => items.filter(i => !i.is_read).length, [items])

  // Mark all unread as read when the panel opens
  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && unreadCount > 0) {
      const unreadIds = items.filter(i => !i.is_read).map(i => i.id)
      // Optimistic
      setItems(prev => prev.map(i => (i.is_read ? i : { ...i, is_read: true })))
      const supabase = createClient()
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds)
    }
  }

  async function dismiss(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    const supabase = createClient()
    await supabase.from('notifications').delete().eq('id', id)
  }

  async function clearAll() {
    setItems([])
    const supabase = createClient()
    await supabase.from('notifications').delete().eq('recipient_id', userId)
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ring-offset-background"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[380px] p-0 max-h-[480px] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <ul className="flex-1 overflow-auto divide-y divide-border">
            {items.map(n => (
              <NotificationRow key={n.id} n={n} onDismiss={() => dismiss(n.id)} />
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationRow({ n, onDismiss }: { n: Notification; onDismiss: () => void }) {
  const isBooked = n.type === 'shift_booked'
  const Icon = isBooked ? CalendarPlus : CalendarX2

  // PT-naive timestamps: same field-as-wall-clock scheme as the rest of the app
  const dateLabel = formatPT(n.shift_start, 'EEE, MMM d')
  const startLabel = formatPT(n.shift_start, 'h:mm a')
  const endLabel = formatPT(n.shift_end, 'h:mm a')
  const relative = formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })

  return (
    <li className={cn('relative px-3 py-3 group hover:bg-secondary/50 transition-colors', !n.is_read && 'bg-primary/5')}>
      <div className="flex gap-3 pr-6">
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
            isBooked ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground leading-snug">
            <span className="font-semibold">{n.host_name}</span>{' '}
            <span className="text-muted-foreground">{isBooked ? 'booked' : 'cancelled'}</span>{' '}
            <span className="font-semibold">{n.brand_name}</span>{' '}
            <span className="text-muted-foreground">for</span>{' '}
            <span className="text-muted-foreground">
              {dateLabel} · {startLabel} – {endLabel}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{relative}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-foreground transition-all focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}
