import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { initialAuthHashParams, supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

// Los links de invitación (?type=invite) hacen que supabase-js dispare SIGNED_IN en vez
// de PASSWORD_RECOVERY, así que el usuario invitado quedaba logueado sin haber elegido
// nunca una contraseña. Detectamos el link de invitación explícitamente por su hash.
const isInviteLink = initialAuthHashParams.get('type') === 'invite'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        if (isInviteLink) setPasswordRecovery(true)
        loadProfile(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && isInviteLink)) {
        setPasswordRecovery(true)
      }

      setSession(newSession)
      if (newSession) {
        setLoading(true)
        loadProfile(newSession.user.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) setPasswordRecovery(false)
    return { error: error?.message ?? null }
  }

  async function resetPassword(email: string) {
    const redirectTo = `${window.location.origin}${import.meta.env.VITE_BASE_PATH ?? '/'}`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error: error?.message ?? null }
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, passwordRecovery, signIn, signOut, updatePassword, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
