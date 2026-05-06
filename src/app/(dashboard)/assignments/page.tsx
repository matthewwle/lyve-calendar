import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardCheck, Mic, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatPT, nowPtAsUtc } from '@/lib/utils'
import { BrandLogo } from '@/components/brand/BrandLogo'

interface AssignmentRow {
  id: string
  brand: { id: string; name: string; logo_path: string | null }
  hostName: string | null
  startISO: string
  endISO: string
  role: 'producer' | 'moderator'
  isPast: boolean
}

export default async function MyAssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: producerRow }, { data: moderatorRow }] = await Promise.all([
    supabase.from('producers').select('id').eq('user_id', user.id).maybeSingle(),
    supabase.from('moderators').select('id').eq('user_id', user.id).maybeSingle(),
  ])

  if (!producerRow && !moderatorRow) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto">
            <ClipboardCheck className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">No assignments yet</h1>
            <p className="text-sm text-muted-foreground">
              An admin will assign you to streams here once you&rsquo;re linked as a producer or moderator.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const producerId = (producerRow as { id: string } | null)?.id ?? null
  const moderatorId = (moderatorRow as { id: string } | null)?.id ?? null

  type StreamJoin = {
    id: string
    start_time: string
    end_time: string
    producer_id: string | null
    moderator_id: string | null
    brand: { id: string; name: string; logo_path: string | null } | { id: string; name: string; logo_path: string | null }[] | null
    host: { id: string; name: string } | { id: string; name: string }[] | null
  }

  const [{ data: producerStreams }, { data: moderatorStreams }] = await Promise.all([
    producerId
      ? supabase
          .from('streams')
          .select('id, start_time, end_time, producer_id, moderator_id, brand:brands(id,name,logo_path), host:hosts(id,name)')
          .eq('producer_id', producerId)
          .order('start_time', { ascending: false })
      : Promise.resolve({ data: [] as StreamJoin[] }),
    moderatorId
      ? supabase
          .from('streams')
          .select('id, start_time, end_time, producer_id, moderator_id, brand:brands(id,name,logo_path), host:hosts(id,name)')
          .eq('moderator_id', moderatorId)
          .order('start_time', { ascending: false })
      : Promise.resolve({ data: [] as StreamJoin[] }),
  ])

  const nowMs = nowPtAsUtc().getTime()
  function unwrap<T>(v: T | T[] | null): T | null {
    if (Array.isArray(v)) return v[0] ?? null
    return v
  }

  const rows: AssignmentRow[] = []
  const seen = new Set<string>()
  for (const s of [
    ...((producerStreams ?? []) as unknown as StreamJoin[]).map(x => ({ ...x, _role: 'producer' as const })),
    ...((moderatorStreams ?? []) as unknown as StreamJoin[]).map(x => ({ ...x, _role: 'moderator' as const })),
  ]) {
    // A user can be on the same shift twice if they're both producer and
    // moderator (rare, but de-dup by `${id}:${role}` so each role still shows).
    const key = `${s.id}:${s._role}`
    if (seen.has(key)) continue
    seen.add(key)
    const brand = unwrap(s.brand)
    if (!brand) continue
    rows.push({
      id: s.id,
      brand,
      hostName: unwrap(s.host)?.name ?? null,
      startISO: s.start_time,
      endISO: s.end_time,
      role: s._role,
      isPast: new Date(s.end_time).getTime() <= nowMs,
    })
  }

  // Upcoming first (chronological), then past (most-recent first).
  rows.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1
    return a.isPast
      ? b.startISO.localeCompare(a.startISO)
      : a.startISO.localeCompare(b.startISO)
  })

  const upcoming = rows.filter(r => !r.isPast)
  const past = rows.filter(r => r.isPast)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Assignments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Shifts you&rsquo;re assigned to as a producer or moderator.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        </div>
      ) : (
        <>
          <Section title={`Upcoming (${upcoming.length})`} rows={upcoming} />
          {past.length > 0 && <Section title={`Past (${past.length})`} rows={past} dim />}
        </>
      )}
    </div>
  )
}

function Section({ title, rows, dim }: { title: string; rows: AssignmentRow[]; dim?: boolean }) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <ul className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
        {rows.map(r => {
          const Icon = r.role === 'producer' ? Mic : Megaphone
          return (
            <li key={`${r.id}:${r.role}`}>
              <Link
                href={`/calendar/${r.brand.id}`}
                className={
                  'flex items-center gap-3 p-3 hover:bg-secondary/40 transition-colors ' +
                  (dim ? 'opacity-70' : '')
                }
              >
                <BrandLogo name={r.brand.name} logoPath={r.brand.logo_path} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.brand.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPT(r.startISO, 'EEE, MMM d')} · {formatPT(r.startISO, 'h:mm a')} – {formatPT(r.endISO, 'h:mm a')}
                    {r.hostName && <> · Host: <span className="text-foreground">{r.hostName}</span></>}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  <Icon className="w-3 h-3" />
                  {r.role}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
