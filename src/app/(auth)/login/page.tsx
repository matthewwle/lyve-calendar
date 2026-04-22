'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tv2 } from 'lucide-react'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    const supabase = createClient()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/calendar')
        router.refresh()
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() || null },
        },
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      // If email confirmation is disabled, session is returned and we can redirect
      if (data.session) {
        router.push('/calendar')
        router.refresh()
      } else {
        setInfo('Check your email to confirm your account, then sign in.')
        setMode('signin')
        setPassword('')
        setLoading(false)
      }
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  const isSignup = mode === 'signup'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Tv2 className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Lyve</h1>
            <p className="text-sm text-muted-foreground">Internal Scheduler</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-secondary rounded-md mb-5">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`flex-1 text-sm font-medium py-1.5 rounded transition-colors ${
                mode === 'signin'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 text-sm font-medium py-1.5 rounded transition-colors ${
                mode === 'signup'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign up
            </button>
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-1">
            {isSignup ? 'Create an account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            {isSignup
              ? 'Sign up to get started with the scheduler.'
              : 'Enter your credentials to access the scheduler.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={isSignup ? 6 : undefined}
              />
              {isSignup && (
                <p className="text-[11px] text-muted-foreground">At least 6 characters.</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {info && (
              <p className="text-sm text-foreground bg-primary/10 border border-primary/30 rounded-md px-3 py-2">
                {info}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? isSignup ? 'Creating account…' : 'Signing in…'
                : isSignup ? 'Create Account' : 'Sign in'}
            </Button>
          </form>
        </div>

        {isSignup && (
          <p className="text-center text-[11px] text-muted-foreground mt-4">
            New accounts are created as regular users. Ask an admin to grant you access.
          </p>
        )}
      </div>
    </div>
  )
}
