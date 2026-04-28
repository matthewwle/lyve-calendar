import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StreamWithRelations } from '@/lib/supabase/types'
import type { CalendarEvent } from '@/types'
import { getBrandColor } from '@/lib/utils'

export function streamsToEvents(streams: StreamWithRelations[]): CalendarEvent[] {
  return streams.map(s => {
    const color = getBrandColor(s.brand_id)
    return {
      id: s.id,
      title: `${s.brand.name} × ${s.host.name}`,
      start: s.start_time,
      end: s.end_time,
      backgroundColor: color.bg,
      borderColor: color.border,
      textColor: color.text,
      extendedProps: {
        hostName:     s.host.name,
        brandName:    s.brand.name,
        producerName: s.producer?.name ?? null,
        notes:        s.notes,
        streamId:     s.id,
        hostId:       s.host_id,
        brandId:      s.brand_id,
        producerId:   s.producer_id,
      },
    }
  })
}

export function useStreams(initialStreams: StreamWithRelations[]) {
  const [streams, setStreams] = useState<StreamWithRelations[]>(initialStreams)
  const supabase = createClient()

  async function refreshStreams() {
    const { data } = await supabase
      .from('streams')
      .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
      .order('start_time')
    if (data) setStreams(data as StreamWithRelations[])
  }

  async function createStream(payload: {
    title: string
    brand_id: string
    host_id: string
    producer_id: string | null
    start_time: string
    end_time: string
    notes: string | null
    created_by: string
  }) {
    const { data, error } = await supabase
      .from('streams')
      .insert(payload)
      .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
      .single()

    if (error) throw error
    const newStream = data as StreamWithRelations
    setStreams(prev => [...prev, newStream])
    return newStream
  }

  async function updateStream(id: string, payload: {
    title?: string
    brand_id?: string
    host_id?: string
    producer_id?: string | null
    start_time?: string
    end_time?: string
    notes?: string | null
  }) {
    const { data, error } = await supabase
      .from('streams')
      .update(payload)
      .eq('id', id)
      .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
      .single()

    if (error) throw error
    const updated = data as StreamWithRelations
    setStreams(prev => prev.map(s => s.id === id ? updated : s))
    return updated
  }

  async function deleteStream(id: string) {
    const { error } = await supabase.from('streams').delete().eq('id', id)
    if (error) throw error
    setStreams(prev => prev.filter(s => s.id !== id))
  }

  return { streams, createStream, updateStream, deleteStream, refreshStreams }
}
