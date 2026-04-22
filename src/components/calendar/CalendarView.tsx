'use client'

import { useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import type { EventContentArg, DateSelectArg, EventClickArg } from '@fullcalendar/core'
import { streamsToEvents } from '@/hooks/useStreams'
import { StreamEventModal, type ModalMode } from './StreamEventModal'
import type { StreamWithRelations, Host, Brand } from '@/lib/supabase/types'
import { useToast } from '@/hooks/use-toast'

interface CalendarViewProps {
  initialStreams: StreamWithRelations[]
  initialHosts: Host[]
  initialBrands: Brand[]
  isAdmin: boolean
  currentUserId: string
}

export function CalendarView({
  initialStreams,
  initialHosts,
  initialBrands,
  isAdmin,
  currentUserId,
}: CalendarViewProps) {
  const [streams, setStreams] = useState<StreamWithRelations[]>(initialStreams)
  const { toast } = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [selectedStream, setSelectedStream] = useState<StreamWithRelations | undefined>()
  const [selectedRange, setSelectedRange] = useState<{ start: Date; end: Date } | undefined>()

  const events = streamsToEvents(streams)

  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    if (!isAdmin) return
    setSelectedStream(undefined)
    setSelectedRange({ start: selectInfo.start, end: selectInfo.end })
    setModalMode('create')
    setModalOpen(true)
    selectInfo.view.calendar.unselect()
  }, [isAdmin])

  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    const streamId = clickInfo.event.extendedProps.streamId as string
    const stream = streams.find(s => s.id === streamId)
    if (!stream) return
    setSelectedStream(stream)
    setSelectedRange(undefined)
    setModalMode(isAdmin ? 'edit' : 'view')
    setModalOpen(true)
  }, [streams, isAdmin])

  function handleSave(savedStream: StreamWithRelations) {
    setStreams(prev => {
      const exists = prev.find(s => s.id === savedStream.id)
      return exists
        ? prev.map(s => s.id === savedStream.id ? savedStream : s)
        : [...prev, savedStream]
    })
    toast({
      title: modalMode === 'edit' ? 'Stream updated' : 'Stream created',
    })
  }

  function handleDelete(streamId: string) {
    setStreams(prev => prev.filter(s => s.id !== streamId))
    toast({ title: 'Stream deleted' })
  }

  function renderEventContent(eventInfo: EventContentArg) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
        <span className="truncate text-[0.72rem] font-medium leading-tight">{eventInfo.event.title}</span>
      </div>
    )
  }

  return (
    <div className="h-full p-4 flex flex-col">
      <div className="flex-1 min-h-0">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          height="100%"
          editable={false}
          selectable={isAdmin}
          selectMirror={true}
          dayMaxEvents={4}
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          nowIndicator={true}
          buttonText={{
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            list: 'List',
          }}
        />
      </div>

      <StreamEventModal
        mode={modalMode}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={isAdmin ? handleDelete : undefined}
        initialDateRange={selectedRange}
        stream={selectedStream}
        hosts={initialHosts}
        brands={initialBrands}
        currentUserId={currentUserId}
      />
    </div>
  )
}
