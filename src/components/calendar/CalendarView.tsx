'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import type {
  EventContentArg,
  EventClickArg,
  SlotLabelContentArg,
  EventInput,
} from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import { MousePointerSquareDashed, X, Check, Ban, Unlock, DollarSign, Clock, Lock, CheckCircle2, CalendarRange } from 'lucide-react'
import { format } from 'date-fns'
import { streamsToEvents } from '@/hooks/useStreams'
import { StreamEventModal } from './StreamEventModal'
import type { StreamWithRelations, Host, Producer, BrandShiftRate, BrandShiftOverride } from '@/lib/supabase/types'
import { useToast } from '@/hooks/use-toast'
import {
  minutesToTimeString,
  formatCents,
  buildRateLookup,
  rateKey,
  APP_TIMEZONE,
  formatPT,
  utcToPt,
  ptWallClockToUtc,
  nowPtAsUtc,
} from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ShiftConfig {
  blockSizeMinutes: number
  dayStartMinutes: number
  dayEndMinutes: number
}

interface ConflictBooking {
  start_time: string
  end_time:   string
  brandName:  string
}

interface CalendarViewProps {
  brandId: string
  initialStreams: StreamWithRelations[]
  initialHosts: Host[]
  initialProducers: Producer[]
  initialShiftRates: BrandShiftRate[]
  initialShiftOverrides: BrandShiftOverride[]
  shift: ShiftConfig
  isAdmin: boolean
  currentUserId: string
  currentHost: { id: string; name: string } | null
  conflicts: ConflictBooking[]
  /** Stream ids the current user has a pending cancellation request for. */
  pendingCancelStreamIds?: string[]
}

interface SelectedSlot {
  start: Date
  end: Date
  rateCents: number
  existingStream: StreamWithRelations | null
}

export function CalendarView({
  brandId,
  initialStreams,
  initialHosts,
  initialProducers,
  initialShiftRates,
  initialShiftOverrides,
  shift,
  isAdmin,
  currentUserId,
  currentHost,
  conflicts,
  pendingCancelStreamIds = [],
}: CalendarViewProps) {
  const pendingCancelSet = useMemo(
    () => new Set(pendingCancelStreamIds),
    [pendingCancelStreamIds],
  )
  const [streams, setStreams] = useState<StreamWithRelations[]>(initialStreams)
  const { toast } = useToast()
  const router = useRouter()
  const calendarRef = useRef<FullCalendar | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)

  // Select-mode state for editing rates
  const [selectMode, setSelectMode] = useState(false)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [bulkRate, setBulkRate] = useState('')
  const [applying, setApplying] = useState(false)

  // Track which view is currently visible so we can filter out time-grid-only
  // background events (rate labels, conflict overlays) from month view.
  const [currentView, setCurrentView] = useState<string>('timeGridWeek')
  const isTimeGridView = currentView === 'timeGridWeek' || currentView === 'timeGridDay'

  // Tracks the last time eventClick handled a click so dateClick can dedupe.
  // FC's interaction plugin sometimes fires both for a single click when
  // cells have overlapping events; without this, selectMode toggles twice
  // and the cell flashes selected then deselects.
  const lastEventClickRef = useRef<number>(0)

  const blockCount = useMemo(
    () => Math.max(0, Math.floor((shift.dayEndMinutes - shift.dayStartMinutes) / shift.blockSizeMinutes)),
    [shift]
  )

  const rates = useMemo(() => buildRateLookup(initialShiftRates), [initialShiftRates])

  // Per-(date, block) overrides — quick lookup via "yyyy-mm-dd-idx" key
  const overrideMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of initialShiftOverrides) {
      m.set(`${o.shift_date}-${o.block_index}`, o.rate_cents)
    }
    return m
  }, [initialShiftOverrides])

  // Date keys are derived from the cell's PT calendar date so they line up with
  // brand_shift_overrides.shift_date (which is the PT-relative civil date).
  const dateKey = (d: Date) => formatPT(d, 'yyyy-MM-dd')

  // Effective rate for a specific cell: override beats default
  const effectiveRate = useCallback((d: Date, idx: number): number => {
    const key = `${dateKey(d)}-${idx}`
    const override = overrideMap.get(key)
    if (override !== undefined) return override
    // Day-of-week is also PT-derived
    const dow = utcToPt(d).getDay()
    return rates.get(dow, idx)
  }, [overrideMap, rates])

  // Active visible date range (driven by FC's datesSet)
  const [activeRange, setActiveRange] = useState<{ start: Date; end: Date } | null>(null)

  useEffect(() => {
    if (selectMode) calendarRef.current?.getApi().changeView('timeGridWeek')
  }, [selectMode])

  function blockIndexFromMinutes(slotMins: number): number {
    return Math.round((slotMins - shift.dayStartMinutes) / shift.blockSizeMinutes)
  }

  function snapToCell(date: Date): { start: Date; end: Date; dow: number; idx: number } | null {
    // Treat all wall-clock math in PT — admin scheduling is authored in PT and
    // viewers in other TZs need to see the same wall-clock times.
    const ptDate = utcToPt(date)
    const slotMins = ptDate.getHours() * 60 + ptDate.getMinutes()
    const idx = blockIndexFromMinutes(slotMins)
    if (idx < 0 || idx >= blockCount) return null
    const dow = ptDate.getDay()
    const blockStartMins = shift.dayStartMinutes + idx * shift.blockSizeMinutes
    const blockEndMins   = shift.dayStartMinutes + (idx + 1) * shift.blockSizeMinutes

    // Anchor at PT midnight, then add minutes; convert back to a real UTC instant
    const ptMidnight = new Date(ptDate)
    ptMidnight.setHours(0, 0, 0, 0)
    const startPt = new Date(ptMidnight.getTime() + blockStartMins * 60_000)
    const endPt   = new Date(ptMidnight.getTime() + blockEndMins   * 60_000)
    const start = ptWallClockToUtc(startPt)
    const end   = ptWallClockToUtc(endPt)

    return { start, end, dow, idx }
  }

  const events = useMemo(() => streamsToEvents(streams), [streams])

  // Used to detect "this cell already has a booked stream"
  const occupiedSlotTimes = useMemo(
    () => new Set(streams.map(s => new Date(s.start_time).getTime())),
    [streams]
  )

  // For chain-booking: per-PT-date set of booked block_indexes.
  // Skip rows whose derived idx is outside the brand's day window — those are
  // legacy/corrupted timestamps (e.g. from a previous TZ migration round-trip)
  // that would otherwise pollute the chain-rule logic.
  const bookedByDate = useMemo(() => {
    const m = new Map<string, Set<number>>()
    for (const s of streams) {
      const d = utcToPt(new Date(s.start_time))
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const slotMins = d.getHours() * 60 + d.getMinutes()
      const idx = Math.round((slotMins - shift.dayStartMinutes) / shift.blockSizeMinutes)
      if (idx < 0 || idx >= blockCount) continue
      if (!m.has(key)) m.set(key, new Set())
      m.get(key)!.add(idx)
    }
    return m
  }, [streams, shift.dayStartMinutes, shift.blockSizeMinutes, blockCount])

  // True when a cell is locked by the chain rule:
  //   - The PT day has at least one booking
  //   - This cell isn't itself booked
  //   - Not adjacent to any booking (idx ± 1)
  // Admins bypass the rule entirely.
  const chainLockedAt = useCallback((date: Date, blockIdx: number): boolean => {
    if (isAdmin) return false
    const pt = utcToPt(date)
    const key = `${pt.getFullYear()}-${pt.getMonth()}-${pt.getDate()}`
    const booked = bookedByDate.get(key)
    if (!booked || booked.size === 0) return false
    if (booked.has(blockIdx)) return false
    const arr = Array.from(booked)
    for (const b of arr) if (Math.abs(b - blockIdx) === 1) return false
    return true
  }, [bookedByDate, isAdmin])

  // Pre-parse conflicts into [startMs, endMs, brandName] for quick overlap checks
  const parsedConflicts = useMemo(
    () => conflicts.map(c => ({
      startMs: new Date(c.start_time).getTime(),
      endMs:   new Date(c.end_time).getTime(),
      brandName: c.brandName,
    })),
    [conflicts]
  )

  // True if [startMs, endMs) overlaps any of the host's other-brand bookings
  const conflictAt = useCallback((startMs: number, endMs: number): string | null => {
    for (const c of parsedConflicts) {
      if (c.startMs < endMs && c.endMs > startMs) return c.brandName
    }
    return null
  }, [parsedConflicts])

  // Build one orange overlay event per OUR-brand block that overlaps a conflict.
  // Snaps to this brand's grid so different block sizes / day windows align cleanly.
  // Only relevant in time-grid views.
  const conflictEvents: EventInput[] = useMemo(() => {
    if (isAdmin || parsedConflicts.length === 0 || !isTimeGridView) return []
    const out: EventInput[] = []
    // Walk each conflict; generate per-block overlays on our grid for that day.
    // Anchor at PT midnight so cross-brand conflicts line up with our PT grid.
    for (const c of parsedConflicts) {
      const ptAnchor = utcToPt(new Date(c.startMs))
      ptAnchor.setHours(0, 0, 0, 0)
      const midnightUtcMs = ptWallClockToUtc(ptAnchor).getTime()
      for (let idx = 0; idx < blockCount; idx++) {
        const blockStart = midnightUtcMs + (shift.dayStartMinutes + idx * shift.blockSizeMinutes) * 60_000
        const blockEnd   = midnightUtcMs + (shift.dayStartMinutes + (idx + 1) * shift.blockSizeMinutes) * 60_000
        if (c.startMs < blockEnd && c.endMs > blockStart) {
          out.push({
            start: new Date(blockStart).toISOString(),
            end:   new Date(blockEnd).toISOString(),
            display: 'background',
            color: 'rgba(255, 68, 51, 0.55)',
            extendedProps: { __conflict: true, brandName: c.brandName },
          })
        }
      }
    }
    return out
  }, [parsedConflicts, isAdmin, blockCount, shift.dayStartMinutes, shift.blockSizeMinutes, isTimeGridView])

  // Background events: one per (day_of_week × block_index) so each cell shows
  // its specific rate, and selected cells get highlighted in select mode.
  // These only make sense in time-grid views.
  const cellEvents: EventInput[] = useMemo(() => {
    if (!isTimeGridView) return []
    const out: EventInput[] = []
    for (let dow = 0; dow < 7; dow++) {
      for (let idx = 0; idx < blockCount; idx++) {
        const startMin = shift.dayStartMinutes + idx * shift.blockSizeMinutes
        const endMin   = shift.dayStartMinutes + (idx + 1) * shift.blockSizeMinutes
        const cents = rates.get(dow, idx)
        const isBlocked = rates.isBlocked(dow, idx)
        const isSelected = selectMode && selectedCells.has(rateKey(dow, idx))

        // Hosts don't see blocked cells at all
        if (isBlocked && !isAdmin) continue

        let color = 'transparent'
        if (isSelected) color = 'rgba(255, 68, 51, 0.32)'
        else if (isBlocked) color = 'rgba(239, 68, 68, 0.18)'

        out.push({
          daysOfWeek: [dow],
          startTime: minutesToTimeString(startMin),
          endTime:   minutesToTimeString(endMin),
          display: 'background',
          color,
          extendedProps: { __rateLabel: true, rateCents: cents, isSelected, isBlocked },
        })
      }
    }
    return out
  }, [blockCount, shift.dayStartMinutes, shift.blockSizeMinutes, rates, selectMode, selectedCells, isAdmin, isTimeGridView])

  const allEvents: EventInput[] = useMemo(
    // Conflict overlays only render outside select mode (admins don't see
    // them anyway); stream events stay visible at all times so admins keep
    // context of existing bookings while group-editing rates.
    () => (selectMode ? [...cellEvents, ...events] : [...cellEvents, ...conflictEvents, ...events]),
    [selectMode, cellEvents, conflictEvents, events]
  )

  function openSlotForDate(date: Date) {
    const cell = snapToCell(date)
    if (!cell) return
    // Hosts can't open blocked slots, cross-brand conflicts, past shifts,
    // or chain-locked slots (must be adjacent to an existing booking)
    if (!isAdmin && rates.isBlocked(cell.dow, cell.idx)) return
    if (!isAdmin && conflictAt(cell.start.getTime(), cell.end.getTime())) return
    if (!isAdmin && cell.end.getTime() <= nowPtAsUtc().getTime()) return
    if (!isAdmin && chainLockedAt(cell.start, cell.idx)) return
    const rateCents = rates.get(cell.dow, cell.idx)
    const existing = streams.find(
      s => s.brand_id === brandId && new Date(s.start_time).getTime() === cell.start.getTime()
    ) ?? null
    setSelectedSlot({
      start: cell.start,
      end: cell.end,
      rateCents,
      existingStream: existing,
    })
    setModalOpen(true)
  }

  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    const props = clickInfo.event.extendedProps
    // Conflict overlays are decorative — clicking does nothing
    if (props.__conflict) return

    const start = clickInfo.event.start
    if (!start) return

    // Mark this click as handled so dateClick (if it fires for the same
    // user click) won't double-toggle the selection state.
    lastEventClickRef.current = Date.now()
    clickInfo.jsEvent?.stopPropagation?.()

    if (selectMode) {
      // Group selection is for future shifts only
      const cellEnd = clickInfo.event.end
      if (cellEnd && cellEnd.getTime() <= nowPtAsUtc().getTime()) return

      const cell = snapToCell(start)
      if (!cell) return
      const key = rateKey(cell.dow, cell.idx)
      setSelectedCells(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }

    // Both rate-label bg events and real stream events route through the same opener
    openSlotForDate(start)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, streams, blockCount, shift.dayStartMinutes, shift.blockSizeMinutes, rates, conflictAt, isAdmin])

  const handleDateClick = useCallback((info: DateClickArg) => {
    // Skip if eventClick just handled this same user-click (prevents
    // double-toggle when both fire on overlapping events / cells)
    if (Date.now() - lastEventClickRef.current < 80) return

    // In month view, clicking a day jumps to Week view focused on that date
    const view = calendarRef.current?.getApi().view.type
    if (view === 'dayGridMonth') {
      calendarRef.current?.getApi().changeView('timeGridWeek', info.date)
      return
    }

    if (selectMode) {
      const cell = snapToCell(info.date)
      if (!cell) return
      // Group selection is for future shifts only
      if (cell.end.getTime() <= nowPtAsUtc().getTime()) return
      const key = rateKey(cell.dow, cell.idx)
      setSelectedCells(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }
    openSlotForDate(info.date)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, streams, blockCount, shift.dayStartMinutes, shift.blockSizeMinutes, rates])

  function handleSave(savedStream: StreamWithRelations) {
    setStreams(prev => {
      const exists = prev.find(s => s.id === savedStream.id)
      return exists
        ? prev.map(s => s.id === savedStream.id ? savedStream : s)
        : [...prev, savedStream]
    })
    toast({ title: 'Shift updated' })
    // Invalidate Next's Router Cache so the next visit (this brand or another)
    // re-fetches fresh stream + conflict data instead of serving a stale page.
    router.refresh()
  }

  function handleDelete(streamId: string) {
    setStreams(prev => prev.filter(s => s.id !== streamId))
    toast({ title: 'Shift cleared' })
    router.refresh()
  }

  function renderEventContent(eventInfo: EventContentArg) {
    if (eventInfo.event.extendedProps.__conflict) {
      const brandName = eventInfo.event.extendedProps.brandName as string
      return (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center gap-1.5 px-2 text-center">
          <Lock className="w-3 h-3 text-white shrink-0" />
          <span className="text-xs font-bold text-white leading-tight">
            You are already booked for {brandName}
          </span>
        </div>
      )
    }

    if (eventInfo.event.extendedProps.__rateLabel) {
      const fallbackCents = eventInfo.event.extendedProps.rateCents as number
      const isBlocked = eventInfo.event.extendedProps.isBlocked as boolean
      // Recompute rate from the specific date so per-date overrides are respected.
      // Use PT-derived hours/minutes since rates are stored against PT calendar dates.
      const cellStartDate = eventInfo.event.start
      let cents = fallbackCents
      if (cellStartDate) {
        const ptStart = utcToPt(cellStartDate)
        const slotMinutes = ptStart.getHours() * 60 + ptStart.getMinutes()
        const idx = Math.round((slotMinutes - shift.dayStartMinutes) / shift.blockSizeMinutes)
        cents = effectiveRate(cellStartDate, idx)
      }

      // Past cells render at a slightly muted tone but still show the rate —
      // unless a stream actually happened here, in which case we let the
      // booked-shift event own that cell visually.
      const cellEnd = eventInfo.event.end
      const isPast = !!cellEnd && cellEnd.getTime() <= nowPtAsUtc().getTime()
      const cellStartMs = eventInfo.event.start?.getTime()
      const cellEndMs = cellEnd?.getTime()
      const hasStream = cellStartMs !== undefined && occupiedSlotTimes.has(cellStartMs)
      const hasConflict = cellStartMs !== undefined && cellEndMs !== undefined && !!conflictAt(cellStartMs, cellEndMs)
      const hideRate = (isPast && hasStream) || hasConflict

      // Chain-lock check (host only, future, not blocked) — PT-derived index
      const cellStart = eventInfo.event.start
      const ptCellStart = cellStart ? utcToPt(cellStart) : null
      const isChainLocked = !isAdmin && !isPast && !isBlocked && !!cellStart && !!ptCellStart &&
        chainLockedAt(cellStart, Math.round(((ptCellStart.getHours() * 60 + ptCellStart.getMinutes()) - shift.dayStartMinutes) / shift.blockSizeMinutes))

      return (
        <div className="absolute inset-0 pointer-events-none">
          {isBlocked ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <X className="text-destructive/30" strokeWidth={2} style={{ width: '40%', height: '40%' }} />
            </div>
          ) : isChainLocked ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Lock className="text-foreground/30" strokeWidth={2} style={{ width: '24%', height: '24%' }} />
            </div>
          ) : (
            <>
              {isPast && (
                <Clock className="absolute top-1 left-1 w-3 h-3 text-foreground/30" />
              )}
              {!hideRate && (
                <div className="absolute inset-0 flex items-center justify-center">
                  {isPast ? (
                    // Past: faint orange text only — subtle, washed out
                    <span className="text-xl font-bold tracking-tight text-primary/45">
                      {formatCents(cents)}/hr
                    </span>
                  ) : (
                    // Upcoming: solid orange pill with white text — pops like a button
                    <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-base font-bold tracking-tight shadow-sm">
                      {formatCents(cents)}/hr
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )
    }
    // Real stream event — render style differs by view
    const streamEnd = eventInfo.event.end
    const streamIsPast = !!streamEnd && streamEnd.getTime() <= nowPtAsUtc().getTime()
    const isMonth = eventInfo.view.type === 'dayGridMonth'

    if (isMonth) {
      return (
        <div className="px-1.5 py-0.5 overflow-hidden w-full flex items-center gap-1">
          {streamIsPast && <CheckCircle2 className="w-3 h-3 text-white/70 shrink-0" />}
          <span className="block truncate text-[0.7rem] font-medium text-white leading-tight">
            {eventInfo.event.title}
          </span>
        </div>
      )
    }

    return (
      <div className="absolute inset-0">
        {streamIsPast && (
          <CheckCircle2 className="absolute top-1 right-1 w-3 h-3 text-white/70" />
        )}
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center overflow-hidden">
          <span className="text-base font-bold text-white leading-tight tracking-tight">
            {eventInfo.event.title}
          </span>
        </div>
      </div>
    )
  }

  function renderSlotLabel(arg: SlotLabelContentArg) {
    const start = arg.date
    const end = new Date(start.getTime() + shift.blockSizeMinutes * 60_000)
    // Format slot times in PT — FullCalendar's timeZone prop renders the grid
    // in PT, but arg.date is a real UTC instant; format it explicitly in PT.
    const ptStart = utcToPt(start)
    const ptEnd   = utcToPt(end)
    const fmt = (pt: Date) => pt.getMinutes() === 0 ? format(pt, 'h a') : format(pt, 'h:mm a')
    return (
      <span className="text-[0.7rem] font-medium text-foreground pr-1 whitespace-nowrap">
        {fmt(ptStart)} – {fmt(ptEnd)}
      </span>
    )
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedCells(new Set())
    setBulkRate('')
  }

  function buildSelectedRows(overrides: Partial<{ rate_cents: number; is_blocked: boolean }>) {
    return Array.from(selectedCells).map(key => {
      const [dowStr, idxStr] = key.split('-')
      const dow = parseInt(dowStr, 10)
      const idx = parseInt(idxStr, 10)
      return {
        brand_id: brandId,
        day_of_week: dow,
        block_index: idx,
        // Preserve current rate if we're not overriding it
        rate_cents: overrides.rate_cents ?? rates.get(dow, idx),
        // Preserve current blocked state if we're not overriding it
        is_blocked: overrides.is_blocked ?? rates.isBlocked(dow, idx),
      }
    })
  }

  // Returns the UTC instant for PT-midnight of the target weekday in the
  // active week. Callers can then run `dateKey(returned)` (which is PT-aware)
  // or any UTC-based math.
  function dateForDow(dow: number): Date | null {
    if (!activeRange) return null
    const ptStart = utcToPt(activeRange.start)
    const startDow = ptStart.getDay()
    const offset = (dow - startDow + 7) % 7
    const ptTarget = new Date(ptStart)
    ptTarget.setDate(ptTarget.getDate() + offset)
    ptTarget.setHours(0, 0, 0, 0)
    return ptWallClockToUtc(ptTarget)
  }

  async function applyBulkRate() {
    const rate = parseFloat(bulkRate)
    if (isNaN(rate) || rate < 0) {
      toast({ title: 'Enter a valid rate', variant: 'destructive' })
      return
    }
    if (selectedCells.size === 0) {
      toast({ title: 'No shifts selected', variant: 'destructive' })
      return
    }
    if (!activeRange) {
      toast({ title: 'No active week', variant: 'destructive' })
      return
    }

    setApplying(true)
    const cents = Math.round(rate * 100)

    // Per-date overrides for THIS WEEK only — defaults remain unchanged
    const overrideRows = Array.from(selectedCells).map(key => {
      const [dowStr, idxStr] = key.split('-')
      const dow = parseInt(dowStr, 10)
      const idx = parseInt(idxStr, 10)
      const d = dateForDow(dow)
      if (!d) return null
      return {
        brand_id: brandId,
        shift_date: dateKey(d),
        block_index: idx,
        rate_cents: cents,
      }
    }).filter(Boolean) as { brand_id: string; shift_date: string; block_index: number; rate_cents: number }[]

    const supabase = createClient()
    const { error } = await supabase
      .from('brand_shift_overrides')
      .upsert(overrideRows, { onConflict: 'brand_id,shift_date,block_index' })

    setApplying(false)

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
      return
    }

    toast({
      title: `Updated ${selectedCells.size} shift${selectedCells.size === 1 ? '' : 's'} this week`,
      description: `Set to ${formatCents(cents)}/hr`,
    })
    exitSelectMode()
    router.refresh()
  }

  // "Set for all future times": snapshot the visible week's effective rates
  // as the new default template, and clear any overrides for future dates so
  // they fall back to the new template.
  async function applyAsFutureTemplate() {
    if (!activeRange) {
      toast({ title: 'No active week', variant: 'destructive' })
      return
    }
    setApplying(true)

    // Build one rate row per (dow, idx) for every cell in the visible week
    const newDefaults: { brand_id: string; day_of_week: number; block_index: number; rate_cents: number; is_blocked: boolean }[] = []
    for (let dow = 0; dow < 7; dow++) {
      const d = dateForDow(dow)
      if (!d) continue
      for (let idx = 0; idx < blockCount; idx++) {
        newDefaults.push({
          brand_id: brandId,
          day_of_week: dow,
          block_index: idx,
          rate_cents: effectiveRate(d, idx),
          is_blocked: rates.isBlocked(dow, idx), // preserve current blocked state
        })
      }
    }

    const supabase = createClient()

    // 1. Promote effective rates to defaults
    const { error: e1 } = await supabase
      .from('brand_shift_rates')
      .upsert(newDefaults, { onConflict: 'brand_id,day_of_week,block_index' })

    if (e1) {
      setApplying(false)
      toast({ title: 'Error', description: e1.message, variant: 'destructive' })
      return
    }

    // 2. Wipe overrides for dates in or after the next visible week so future
    //    weeks fall back to the new defaults
    const { error: e2 } = await supabase
      .from('brand_shift_overrides')
      .delete()
      .eq('brand_id', brandId)
      .gte('shift_date', dateKey(activeRange.end))

    setApplying(false)

    if (e2) {
      toast({ title: 'Error', description: e2.message, variant: 'destructive' })
      return
    }

    toast({
      title: 'Locked in as future template',
      description: 'This week’s rates now apply to every future week.',
    })
    exitSelectMode()
    router.refresh()
  }

  async function applyBlocked(blocked: boolean) {
    if (selectedCells.size === 0) {
      toast({ title: 'No shifts selected', variant: 'destructive' })
      return
    }
    setApplying(true)
    const rows = buildSelectedRows({ is_blocked: blocked })

    const supabase = createClient()
    const { error } = await supabase
      .from('brand_shift_rates')
      .upsert(rows, { onConflict: 'brand_id,day_of_week,block_index' })

    setApplying(false)

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
      return
    }

    toast({
      title: `${blocked ? 'Blocked' : 'Unblocked'} ${selectedCells.size} shift${selectedCells.size === 1 ? '' : 's'}`,
    })
    exitSelectMode()
    router.refresh()
  }

  return (
    <div className="h-full p-4 flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="text-xs text-muted-foreground">
          {selectMode ? 'Click any shift cell to select. Apply a rate to all selected cells.' : null}
        </div>
        {isAdmin && !selectMode && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectMode(true)}>
            <MousePointerSquareDashed className="w-3.5 h-3.5" />
            Group Selection
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          timeZone={APP_TIMEZONE}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: selectMode ? '' : 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          height="100%"
          editable={false}
          selectable={false}
          dayMaxEvents={4}
          events={allEvents}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          datesSet={(arg) => {
            setCurrentView(arg.view.type)
            setActiveRange({ start: arg.view.activeStart, end: arg.view.activeEnd })
          }}
          dayCellClassNames={(arg) => {
            // PT "today" boundary: anything ending before now (in UTC instants)
            // is past. arg.date is the UTC instant for the day's start in PT.
            const ptNow = utcToPt(new Date())
            ptNow.setHours(0, 0, 0, 0)
            const todayUtcMs = ptWallClockToUtc(ptNow).getTime()
            return arg.date.getTime() < todayUtcMs ? ['past-day'] : []
          }}
          eventContent={renderEventContent}
          eventClassNames={(arg) => {
            const out: string[] = []
            const props = arg.event.extendedProps
            const end = arg.event.end
            const start = arg.event.start
            const isPast = !!end && end.getTime() <= nowPtAsUtc().getTime()

            if (props.__conflict) out.push('conflict-cell')
            if (props.__rateLabel) {
              out.push('rate-cell')
              if (props.isBlocked) out.push('blocked-cell')
              if (isPast) out.push('past-cell')
              // Chain lock only applies to bookable future cells for non-admins
              if (!isAdmin && !isPast && !props.isBlocked && start) {
                const ptStart = utcToPt(start)
                const slotMins = ptStart.getHours() * 60 + ptStart.getMinutes()
                const idx = Math.round((slotMins - shift.dayStartMinutes) / shift.blockSizeMinutes)
                if (chainLockedAt(start, idx)) out.push('chain-locked-cell')
              }
            } else if (isPast && !props.__conflict) {
              out.push('past-stream')
            }
            // Stream tile owned by current user with a pending cancellation
            // request: subtle dashed outline so the host knows it's in flight.
            if (!props.__rateLabel && !props.__conflict && arg.event.id && pendingCancelSet.has(arg.event.id)) {
              out.push('pending-cancel')
            }
            return out
          }}
          nowIndicator={true}
          now={() => {
            // FC is set to timeZone="UTC", but our stored times are
            // PT-wall-clock encoded as UTC. The now-indicator must follow
            // the same convention so it lines up with the slot grid —
            // exactly what nowPtAsUtc() already produces.
            return nowPtAsUtc()
          }}
          slotDuration={minutesToTimeString(shift.blockSizeMinutes)}
          slotLabelInterval={minutesToTimeString(shift.blockSizeMinutes)}
          slotLabelContent={renderSlotLabel}
          slotMinTime={minutesToTimeString(shift.dayStartMinutes)}
          slotMaxTime={minutesToTimeString(shift.dayEndMinutes)}
          snapDuration={minutesToTimeString(shift.blockSizeMinutes)}
          allDaySlot={false}
          expandRows={true}
          buttonText={{
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            list: 'List',
          }}
        />
      </div>

      {/* Floating select-mode toolbar */}
      {selectMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap max-w-[95vw]">
          <div className="text-sm">
            <span className="font-semibold text-foreground">{selectedCells.size}</span>
            <span className="text-muted-foreground ml-1">
              shift{selectedCells.size === 1 ? '' : 's'} selected
            </span>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Set rate */}
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="relative w-24">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="Rate"
                value={bulkRate}
                onChange={e => setBulkRate(e.target.value)}
                className="pl-5 h-8 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">/hr</span>
            <Button
              size="sm"
              onClick={applyBulkRate}
              disabled={applying || selectedCells.size === 0 || !bulkRate}
              className="gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Set Rate
            </Button>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Promote this week's rates to the all-future template */}
          <Button
            size="sm"
            variant="outline"
            onClick={applyAsFutureTemplate}
            disabled={applying || !activeRange || currentView !== 'timeGridWeek'}
            className="gap-1.5"
            title="Snapshot this week's rates and use them as the default for every future week"
          >
            <CalendarRange className="w-3.5 h-3.5" />
            Set for all future times
          </Button>

          <div className="h-5 w-px bg-border" />

          {/* Block / Unblock */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyBlocked(true)}
            disabled={applying || selectedCells.size === 0}
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Ban className="w-3.5 h-3.5" />
            Block
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyBlocked(false)}
            disabled={applying || selectedCells.size === 0}
            className="gap-1.5"
          >
            <Unlock className="w-3.5 h-3.5" />
            Unblock
          </Button>

          <div className="h-5 w-px bg-border" />

          <Button variant="ghost" size="sm" onClick={exitSelectMode} className="gap-1.5">
            <X className="w-3.5 h-3.5" />
            Cancel
          </Button>
        </div>
      )}

      <StreamEventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        brandId={brandId}
        slot={selectedSlot}
        existingStream={selectedSlot?.existingStream ?? null}
        hosts={initialHosts}
        producers={initialProducers}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        currentHost={currentHost}
        hasPendingCancel={
          !!selectedSlot?.existingStream &&
          pendingCancelSet.has(selectedSlot.existingStream.id)
        }
      />
    </div>
  )
}
