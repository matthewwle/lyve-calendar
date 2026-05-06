import { cookies } from 'next/headers'
import type { Profile } from '@/lib/supabase/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export const VIEW_AS_HOST_COOKIE = 'view_as_host'

export interface ResolvedRole {
  /** True iff profiles.role === 'admin' (the real DB-backed role). */
  actualIsAdmin: boolean
  /** True iff a true admin has opted into "viewing as host". */
  viewingAsHost: boolean
  /** What the UI should treat the user as. */
  effectiveIsAdmin: boolean
}

export interface UserRoles {
  isAdmin: boolean       // effective admin (real admin AND not view-as-host)
  isHost: boolean        // a hosts row exists for this user
  isProducer: boolean    // a producers row links to this user
  isModerator: boolean   // a moderators row links to this user
  hostId: string | null
}

/**
 * Resolve the effective role for the current request.
 *
 * Only true admins can opt into host preview — the cookie is ignored
 * for everyone else, so a non-admin planting `view_as_host=1` has no
 * effect.
 */
export async function resolveRole(profile: Profile | null): Promise<ResolvedRole> {
  const c = await cookies()
  const actualIsAdmin = profile?.role === 'admin'
  const viewingAsHost = actualIsAdmin && c.get(VIEW_AS_HOST_COOKIE)?.value === '1'
  return {
    actualIsAdmin,
    viewingAsHost,
    effectiveIsAdmin: actualIsAdmin && !viewingAsHost,
  }
}

/**
 * Resolve all role memberships for the current user in a single round-trip.
 * `effectiveIsAdmin` from resolveRole flows in so that an admin viewing-as-host
 * is reported as `isAdmin: false`, matching the rest of the UI.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveUserRoles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  effectiveIsAdmin: boolean,
): Promise<UserRoles> {
  const [{ data: hostRow }, { data: producerRow }, { data: moderatorRow }] = await Promise.all([
    supabase.from('hosts').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('producers').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('moderators').select('id').eq('user_id', userId).maybeSingle(),
  ])
  return {
    isAdmin: effectiveIsAdmin,
    isHost: !!hostRow,
    isProducer: !!producerRow,
    isModerator: !!moderatorRow,
    hostId: (hostRow as { id: string } | null)?.id ?? null,
  }
}
