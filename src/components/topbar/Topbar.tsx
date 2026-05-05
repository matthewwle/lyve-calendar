import { createClient } from '@/lib/supabase/server'
import { NotificationBell } from './NotificationBell'
import type { Notification } from '@/lib/supabase/types'

interface TopbarProps {
  isAdmin: boolean
  userId: string
}

export async function Topbar({ isAdmin, userId }: TopbarProps) {
  if (!isAdmin) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  const initial = (data as Notification[] | null) ?? []

  return (
    <div className="h-12 flex-shrink-0 border-b border-border bg-card flex items-center justify-end px-4">
      <NotificationBell userId={userId} initial={initial} />
    </div>
  )
}
