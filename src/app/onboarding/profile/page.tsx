import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/onboarding/ProfileForm'
import type { Profile } from '@/lib/supabase/types'

export default async function OnboardingProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const profile = profileData as Profile | null

  // Resolve a signed URL for any existing headshot so the form can preview it
  let headshotUrl: string | null = null
  if (profile?.headshot_path) {
    const { data: signed } = await supabase.storage
      .from('headshots')
      .createSignedUrl(profile.headshot_path, 60 * 60)
    headshotUrl = signed?.signedUrl ?? null
  }

  return (
    <ProfileForm
      userId={user.id}
      initial={profile}
      headshotUrl={headshotUrl}
    />
  )
}
