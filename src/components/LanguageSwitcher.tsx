import { useTranslation } from 'react-i18next'

const LANGS: { code: string; label: string }[] = [
  { code: 'es', label: 'ES' },
  { code: 'pt-BR', label: 'PT' },
]

// Selector manual de idioma de la interfaz. Detecta automáticamente el
// idioma del navegador la primera vez (ver src/i18n/index.ts); si alguien lo
// cambia acá, queda guardado en ese navegador y tiene prioridad de ahí en más.
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation()
  const current = i18n.resolvedLanguage === 'pt-BR' ? 'pt-BR' : 'es'

  return (
    <div className={`inline-flex items-center rounded-full border border-brand-line overflow-hidden text-[11px] font-semibold ${className}`}>
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          className={`px-2 py-1 transition-colors ${
            current === code ? 'bg-brand-carbon text-white' : 'text-brand-gray hover:text-brand-carbon'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
