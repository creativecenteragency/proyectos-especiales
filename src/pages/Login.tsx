import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { t } = useTranslation()
  const { session, signIn, resetPassword } = useAuth()
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setSubmitting(false)
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await resetPassword(email)
    if (error) setError(error)
    else setResetSent(true)
    setSubmitting(false)
  }

  function backToSignIn() {
    setMode('signin')
    setError(null)
    setResetSent(false)
  }

  if (session) return <Navigate to="/" replace />

  if (mode === 'forgot') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cream px-4 relative">
        <LanguageSwitcher className="absolute top-4 right-4" />
        <form
          onSubmit={handleForgotPassword}
          className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-brand-line p-8 space-y-5"
        >
          <div className="space-y-1">
            <BrandMark className="h-8 w-8 mb-2" />
            <h1 className="text-xl font-semibold font-display text-brand-carbon">{t('login.resetTitle')}</h1>
            <p className="text-sm text-brand-gray">{t('login.resetSubtitle')}</p>
          </div>

          {resetSent ? (
            <p className="text-sm text-brand-green">{t('login.resetSentMessage', { email })}</p>
          ) : (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-brand-carbon">{t('login.email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-brand-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
              />
            </div>
          )}

          {error && <p className="text-sm text-brand-red">{error}</p>}

          {!resetSent && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand-orange text-white text-sm font-semibold py-2 hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? t('login.sending') : t('login.sendLink')}
            </button>
          )}

          <button
            type="button"
            onClick={backToSignIn}
            className="w-full text-center text-sm text-brand-gray hover:text-brand-carbon"
          >
            {t('login.backToSignIn')}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream px-4 relative">
      <LanguageSwitcher className="absolute top-4 right-4" />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-brand-line p-8 space-y-5"
      >
        <div className="space-y-1">
          <BrandMark className="h-8 w-8 mb-2" />
          <h1 className="text-xl font-semibold font-display text-brand-carbon">{t('login.title')}</h1>
          <p className="text-sm text-brand-gray">{t('login.subtitle')}</p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-brand-carbon">{t('login.email')}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-brand-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-brand-carbon">{t('login.password')}</label>
            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setError(null)
              }}
              className="text-xs text-brand-orange hover:underline"
            >
              {t('login.forgotPassword')}
            </button>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-brand-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
          />
        </div>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-orange text-white text-sm font-semibold py-2 hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </div>
  )
}
