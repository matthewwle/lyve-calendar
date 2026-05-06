import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ModeratorsManager } from '@/components/admin/ModeratorsManager'
import { resolveRole } from '@/lib/role'
import type { Moderator, Profile } from '@/lib/supabase/types'

export default async function ModeratorsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  const { effectiveIsAdmin } = await resolveRole(profile)
  if (!effectiveIsAdmin) redirect('/calendar')

  const [{ data: moderatorsData }, { data: profilesData }] = await Promise.all([
    supabase.from('moderators').select('*').order('name'),
    supabase.from('profiles').select('*').order('email'),
  ])

  return (
    <div className="p-6">
      <ModeratorsManager
        initialModerators={(moderatorsData as Moderator[] | null) ?? []}
        profiles={(profilesData as Profile[] | null) ?? []}
      />
    </div>
  )
}
