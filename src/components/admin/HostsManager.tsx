'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Link as LinkIcon, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Brand, BrandHost, Host, Profile } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { useToast } from '@/hooks/use-toast'

interface HostsManagerProps {
  initialHosts: Host[]
  profiles: Profile[]
  brands: Brand[]
  initialBrandHosts: BrandHost[]
}

interface FormState {
  name: string
  email: string
  user_id: string
  brandIds: Set<string>
}

const EMPTY_FORM: FormState = { name: '', email: '', user_id: '', brandIds: new Set() }

export function HostsManager({ initialHosts, profiles, brands, initialBrandHosts }: HostsManagerProps) {
  const [hosts, setHosts] = useState<Host[]>(initialHosts)
  const [brandHosts, setBrandHosts] = useState<BrandHost[]>(initialBrandHosts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingHost, setEditingHost] = useState<Host | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const supabase = createClient()

  // Map host_id → set of brand_ids they have access to
  const hostBrandMap = new Map<string, Set<string>>()
  for (const row of brandHosts) {
    if (!hostBrandMap.has(row.host_id)) hostBrandMap.set(row.host_id, new Set())
    hostBrandMap.get(row.host_id)!.add(row.brand_id)
  }

  function openCreate() {
    setEditingHost(null)
    // New hosts default to all brands so admins don't have to assign one-by-one for the common case
    setForm({ ...EMPTY_FORM, brandIds: new Set(brands.map(b => b.id)) })
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(host: Host) {
    setEditingHost(host)
    setForm({
      name: host.name,
      email: host.email ?? '',
      user_id: host.user_id ?? '',
      brandIds: new Set(hostBrandMap.get(host.id) ?? []),
    })
    setError(null)
    setDialogOpen(true)
  }

  function toggleBrand(brandId: string) {
    setForm(f => {
      const next = new Set(f.brandIds)
      if (next.has(brandId)) next.delete(brandId)
      else next.add(brandId)
      return { ...f, brandIds: next }
    })
  }

  async function syncBrandAssignments(hostId: string, desired: Set<string>) {
    const current = hostBrandMap.get(hostId) ?? new Set<string>()
    const toAdd    = Array.from(desired).filter(b => !current.has(b))
    const toRemove = Array.from(current).filter(b => !desired.has(b))

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from('brand_hosts')
        .insert(toAdd.map(brand_id => ({ brand_id, host_id: hostId })))
      if (error) throw error
    }
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('brand_hosts')
        .delete()
        .eq('host_id', hostId)
        .in('brand_id', toRemove)
      if (error) throw error
    }

    // Update local state
    setBrandHosts(prev => {
      const filtered = prev.filter(r => !(r.host_id === hostId && toRemove.includes(r.brand_id)))
      const added: BrandHost[] = toAdd.map(brand_id => ({
        brand_id,
        host_id: hostId,
        created_at: new Date().toISOString(),
      }))
      return [...filtered, ...added]
    })
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      user_id: form.user_id || null,
    }

    try {
      let hostId: string
      if (editingHost) {
        const { data, error } = await supabase
          .from('hosts')
          .update(payload)
          .eq('id', editingHost.id)
          .select()
          .single()
        if (error) throw error
        hostId = data.id
        setHosts(prev => prev.map(h => h.id === editingHost.id ? data : h))
      } else {
        const { data, error } = await supabase
          .from('hosts')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        hostId = data.id
        setHosts(prev => [...prev, data])
      }

      await syncBrandAssignments(hostId, form.brandIds)

      toast({ title: editingHost ? 'Host updated' : 'Host added' })
      setDialogOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('hosts').delete().eq('id', id)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      setHosts(prev => prev.filter(h => h.id !== id))
      setBrandHosts(prev => prev.filter(r => r.host_id !== id))
      toast({ title: 'Host deleted' })
    }
    setDeleteId(null)
  }

  const profileMap = new Map(profiles.map(p => [p.id, p]))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Hosts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage stream hosts, their linked accounts, and which brands they can book.</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Host
        </Button>
      </div>

      {hosts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No hosts yet. Add your first host to get started.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Name</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Email</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Linked User</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Brands</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((host, i) => {
                const linkedProfile = host.user_id ? profileMap.get(host.user_id) : null
                const accessibleCount = hostBrandMap.get(host.id)?.size ?? 0
                const allBrands = accessibleCount === brands.length && brands.length > 0
                return (
                  <tr key={host.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-secondary/20'}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{host.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{host.email || '—'}</td>
                    <td className="px-4 py-3">
                      {linkedProfile ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <LinkIcon className="w-2.5 h-2.5" />
                          {linkedProfile.email}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {accessibleCount === 0 ? (
                        <span className="text-muted-foreground text-xs italic">None</span>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Building2 className="w-2.5 h-2.5" />
                          {allBrands ? 'All brands' : `${accessibleCount} of ${brands.length}`}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(host)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(host.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingHost ? 'Edit Host' : 'Add Host'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="host-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="host-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Host name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="host-email">
                Email <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="host-email"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="host@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="host-user">Linked Profile</Label>
              <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v === 'none' ? '' : v }))}>
                <SelectTrigger id="host-user">
                  <SelectValue placeholder="No linked account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked account</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ? `${p.full_name} (${p.email})` : p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Linked users can log in and view their assigned streams.</p>
            </div>

            {/* Brand assignments */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Brand Access</Label>
                {brands.length > 0 && (
                  <div className="flex gap-3 text-[11px]">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setForm(f => ({ ...f, brandIds: new Set(brands.map(b => b.id)) }))}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:underline"
                      onClick={() => setForm(f => ({ ...f, brandIds: new Set() }))}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              {brands.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No brands exist yet.</p>
              ) : (
                <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y divide-border">
                  {brands.map(b => {
                    const checked = form.brandIds.has(b.id)
                    return (
                      <label
                        key={b.id}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-secondary/50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBrand(b.id)}
                          className="w-3.5 h-3.5 accent-primary"
                        />
                        <span className="text-sm text-foreground">{b.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {form.brandIds.size} of {brands.length} brand{brands.length === 1 ? '' : 's'} selected. Hosts only see calendars for brands they&apos;re assigned to.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingHost ? 'Save Changes' : 'Add Host'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Host?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this host and remove all their brand assignments. You cannot delete a host that has streams assigned to them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
