import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/onboarding/ProfileForm'
import type { Profile } from '@/lib/supabase/types'

export default async function SettingsProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const profile = profileData as Profile | null

  // Sidebar already loads a fresh signed URL each render — for the settings
  // form we just point at the API proxy so users always see the current photo.
  const headshotUrl = profile?.headshot_path ? `/api/headshot/${user.id}` : null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <ProfileForm
        userId={user.id}
        initial={profile}
        headshotUrl={headshotUrl}
        mode="settings"
      />
    </div>
  )
}
