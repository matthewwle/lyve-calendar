'use client'

import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { Host, Brand, Producer, StreamWithRelations } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  AlertDialogAction,
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

export type ModalMode = 'create' | 'edit' | 'view'

interface StreamEventModalProps {
  mode: ModalMode
  isOpen: boolean
  onClose: () => void
  onSave: (stream: StreamWithRelations) => void
  onDelete?: (streamId: string) => void
  initialDateRange?: { start: Date; end: Date }
  stream?: StreamWithRelations
  hosts: Host[]
  brands: Brand[]
  producers: Producer[]
  currentUserId: string
}

interface FormState {
  title: string
  brand_id: string
  host_id: string
  producer_id: string
  date: string
  start_time: string
  end_time: string
  notes: string
}

function buildFormFromStream(stream: StreamWithRelations): FormState {
  const start = parseISO(stream.start_time)
  const end = parseISO(stream.end_time)
  return {
    title: stream.title,
    brand_id: stream.brand_id,
    host_id: stream.host_id,
    producer_id: stream.producer_id ?? '',
    date: format(start, 'yyyy-MM-dd'),
    start_time: format(start, 'HH:mm'),
    end_time: format(end, 'HH:mm'),
    notes: stream.notes ?? '',
  }
}

function buildFormFromRange(range: { start: Date; end: Date }): FormState {
  return {
    title: '',
    brand_id: '',
    host_id: '',
    producer_id: '',
    date: format(range.start, 'yyyy-MM-dd'),
    start_time: format(range.start, 'HH:mm'),
    end_time: format(range.end, 'HH:mm'),
    notes: '',
  }
}

const EMPTY_FORM: FormState = {
  title: '',
  brand_id: '',
  host_id: '',
  producer_id: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '10:00',
  end_time: '12:00',
  notes: '',
}

export function StreamEventModal({
  mode,
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialDateRange,
  stream,
  hosts,
  brands,
  producers,
  currentUserId,
}: StreamEventModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (stream) {
      setForm(buildFormFromStream(stream))
    } else if (initialDateRange) {
      setForm(buildFormFromRange(initialDateRange))
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
    setSaveError(null)
  }, [isOpen, stream, initialDateRange])

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.title.trim()) e.title = 'Title is required.'
    if (!form.brand_id) e.brand_id = 'Brand is required.'
    if (!form.host_id) e.host_id = 'Host is required.'
    if (!form.producer_id) e.producer_id = 'Producer is required.'
    if (!form.date) e.date = 'Date is required.'
    if (!form.start_time) e.start_time = 'Start time is required.'
    if (!form.end_time) e.end_time = 'End time is required.'
    if (form.start_time && form.end_time && form.end_time <= form.start_time) {
      e.end_time = 'End time must be after start time.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    setSaveError(null)

    const startISO = new Date(`${form.date}T${form.start_time}:00`).toISOString()
    const endISO   = new Date(`${form.date}T${form.end_time}:00`).toISOString()

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      let result: StreamWithRelations

      if (mode === 'edit' && stream) {
        const { data, error } = await supabase
          .from('streams')
          .update({
            title:       form.title.trim(),
            brand_id:    form.brand_id,
            host_id:     form.host_id,
            producer_id: form.producer_id || null,
            start_time:  startISO,
            end_time:    endISO,
            notes:       form.notes.trim() || null,
          })
          .eq('id', stream.id)
          .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
          .single()
        if (error) throw error
        result = data as StreamWithRelations
      } else {
        const { data, error } = await supabase
          .from('streams')
          .insert({
            title:       form.title.trim(),
            brand_id:    form.brand_id,
            host_id:     form.host_id,
            producer_id: form.producer_id || null,
            start_time:  startISO,
            end_time:    endISO,
            notes:       form.notes.trim() || null,
            created_by:  currentUserId,
          })
          .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
          .single()
        if (error) throw error
        result = data as StreamWithRelations
      }

      onSave(result)
      onClose()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'An error occurred.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!stream || !onDelete) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('streams').delete().eq('id', stream.id)
      if (error) throw error
      onDelete(stream.id)
      setDeleteOpen(false)
      onClose()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete.')
    }
  }

  const isReadonly = mode === 'view'
  const title = mode === 'create' ? 'New Stream' : mode === 'edit' ? 'Edit Stream' : 'Stream Details'

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="stream-title">
                Stream Title {!isReadonly && <span className="text-destructive">*</span>}
              </Label>
              {isReadonly ? (
                <p className="text-sm text-foreground">{stream?.title}</p>
              ) : (
                <>
                  <Input
                    id="stream-title"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Nike Summer Drop"
                  />
                  {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
                </>
              )}
            </div>

            {/* Brand + Host row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stream-brand">
                  Brand {!isReadonly && <span className="text-destructive">*</span>}
                </Label>
                {isReadonly ? (
                  <p className="text-sm text-foreground">{stream?.brand.name}</p>
                ) : (
                  <>
                    <Select value={form.brand_id} onValueChange={v => setForm(f => ({ ...f, brand_id: v }))}>
                      <SelectTrigger id="stream-brand">
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.brand_id && <p className="text-xs text-destructive">{errors.brand_id}</p>}
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stream-host">
                  Host {!isReadonly && <span className="text-destructive">*</span>}
                </Label>
                {isReadonly ? (
                  <p className="text-sm text-foreground">{stream?.host.name}</p>
                ) : (
                  <>
                    <Select value={form.host_id} onValueChange={v => setForm(f => ({ ...f, host_id: v }))}>
                      <SelectTrigger id="stream-host">
                        <SelectValue placeholder="Select host" />
                      </SelectTrigger>
                      <SelectContent>
                        {hosts.map(h => (
                          <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.host_id && <p className="text-xs text-destructive">{errors.host_id}</p>}
                  </>
                )}
              </div>
            </div>

            {/* Producer */}
            <div className="space-y-1.5">
              <Label htmlFor="stream-producer">
                Producer {!isReadonly && <span className="text-destructive">*</span>}
              </Label>
              {isReadonly ? (
                <p className="text-sm text-foreground">{stream?.producer?.name ?? '—'}</p>
              ) : (
                <>
                  <Select value={form.producer_id} onValueChange={v => setForm(f => ({ ...f, producer_id: v }))}>
                    <SelectTrigger id="stream-producer">
                      <SelectValue placeholder="Select producer" />
                    </SelectTrigger>
                    <SelectContent>
                      {producers.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.producer_id && <p className="text-xs text-destructive">{errors.producer_id}</p>}
                </>
              )}
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="stream-date">
                Date {!isReadonly && <span className="text-destructive">*</span>}
              </Label>
              {isReadonly ? (
                <p className="text-sm text-foreground">{form.date}</p>
              ) : (
                <>
                  <Input
                    id="stream-date"
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                  {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
                </>
              )}
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stream-start">
                  Start Time {!isReadonly && <span className="text-destructive">*</span>}
                </Label>
                {isReadonly ? (
                  <p className="text-sm text-foreground">{form.start_time}</p>
                ) : (
                  <>
                    <Input
                      id="stream-start"
                      type="time"
                      value={form.start_time}
                      onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    />
                    {errors.start_time && <p className="text-xs text-destructive">{errors.start_time}</p>}
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stream-end">
                  End Time {!isReadonly && <span className="text-destructive">*</span>}
                </Label>
                {isReadonly ? (
                  <p className="text-sm text-foreground">{form.end_time}</p>
                ) : (
                  <>
                    <Input
                      id="stream-end"
                      type="time"
                      value={form.end_time}
                      onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    />
                    {errors.end_time && <p className="text-xs text-destructive">{errors.end_time}</p>}
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="stream-notes">Notes</Label>
              {isReadonly ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {stream?.notes || 'No notes.'}
                </p>
              ) : (
                <Textarea
                  id="stream-notes"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes for this stream…"
                  rows={3}
                />
              )}
            </div>

            {saveError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {saveError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {mode === 'edit' && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto text-destructive hover:text-destructive gap-1.5"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              {isReadonly ? 'Close' : 'Cancel'}
            </Button>
            {!isReadonly && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Stream'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stream?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this stream. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
