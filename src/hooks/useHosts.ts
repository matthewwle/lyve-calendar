import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Host } from '@/lib/supabase/types'

export function useHosts(initialHosts?: Host[]) {
  const [hosts, setHosts] = useState<Host[]>(initialHosts ?? [])
  const [loading, setLoading] = useState(!initialHosts)
  const fetched = useRef(false)

  useEffect(() => {
    if (initialHosts || fetched.current) return
    fetched.current = true
    const supabase = createClient()
    supabase.from('hosts').select('*').order('name').then(({ data }) => {
      if (data) setHosts(data)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { hosts, loading }
}
