'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/brand/BrandLogo'

export interface BrandRow {
  brandId: string
  brandName: string
  brandLogoPath: string | null
  bookedHours: number
  completedHours: number
  shiftCount: number
  uniqueHosts: number
  avgShiftMinutes: number
  fillRate: number // 0..1
}

interface DashboardViewProps {
  monthKey: string // YYYY-MM
  rows: BrandRow[]
}

type SortKey = 'brandName' | 'bookedHours' | 'completedHours' | 'shiftCount' | 'uniqueHosts' | 'fillRate'

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function fmtHours(hours: number): string {
  return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })} hr`
}

export function DashboardView({ monthKey, rows }: DashboardViewProps) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<SortKey>('bookedHours')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey] as number | string
      const bv = b[sortKey] as number | string
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = Number(av)
      const bn = Number(bv)
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return copy
  }, [rows, sortKey, sortDir])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.booked += r.bookedHours
        acc.completed += r.completedHours
        acc.shifts += r.shiftCount
        return acc
      },
      { booked: 0, completed: 0, shifts: 0 },
    )
  }, [rows])

  function changeMonth(delta: number) {
    const next = shiftMonth(monthKey, delta)
    router.push(`/admin/dashboard?month=${next}`)
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'brandName' ? 'asc' : 'desc')
    }
  }

  const SortHeader = ({ k, label, align = 'right' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors ${
        align === 'right' ? 'justify-end ml-auto' : ''
      } ${sortKey === k ? 'text-foreground' : ''}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Booking analytics by brand</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-4 py-2 min-w-[180px] text-center font-semibold text-foreground bg-card border border-border rounded-md">
            {formatMonthLabel(monthKey)}
          </div>
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatTile label="Booked hours" value={fmtHours(totals.booked)} highlight />
        <StatTile label="Completed hours" value={fmtHours(totals.completed)} subdued />
        <StatTile label="Total shifts" value={totals.shifts.toLocaleString()} />
      </div>

      {/* Brand grid */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_0.8fr_1fr_1fr] items-center gap-4 px-4 py-2.5 border-b border-border bg-secondary/40">
          <SortHeader k="brandName" label="Brand" align="left" />
          <SortHeader k="bookedHours" label="Booked" />
          <SortHeader k="completedHours" label="Completed" />
          <SortHeader k="shiftCount" label="Shifts" />
          <SortHeader k="uniqueHosts" label="Hosts" />
          <SortHeader k="fillRate" label="Fill" />
        </div>

        {sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No brands configured.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map(r => {
              const empty = r.shiftCount === 0
              return (
                <li key={r.brandId}>
                  <Link
                    href={`/admin/dashboard/${r.brandId}?month=${monthKey}`}
                    className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_0.8fr_1fr_1fr] items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="col-span-2 md:col-span-1 min-w-0 flex items-center gap-2.5">
                      <BrandLogo name={r.brandName} logoPath={r.brandLogoPath} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.brandName}</p>
                        {empty && (
                          <p className="text-[11px] text-muted-foreground italic">No bookings this month</p>
                        )}
                      </div>
                    </div>
                    <Cell label="Booked" value={fmtHours(r.bookedHours)} dim={empty} highlight={!empty} />
                    <Cell label="Completed" value={fmtHours(r.completedHours)} dim={empty} subdued />
                    <Cell label="Shifts" value={r.shiftCount.toLocaleString()} dim={empty} />
                    <Cell label="Hosts" value={r.uniqueHosts.toLocaleString()} dim={empty} />
                    <Cell
                      label="Fill"
                      value={`${(r.fillRate * 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}%`}
                      dim={empty}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  highlight,
  subdued,
}: {
  label: string
  value: string
  highlight?: boolean
  subdued?: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={
          'mt-1 text-2xl font-bold ' +
          (highlight ? 'text-primary' : subdued ? 'text-muted-foreground' : 'text-foreground')
        }
      >
        {value}
      </p>
    </div>
  )
}

function Cell({
  label,
  value,
  dim,
  highlight,
  subdued,
}: {
  label: string
  value: string
  dim?: boolean
  highlight?: boolean
  subdued?: boolean
}) {
  return (
    <div className="md:text-right">
      <p className="md:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={
          'text-sm font-medium tabular-nums ' +
          (dim
            ? 'text-muted-foreground'
            : highlight
              ? 'text-primary font-semibold'
              : subdued
                ? 'text-muted-foreground'
                : 'text-foreground')
        }
      >
        {value}
      </p>
    </div>
  )
}
