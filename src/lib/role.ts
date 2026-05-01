import { cookies } from 'next/headers'
import type { Profile } from '@/lib/supabase/types'

export const VIEW_AS_HOST_COOKIE = 'view_as_host'

export interface ResolvedRole {
  /** True iff profiles.role === 'admin' (the real DB-backed role). */
  actualIsAdmin: boolean
  /** True iff a true admin has opted into "viewing as host". */
  viewingAsHost: boolean
  /** What the UI should treat the user as. */
  effectiveIsAdmin: boolean
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
