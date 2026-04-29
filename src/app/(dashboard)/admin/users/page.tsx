import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UsersManager } from '@/components/admin/UsersManager'
import type { Profile } from '@/lib/supabase/types'

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  if (profile?.role !== 'admin') redirect('/calendar')

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: false }) // admins first
    .order('email')

  return (
    <div className="p-6">
      <UsersManager
        initialProfiles={(profilesData as Profile[] | null) ?? []}
        currentUserId={user.id}
      />
    </div>
  )
}
