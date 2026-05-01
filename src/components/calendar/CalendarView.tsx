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
import { MousePointerSquareDashed, X, Check, Ban, Unlock, DollarSign } from 'lucide-react'
import { streamsToEvents } from '@/hooks/useStreams'
import { StreamEventModal } from './StreamEventModal'
import type { StreamWithRelations, Host, Producer, BrandShiftRate } from '@/lib/supabase/types'
import { useToast } from '@/hooks/use-toast'
import {
  minutesToTimeString,
  formatCents,
  buildRateLookup,
  rateKey,
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

interface CalendarViewProps {
  brandId: string
  initialStreams: StreamWithRelations[]
  initialHosts: Host[]
  initialProducers: Producer[]
  initialShiftRates: BrandShiftRate[]
  shift: ShiftConfig
  isAdmin: boolean
  currentUserId: string
  currentHost: { id: string; name: string } | null
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
  shift,
  isAdmin,
  currentUserId,
  currentHost,
}: CalendarViewProps) {
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

  const blockCount = useMemo(
    () => Math.max(0, Math.floor((shift.dayEndMinutes - shift.dayStartMinutes) / shift.blockSizeMinutes)),
    [shift]
  )

  const rates = useMemo(() => buildRateLookup(initialShiftRates), [initialShiftRates])

  useEffect(() => {
    if (selectMode) calendarRef.current?.getApi().changeView('timeGridWeek')
  }, [selectMode])

  function blockIndexFromMinutes(slotMins: number): number {
    return Math.round((slotMins - shift.dayStartMinutes) / shift.blockSizeMinutes)
  }

  function snapToCell(date: Date): { start: Date; end: Date; dow: number; idx: number } | null {
    const slotMins = date.getHours() * 60 + date.getMinutes()
    const idx = blockIndexFromMinutes(slotMins)
    if (idx < 0 || idx >= blockCount) return null
    const dow = date.getDay()
    const blockStartMins = shift.dayStartMinutes + idx * shift.blockSizeMinutes
    const blockEndMins   = shift.dayStartMinutes + (idx + 1) * shift.blockSizeMinutes

    // Anchor at local midnight, then add minutes via millisecond math
    // (avoids setMinutes adding to existing hours)
    const midnight = new Date(date)
    midnight.setHours(0, 0, 0, 0)
    const start = new Date(midnight.getTime() + blockStartMins * 60_000)
    const end   = new Date(midnight.getTime() + blockEndMins   * 60_000)

    return { start, end, dow, idx }
  }

  const events = useMemo(() => streamsToEvents(streams), [streams])

  // Used to detect "this cell already has a booked stream"
  const occupiedSlotTimes = useMemo(
    () => new Set(streams.map(s => new Date(s.start_time).getTime())),
    [streams]
  )

  // Background events: one per (day_of_week × block_index) so each cell shows
  // its specific rate, and selected cells get highlighted in select mode.
  const cellEvents: EventInput[] = useMemo(() => {
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
  }, [blockCount, shift.dayStartMinutes, shift.blockSizeMinutes, rates, selectMode, selectedCells, isAdmin])

  const allEvents: EventInput[] = useMemo(
    () => (selectMode ? cellEvents : [...cellEvents, ...events]),
    [selectMode, cellEvents, events]
  )

  function openSlotForDate(date: Date) {
    const cell = snapToCell(date)
    if (!cell) return
    // Hosts can't open blocked slots
    if (!isAdmin && rates.isBlocked(cell.dow, cell.idx)) return
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
    if (clickInfo.event.extendedProps.__rateLabel) return
    const start = clickInfo.event.start
    if (!start) return
    if (selectMode) {
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
    openSlotForDate(start)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, streams, blockCount, shift.dayStartMinutes, shift.blockSizeMinutes, rates])

  const handleDateClick = useCallback((info: DateClickArg) => {
    if (selectMode) {
      const cell = snapToCell(info.date)
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
  }

  function handleDelete(streamId: string) {
    setStreams(prev => prev.filter(s => s.id !== streamId))
    toast({ title: 'Shift cleared' })
  }

  function renderEventContent(eventInfo: EventContentArg) {
    if (eventInfo.event.extendedProps.__rateLabel) {
      const cents = eventInfo.event.extendedProps.rateCents as number
      const isBlocked = eventInfo.event.extendedProps.isBlocked as boolean

      // Past cells render at a slightly muted tone but still show the rate —
      // unless a stream actually happened here, in which case we let the
      // booked-shift event own that cell visually.
      const cellEnd = eventInfo.event.end
      const isPast = !!cellEnd && cellEnd.getTime() <= Date.now()
      const cellStartMs = eventInfo.event.start?.getTime()
      const hasStream = cellStartMs !== undefined && occupiedSlotTimes.has(cellStartMs)
      const hideRate = isPast && hasStream

      return (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {isBlocked ? (
            <X className="text-destructive/70" strokeWidth={2.5} style={{ width: '60%', height: '60%' }} />
          ) : hideRate ? null : (
            <span className={`text-xl font-bold tracking-tight ${isPast ? 'text-primary/60' : 'text-primary'}`}>
              {formatCents(cents)}/hr
            </span>
          )}
        </div>
      )
    }
    return (
      <div className="absolute inset-0 flex items-center justify-center px-2 text-center overflow-hidden">
        <span className="text-base font-bold text-white leading-tight tracking-tight">
          {eventInfo.event.title}
        </span>
      </div>
    )
  }

  function renderSlotLabel(arg: SlotLabelContentArg) {
    return <span className="text-[0.72rem] text-foreground pr-1">{arg.text}</span>
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

    setApplying(true)
    const cents = Math.round(rate * 100)
    const rows = buildSelectedRows({ rate_cents: cents })

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
      title: `Updated ${selectedCells.size} shift${selectedCells.size === 1 ? '' : 's'}`,
      description: `Set to ${formatCents(cents)}/hr`,
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
          eventContent={renderEventContent}
          eventClassNames={(arg) => {
            const end = arg.event.end
            if (!end || end.getTime() > Date.now()) return []
            return arg.event.extendedProps.__rateLabel ? ['past-cell'] : ['past-stream']
          }}
          nowIndicator={true}
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
        onDelete={isAdmin ? handleDelete : undefined}
        brandId={brandId}
        slot={selectedSlot}
        existingStream={selectedSlot?.existingStream ?? null}
        hosts={initialHosts}
        producers={initialProducers}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        currentHost={currentHost}
      />
    </div>
  )
}
