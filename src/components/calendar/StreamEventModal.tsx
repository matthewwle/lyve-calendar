'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Trash2, DollarSign, Hand, X as XIcon, CalendarRange, UserCircle2, AlarmClock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { Host, Producer, StreamWithRelations } from '@/lib/supabase/types'
import { HostProfileDialog } from '@/components/profile/HostProfileDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCents } from '@/lib/utils'

const NONE = '__none__'

interface SlotInfo {
  start: Date
  end: Date
  rateCents: number
}

interface StreamEventModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (stream: StreamWithRelations) => void
  onDelete?: (streamId: string) => void
  brandId: string
  slot: SlotInfo | null
  existingStream: StreamWithRelations | null
  hosts: Host[]
  producers: Producer[]
  isAdmin: boolean
  currentUserId: string
  currentHost: { id: string; name: string } | null
}

export function StreamEventModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  brandId,
  slot,
  existingStream,
  hosts,
  producers,
  isAdmin,
  currentUserId,
  currentHost,
}: StreamEventModalProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [profileOpen, setProfileOpen] = useState(false)
  const [hostId, setHostId] = useState<string>('')
  const [producerId, setProducerId] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setHostId(existingStream?.host_id ?? '')
    setProducerId(existingStream?.producer_id ?? '')
    setNotes(existingStream?.notes ?? '')
    setError(null)
  }, [isOpen, existingStream])

  if (!slot) return null

  const durationMinutes = (slot.end.getTime() - slot.start.getTime()) / 60000
  const totalCents = Math.round((slot.rateCents * durationMinutes) / 60)
  const isPast = slot.end.getTime() <= Date.now()

  const hostName = hosts.find(h => h.id === hostId)?.name
  const producerName = producers.find(p => p.id === producerId)?.name

  async function handleSave() {
    if (!isAdmin || !slot) return
    setSaving(true)
    setError(null)

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const payload = {
      brand_id:    brandId,
      host_id:     hostId || null,
      producer_id: producerId || null,
      notes:       notes.trim() || null,
      start_time:  slot.start.toISOString(),
      end_time:    slot.end.toISOString(),
      created_by:  currentUserId,
      title:       null,
    }

    try {
      let result: StreamWithRelations
      if (existingStream) {
        const { data, error } = await supabase
          .from('streams')
          .update({
            host_id:     payload.host_id,
            producer_id: payload.producer_id,
            notes:       payload.notes,
          })
          .eq('id', existingStream.id)
          .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
          .single()
        if (error) throw error
        result = data as StreamWithRelations
      } else {
        const { data, error } = await supabase
          .from('streams')
          .insert(payload)
          .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
          .single()
        if (error) throw error
        result = data as StreamWithRelations
      }

      onSave(result)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  // All matching dates in the same calendar month at the same time-of-day +
  // weekday as `slot`. Used for whole-month booking and admin "clear month".
  function matchingDatesInMonth(): { start: Date; end: Date }[] {
    if (!slot) return []
    const monthStart = new Date(slot.start.getFullYear(), slot.start.getMonth(), 1)
    const monthEnd   = new Date(slot.start.getFullYear(), slot.start.getMonth() + 1, 1)
    const targetDow  = slot.start.getDay()
    const sH = slot.start.getHours()
    const sM = slot.start.getMinutes()
    const durationMs = slot.end.getTime() - slot.start.getTime()

    const out: { start: Date; end: Date }[] = []
    for (let d = new Date(monthStart); d < monthEnd; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== targetDow) continue
      const cellStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sH, sM, 0)
      const cellEnd = new Date(cellStart.getTime() + durationMs)
      out.push({ start: cellStart, end: cellEnd })
    }
    return out
  }

  async function handleDelete() {
    if (!existingStream || !onDelete) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.from('streams').delete().eq('id', existingStream.id)
    if (error) {
      setError(error.message)
      return
    }
    onDelete(existingStream.id)
    setDeleteOpen(false)
    onClose()
  }

  async function handleDeleteMonth() {
    if (!slot || !onDelete) return
    setSaving(true)
    setError(null)

    const monthStart = new Date(slot.start.getFullYear(), slot.start.getMonth(), 1)
    const monthEnd   = new Date(slot.start.getFullYear(), slot.start.getMonth() + 1, 1)
    const targetDow  = slot.start.getDay()
    const sH = slot.start.getHours()
    const sM = slot.start.getMinutes()
    const durationMs = slot.end.getTime() - slot.start.getTime()
    const nowMs = Date.now()

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    // Fetch all candidate streams in the month
    const { data: candidates, error: fetchErr } = await supabase
      .from('streams')
      .select('id, start_time')
      .eq('brand_id', brandId)
      .gte('start_time', monthStart.toISOString())
      .lt('start_time', monthEnd.toISOString())

    if (fetchErr) {
      setSaving(false)
      setError(fetchErr.message)
      return
    }

    // Match weekday + time-of-day, then split into future (deletable) vs past (kept).
    // Past shifts are the historical record and must never be deleted.
    let pastSkipped = 0
    const idsToDelete: string[] = []
    for (const s of candidates ?? []) {
      const sd = new Date(s.start_time)
      if (sd.getDay() !== targetDow || sd.getHours() !== sH || sd.getMinutes() !== sM) continue
      const sEndMs = sd.getTime() + durationMs
      if (sEndMs <= nowMs) {
        pastSkipped++
        continue
      }
      idsToDelete.push(s.id as string)
    }

    if (idsToDelete.length === 0) {
      setSaving(false)
      setError(
        pastSkipped > 0
          ? `Only past shifts match — those are kept as history and can't be cleared.`
          : 'No matching shifts found in this month.'
      )
      return
    }

    const { error: delErr } = await supabase.from('streams').delete().in('id', idsToDelete)

    setSaving(false)
    if (delErr) { setError(delErr.message); return }

    for (const id of idsToDelete) onDelete(id)

    toast({
      title: `Cleared ${idsToDelete.length} future shift${idsToDelete.length === 1 ? '' : 's'}`,
      description: pastSkipped > 0
        ? `${pastSkipped} past shift${pastSkipped === 1 ? '' : 's'} kept as history.`
        : undefined,
    })

    setDeleteOpen(false)
    onClose()
  }

  async function handleBookShift() {
    if (!slot || !currentHost) return
    setSaving(true)
    setError(null)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    // Whole-month auto-fill: book this slot AND every other matching weekday
    // slot in the same calendar month. Each call is validated by book_shift
    // (past, blocked, taken-by-other, conflicts, chain rule), so individual
    // dates may be skipped.
    const dates = matchingDatesInMonth().filter(({ end }) => end.getTime() > Date.now())

    let booked = 0
    let skipped = 0
    const errors: string[] = []
    const bookedStartTimes: string[] = []

    for (const { start: s, end: e } of dates) {
      const { error } = await supabase.rpc('book_shift', {
        p_brand_id:   brandId,
        p_start_time: s.toISOString(),
        p_end_time:   e.toISOString(),
      })
      if (error) {
        skipped++
        errors.push(`${format(s, 'MMM d')}: ${error.message}`)
      } else {
        booked++
        bookedStartTimes.push(s.toISOString())
      }
    }

    // Pull the actual stream rows for everything we just booked so local
    // calendar state updates immediately — no hard refresh required.
    if (bookedStartTimes.length > 0) {
      const { data: newStreams } = await supabase
        .from('streams')
        .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
        .eq('brand_id', brandId)
        .in('start_time', bookedStartTimes)
      for (const s of (newStreams ?? []) as StreamWithRelations[]) {
        onSave(s)
      }
    }

    setSaving(false)

    if (booked === 0) {
      setError(errors[0] ?? 'No shifts could be booked.')
      return
    }

    toast({
      title: `Booked ${booked} shift${booked === 1 ? '' : 's'}`,
      description: skipped > 0
        ? `${skipped} skipped (already taken, blocked, or chain-locked).`
        : undefined,
    })
    router.refresh()
    onClose()
  }

  async function handleUnbookShift() {
    if (!slot || !currentHost) return
    setSaving(true)
    setError(null)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    // Mirror the booking flow: cancel every matching weekday slot in this
    // calendar month that this host has claimed.
    const dates = matchingDatesInMonth().filter(({ end }) => end.getTime() > Date.now())
    const targetTimes = dates.map(d => d.start.toISOString())

    if (targetTimes.length === 0) {
      setSaving(false)
      setError('Nothing to cancel.')
      return
    }

    // Fetch all my matching streams in one query so we can mirror the
    // server's delete-vs-clear behavior in local state.
    const { data: myStreamsData } = await supabase
      .from('streams')
      .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
      .eq('brand_id', brandId)
      .eq('host_id', currentHost.id)
      .in('start_time', targetTimes)

    const myStreams = (myStreamsData ?? []) as StreamWithRelations[]

    let cancelled = 0
    let skipped = 0
    for (const s of myStreams) {
      const { error } = await supabase.rpc('unbook_shift', {
        p_brand_id:   brandId,
        p_start_time: s.start_time,
      })
      if (error) {
        skipped++
        continue
      }
      cancelled++
      if (s.producer_id === null) {
        onDelete?.(s.id)
      } else {
        onSave({ ...s, host_id: null, host: null })
      }
    }

    setSaving(false)

    if (cancelled === 0) {
      setError('No shifts could be cancelled.')
      return
    }

    toast({
      title: `Cancelled ${cancelled} shift${cancelled === 1 ? '' : 's'}`,
      description: skipped > 0 ? `${skipped} could not be cancelled.` : undefined,
    })
    router.refresh()
    onClose()
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Shift Details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date + time + rate header card */}
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {format(slot.start, 'EEEE, MMMM d')}
                </p>
                {isPast && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    Past shift
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {format(slot.start, 'h:mm a')} – {format(slot.end, 'h:mm a')}
              </p>
              <p className="inline-flex items-center gap-1 text-xs text-primary font-medium pt-0.5">
                <DollarSign className="w-3 h-3" />
                {formatCents(slot.rateCents)}/hr · {formatCents(totalCents)} total
              </p>
            </div>

            {/* Arrival disclaimer — hosts only, future shifts */}
            {!isAdmin && currentHost && !isPast && (
              <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5 flex items-start gap-2.5">
                <AlarmClock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-foreground">
                  <p className="font-semibold">Arrive 30 minutes early</p>
                  <p className="text-muted-foreground mt-0.5">
                    Be on set by{' '}
                    <span className="text-foreground font-medium">
                      {format(new Date(slot.start.getTime() - 30 * 60_000), 'h:mm a')}
                    </span>{' '}
                    so we&apos;re ready to go live at{' '}
                    <span className="text-foreground font-medium">
                      {format(slot.start, 'h:mm a')}
                    </span>.
                  </p>
                </div>
              </div>
            )}

            {/* Host */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="slot-host">Host</Label>
                {isAdmin && hostId && (
                  <button
                    type="button"
                    onClick={() => setProfileOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <UserCircle2 className="w-3 h-3" />
                    View profile
                  </button>
                )}
              </div>
              {isAdmin ? (
                <Select
                  value={hostId || NONE}
                  onValueChange={v => setHostId(v === NONE ? '' : v)}
                >
                  <SelectTrigger id="slot-host">
                    <SelectValue placeholder="Not filled yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not filled yet</SelectItem>
                    {hosts.map(h => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className={`text-sm ${hostName ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                  {hostName ?? 'Not filled yet'}
                </p>
              )}
            </div>

            {/* Producer */}
            <div className="space-y-1.5">
              <Label htmlFor="slot-producer">Producer</Label>
              {isAdmin ? (
                <Select
                  value={producerId || NONE}
                  onValueChange={v => setProducerId(v === NONE ? '' : v)}
                >
                  <SelectTrigger id="slot-producer">
                    <SelectValue placeholder="Not filled yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not filled yet</SelectItem>
                    {producers.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className={`text-sm ${producerName ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                  {producerName ?? 'Not filled yet'}
                </p>
              )}
            </div>

            {/* Notes — admin can edit, hosts can read */}
            {isAdmin ? (
              <div className="space-y-1.5">
                <Label htmlFor="slot-notes">
                  Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="slot-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any notes for this shift…"
                  rows={2}
                />
              </div>
            ) : notes ? (
              <div className="space-y-1.5">
                <Label>Notes from admin</Label>
                <div className="text-sm text-foreground whitespace-pre-wrap rounded-md border border-border bg-secondary/30 px-3 py-2">
                  {notes}
                </div>
              </div>
            ) : null}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {isAdmin && existingStream && onDelete && !isPast && (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto text-destructive hover:text-destructive gap-1.5"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              {isAdmin ? 'Cancel' : 'Close'}
            </Button>

            {/* Admin: save changes */}
            {isAdmin && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}

            {/* Host: book / cancel — locked entirely once the shift has ended */}
            {!isAdmin && currentHost && isPast && (
              <span className="text-xs text-muted-foreground italic self-center">
                This shift has ended.
              </span>
            )}

            {!isAdmin && currentHost && !isPast && (() => {
              const claimedByMe = existingStream?.host_id === currentHost.id
              const taken = !!existingStream?.host_id && !claimedByMe
              if (claimedByMe) {
                const cancelWeekday = format(slot.start, 'EEEE')
                const cancelMonth = format(slot.start, 'MMMM')
                return (
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      variant="outline"
                      onClick={handleUnbookShift}
                      disabled={saving}
                      className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                      {saving ? 'Cancelling…' : `Cancel every ${cancelWeekday} in ${cancelMonth}`}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      Removes you from every {cancelWeekday} this month at this time
                    </span>
                  </div>
                )
              }
              if (taken) return null // someone else has it; no button
              const matchCount = matchingDatesInMonth().filter(({ end }) => end.getTime() > Date.now()).length
              const weekday = format(slot.start, 'EEEE')
              const monthName = format(slot.start, 'MMMM')
              return (
                <div className="flex flex-col items-end gap-1">
                  <Button onClick={handleBookShift} disabled={saving} className="gap-1.5">
                    <Hand className="w-3.5 h-3.5" />
                    {saving ? 'Booking…' : `Book all ${matchCount} ${weekday}${matchCount === 1 ? '' : 's'} in ${monthName}`}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Auto-fills every {weekday} this month at the same time
                  </span>
                </div>
              )
            })()}

            {/* Host without a linked profile */}
            {!isAdmin && !currentHost && (
              <span className="text-xs text-muted-foreground italic self-center">
                Link your account to a host profile to book shifts.
              </span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear future shifts</AlertDialogTitle>
            <AlertDialogDescription>
              Past shifts are preserved as history and can&apos;t be deleted — only future ones are affected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 flex-col-reverse sm:flex-row sm:justify-between">
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={saving}
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Just this shift
              </Button>
              <Button
                onClick={handleDeleteMonth}
                disabled={saving}
                className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <CalendarRange className="w-3.5 h-3.5" />
                {saving ? 'Clearing…' : `Every ${format(slot.start, 'EEEE')} in ${format(slot.start, 'MMMM')}`}
              </Button>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin profile viewer for the assigned host */}
      {isAdmin && (
        <HostProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          userId={hosts.find(h => h.id === hostId)?.user_id ?? null}
          displayName={hostName ?? 'Host'}
        />
      )}
    </>
  )
}
