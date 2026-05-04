import { Building2, Mic, Clock, DollarSign, FileText, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { formatCents, formatPT, utcToPt, ptWallClockToUtc, nowPtAsUtc } from '@/lib/utils'

export interface ShiftRow {
  id: string
  brandId: string
  brandName: string
  producerName: string | null
  startISO: string
  endISO: string
  rateCents: number
  totalCents: number
  isPast: boolean
  notes: string | null
}

interface MyShiftsListProps {
  hostName: string
  shifts: ShiftRow[]
}

// All comparisons happen against the PT calendar so a host in any TZ sees
// the same day-bucket as the admin who scheduled the shift.
function ptDateKey(date: Date | string): string {
  return formatPT(date, 'yyyy-MM-dd')
}

function formatDayHeading(dayKey: string, sample: Date): string {
  const ptNow = utcToPt(new Date())
  const todayKey    = formatPT(new Date(), 'yyyy-MM-dd')
  const tomorrowDate = new Date(ptNow); tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowKey = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`

  if (dayKey === todayKey)    return `Today · ${formatPT(sample, 'EEE, MMM d')}`
  if (dayKey === tomorrowKey) return `Tomorrow · ${formatPT(sample, 'EEE, MMM d')}`

  // "This PT week" check: PT week starts Sunday
  const sundayKey = (() => {
    const d = new Date(ptNow)
    d.setDate(d.getDate() - d.getDay()) // back to Sunday
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const nextSundayKey = (() => {
    const d = new Date(ptNow)
    d.setDate(d.getDate() - d.getDay() + 7)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  if (dayKey >= sundayKey && dayKey < nextSundayKey) {
    return `${formatPT(sample, 'EEEE')} · ${formatPT(sample, 'MMM d')}`
  }
  return formatPT(sample, 'EEEE, MMMM d')
}

function groupByDay(shifts: ShiftRow[]): { dayKey: string; date: Date; items: ShiftRow[] }[] {
  const groups = new Map<string, { date: Date; items: ShiftRow[] }>()
  for (const s of shifts) {
    const d = new Date(s.startISO)
    const dayKey = ptDateKey(d)
    if (!groups.has(dayKey)) groups.set(dayKey, { date: d, items: [] })
    groups.get(dayKey)!.items.push(s)
  }
  return Array.from(groups.entries()).map(([dayKey, v]) => ({ dayKey, ...v }))
}

export function MyShiftsList({ hostName, shifts }: MyShiftsListProps) {
  const upcoming = shifts.filter(s => !s.isPast).sort((a, b) => a.startISO.localeCompare(b.startISO))
  const past     = shifts.filter(s => s.isPast).sort((a, b) => b.startISO.localeCompare(a.startISO))

  // Stats — month boundaries computed in PT so "this month" matches the
  // calendar month admins see in the brand calendar.
  const ptNowForStats = utcToPt(new Date())
  const monthStart = ptWallClockToUtc(
    new Date(ptNowForStats.getFullYear(), ptNowForStats.getMonth(), 1, 0, 0, 0, 0)
  ).getTime()
  const monthEnd = ptWallClockToUtc(
    new Date(ptNowForStats.getFullYear(), ptNowForStats.getMonth() + 1, 1, 0, 0, 0, 0)
  ).getTime()
  const now = nowPtAsUtc().getTime()

  const upcomingTotalCents = upcoming.reduce((sum, s) => sum + s.totalCents, 0)
  const monthEarnedCents = past
    .filter(s => {
      const t = new Date(s.startISO).getTime()
      return t >= monthStart && t <= now
    })
    .reduce((sum, s) => sum + s.totalCents, 0)
  const monthProjectedCents = upcoming
    .filter(s => {
      const t = new Date(s.startISO).getTime()
      return t >= now && t <= monthEnd
    })
    .reduce((sum, s) => sum + s.totalCents, 0)
  // All-time totals — every past shift the host has worked
  const allTimeEarnedCents = past.reduce((sum, s) => sum + s.totalCents, 0)
  const allTimeShiftsCount = past.length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">My Shifts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All shifts assigned to {hostName}.
        </p>
      </div>

      {/* All-time totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <StatCard
          label="All time earned"
          value={formatCents(allTimeEarnedCents)}
          sub={`Across ${allTimeShiftsCount} past ${allTimeShiftsCount === 1 ? 'shift' : 'shifts'}`}
          tone="primary"
        />
        <StatCard
          label="All time shifts worked"
          value={`${allTimeShiftsCount}`}
          sub="Completed shifts to date"
        />
      </div>

      {/* This-month + upcoming stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Upcoming"
          value={`${upcoming.length}`}
          sub={`${formatCents(upcomingTotalCents)} total`}
        />
        <StatCard
          label="Earned this month"
          value={formatCents(monthEarnedCents)}
          sub={`${past.filter(s => {
            const t = new Date(s.startISO).getTime()
            return t >= monthStart && t <= now
          }).length} past shifts`}
        />
        <StatCard
          label="Projected this month"
          value={formatCents(monthProjectedCents)}
          sub={`${upcoming.filter(s => {
            const t = new Date(s.startISO).getTime()
            return t >= now && t <= monthEnd
          }).length} upcoming shifts`}
        />
      </div>

      {/* Upcoming */}
      <Section title="Upcoming" emptyText="No upcoming shifts. Pick one from a brand calendar.">
        {upcoming.length === 0 ? null : (
          <div className="space-y-5">
            {groupByDay(upcoming).map(g => (
              <div key={g.dayKey}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {formatDayHeading(g.dayKey, g.date)}
                </h3>
                <div className="space-y-2">
                  {g.items.map(s => <ShiftCard key={s.id} shift={s} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Past */}
      {past.length > 0 && (
        <div className="mt-8">
          <Section title="Recent past" emptyText="">
            <div className="space-y-5">
              {groupByDay(past).slice(0, 30).map(g => (
                <div key={g.dayKey}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {formatDayHeading(g.dayKey, g.date)}
                  </h3>
                  <div className="space-y-2">
                    {g.items.map(s => <ShiftCard key={s.id} shift={s} past />)}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, children, emptyText }: { title: string; children: React.ReactNode; emptyText: string }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 pb-2 border-b border-border">
        {title}
      </h2>
      {children ?? (emptyText && (
        <p className="text-sm text-muted-foreground italic">{emptyText}</p>
      ))}
      {!children && !emptyText && null}
    </section>
  )
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'primary' }) {
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-card">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}

function ShiftCard({ shift, past }: { shift: ShiftRow; past?: boolean }) {
  const start = new Date(shift.startISO)
  const end   = new Date(shift.endISO)
  return (
    <Link
      href={`/calendar/${shift.brandId}`}
      className={`group block border border-border rounded-lg px-4 py-3 transition-colors ${
        past ? 'bg-card/40 hover:bg-card/60' : 'bg-card hover:bg-card/80'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{shift.brandName}</span>
          {past && (
            <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatPT(start, 'h:mm a')} – {formatPT(end, 'h:mm a')}
          </span>
          <span className="inline-flex items-center gap-1 text-primary font-medium">
            <DollarSign className="w-3 h-3" />
            {formatCents(shift.totalCents)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1">
          <Mic className="w-3 h-3" />
          {shift.producerName ? (
            <span className="text-foreground">{shift.producerName}</span>
          ) : (
            <span className="italic">Producer TBD</span>
          )}
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span>{formatCents(shift.rateCents)}/hr</span>
        {shift.notes && (
          <>
            <span className="text-muted-foreground/60">·</span>
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3 h-3" />
              <span className="truncate max-w-[20rem]">{shift.notes}</span>
            </span>
          </>
        )}
      </div>
    </Link>
  )
}
