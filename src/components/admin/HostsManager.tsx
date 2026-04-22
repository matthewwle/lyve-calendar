'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Link as LinkIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Host, Profile } from '@/lib/supabase/types'
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
}

interface FormState {
  name: string
  email: string
  user_id: string
}

const EMPTY_FORM: FormState = { name: '', email: '', user_id: '' }

export function HostsManager({ initialHosts, profiles }: HostsManagerProps) {
  const [hosts, setHosts] = useState<Host[]>(initialHosts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingHost, setEditingHost] = useState<Host | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const supabase = createClient()

  function openCreate() {
    setEditingHost(null)
    setForm(EMPTY_FORM)
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(host: Host) {
    setEditingHost(host)
    setForm({ name: host.name, email: host.email ?? '', user_id: host.user_id ?? '' })
    setError(null)
    setDialogOpen(true)
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

    if (editingHost) {
      const { data, error } = await supabase
        .from('hosts')
        .update(payload)
        .eq('id', editingHost.id)
        .select()
        .single()

      if (error) { setError(error.message); setSaving(false); return }
      setHosts(prev => prev.map(h => h.id === editingHost.id ? data : h))
      toast({ title: 'Host updated' })
    } else {
      const { data, error } = await supabase
        .from('hosts')
        .insert(payload)
        .select()
        .single()

      if (error) { setError(error.message); setSaving(false); return }
      setHosts(prev => [...prev, data])
      toast({ title: 'Host added' })
    }

    setSaving(false)
    setDialogOpen(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('hosts').delete().eq('id', id)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      setHosts(prev => prev.filter(h => h.id !== id))
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
          <p className="text-sm text-muted-foreground mt-0.5">Manage stream hosts and their linked accounts.</p>
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
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((host, i) => {
                const linkedProfile = host.user_id ? profileMap.get(host.user_id) : null
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
        <DialogContent className="sm:max-w-md">
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
              <Label htmlFor="host-email">Email</Label>
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
              This will permanently delete this host. You cannot delete a host that has streams assigned to them.
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
