import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Client } from '../types/database'

type Variant = 'positive' | 'negative'

export default function ClientLogoEditor({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null)

  async function handleFile(variant: Variant, file: File) {
    setError(null)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `${client.id}/logo-${variant}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('client-logos').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: publicUrlData } = supabase.storage.from('client-logos').getPublicUrl(path)
      const column = variant === 'positive' ? 'logo_url' : 'logo_url_negative'
      const { error: updateError } = await supabase.from('clients').update({ [column]: publicUrlData.publicUrl }).eq('id', client.id)
      if (updateError) throw updateError
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo.')
    }
  }

  async function handleRemove(variant: Variant) {
    const column = variant === 'positive' ? 'logo_url' : 'logo_url_negative'
    const { error: updateError } = await supabase.from('clients').update({ [column]: null }).eq('id', client.id)
    if (updateError) setError(updateError.message)
    else onSaved()
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
      <p className="text-xs text-white/70 mb-3">
        Logo de {client.name} — el positivo se usa sobre fondos claros (informes), el negativo sobre fondos oscuros (este panel). Se
        muestran en el proyecto y en los informes PDF.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LogoSlot
          label="Logo positivo (fondo claro)"
          preview="light"
          url={client.logo_url}
          uploading={false}
          onUpload={(file) => handleFile('positive', file)}
          onRemove={() => handleRemove('positive')}
        />
        <LogoSlot
          label="Logo negativo (fondo oscuro)"
          preview="dark"
          url={client.logo_url_negative}
          uploading={false}
          onUpload={(file) => handleFile('negative', file)}
          onRemove={() => handleRemove('negative')}
        />
      </div>
      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
    </div>
  )
}

function LogoSlot({
  label,
  preview,
  url,
  onUpload,
  onRemove,
}: {
  label: string
  preview: 'light' | 'dark'
  url: string | null
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex items-center gap-3">
      <div className={`h-12 w-24 flex-shrink-0 rounded flex items-center justify-center ${preview === 'light' ? 'bg-white' : 'bg-brand-carbon'}`}>
        {url ? (
          <img src={url} alt={label} className="h-10 max-w-[88px] object-contain p-1" />
        ) : (
          <span className={`text-[10px] ${preview === 'light' ? 'text-brand-gray' : 'text-white/40'}`}>Sin logo</span>
        )}
      </div>
      <div className="flex-1">
        <p className="text-[11px] text-white/60 mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-brand-orange text-white disabled:opacity-50"
          >
            {busy ? 'Subiendo…' : url ? 'Cambiar' : 'Subir'}
          </button>
          {url && (
            <button onClick={onRemove} className="text-xs text-white/60 hover:text-white">Quitar</button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            await onUpload(file)
            setBusy(false)
          }}
        />
      </div>
    </div>
  )
}
