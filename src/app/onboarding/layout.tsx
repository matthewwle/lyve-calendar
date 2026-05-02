import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Page is reachable whether the profile is complete or not — the dashboard
  // layout still gates the rest of the app on completion. Visiting
  // /onboarding/profile after completion acts as an "edit profile" view.

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-xl">
        {children}
      </div>
    </div>
  )
}
