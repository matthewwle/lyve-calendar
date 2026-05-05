import { createClient } from '@/lib/supabase/server'
import { NotificationBell } from './NotificationBell'
import type { Notification } from '@/lib/supabase/types'

interface TopbarProps {
  userId: string
}

export async function Topbar({ userId }: TopbarProps) {
  // Bell is visible to everyone — RLS scopes notifications to recipient_id.
  // Admins see incoming brand_request + booking events; hosts see only the
  // results of their own brand requests (approved/denied).
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
