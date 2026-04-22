import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const BRAND_COLORS = [
  { bg: '#3B82F6', border: '#2563EB', text: '#ffffff' }, // blue
  { bg: '#8B5CF6', border: '#7C3AED', text: '#ffffff' }, // violet
  { bg: '#10B981', border: '#059669', text: '#ffffff' }, // emerald
  { bg: '#F59E0B', border: '#D97706', text: '#ffffff' }, // amber
  { bg: '#EC4899', border: '#DB2777', text: '#ffffff' }, // pink
  { bg: '#06B6D4', border: '#0891B2', text: '#ffffff' }, // cyan
  { bg: '#84CC16', border: '#65A30D', text: '#ffffff' }, // lime
  { bg: '#F97316', border: '#EA580C', text: '#ffffff' }, // orange
]

export function getBrandColor(brandId: string) {
  // Simple hash so the same brand always gets the same color
  let hash = 0
  for (let i = 0; i < brandId.length; i++) {
    hash = (hash * 31 + brandId.charCodeAt(i)) >>> 0
  }
  return BRAND_COLORS[hash % BRAND_COLORS.length]
}
