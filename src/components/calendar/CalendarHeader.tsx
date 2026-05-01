'use client'

import { useState } from 'react'
import { Settings, DollarSign } from 'lucide-react'
import type { Brand, BrandShiftRate } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { ShiftSettingsDialog } from './ShiftSettingsDialog'
import { minutesToLabel, formatCents, DEFAULT_RATE_CENTS } from '@/lib/utils'

interface CalendarHeaderProps {
  brand: Brand
  shiftRates: BrandShiftRate[]
  canEdit: boolean
}

export function CalendarHeader({ brand, shiftRates, canEdit }: CalendarHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const blockCount = Math.floor(
    (brand.day_end_minutes - brand.day_start_minutes) / brand.block_size_minutes
  )

  const rates = shiftRates.map(r => r.rate_cents)
  const minRate = rates.length ? Math.min(...rates) : DEFAULT_RATE_CENTS
  const maxRate = rates.length ? Math.max(...rates) : DEFAULT_RATE_CENTS
  const allSame = minRate === maxRate

  return (
    <>
      <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-3 border-b border-border">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-foreground truncate">{brand.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-muted-foreground">
              {blockCount} × {brand.block_size_minutes}-min shifts ·{' '}
              {minutesToLabel(brand.day_start_minutes)} – {minutesToLabel(brand.day_end_minutes)}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
              <DollarSign className="w-3 h-3" />
              {allSame
                ? `${formatCents(minRate)}/hr (all shifts)`
                : `${formatCents(minRate)} – ${formatCents(maxRate)}/hr`}
            </span>
          </div>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="w-3.5 h-3.5" />
            Shift Settings
          </Button>
        )}
      </div>
      {canEdit && (
        <ShiftSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          brand={brand}
        />
      )}
    </>
  )
}
