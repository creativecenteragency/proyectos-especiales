import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'

export default function SetPassword() {
  const { t } = useTranslation()
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError(t('setPassword.errors.tooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('setPassword.errors.mismatch'))
      return
    }

    setSubmitting(true)
    const { error } = await updatePassword(password)
    if (error) setError(error)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-brand-line p-8 space-y-5"
      >
        <div className="space-y-1">
          <BrandMark className="h-8 w-8 mb-2" />
          <h1 className="text-xl font-semibold font-display text-brand-carbon">{t('setPassword.title')}</h1>
          <p className="text-sm text-brand-gray">{t('setPassword.subtitle')}</p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-brand-carbon">{t('setPassword.newPassword')}</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-brand-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-brand-carbon">{t('setPassword.repeatPassword')}</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-brand-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
          />
        </div>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-orange text-white text-sm font-semibold py-2 hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t('setPassword.saving') : t('setPassword.save')}
        </button>
      </form>
    </div>
  )
}
