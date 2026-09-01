import { supabase } from './supabase'

// Fase 2 del multi-idioma: traduce contenido (no interfaz) de ES a PT-BR vía
// la Edge Function translate-pt (DeepL). Se usa SOLO al crear contenido
// nuevo — nunca pisa una traducción ya guardada, para no perder correcciones
// manuales futuras. Si DeepL no está configurado o falla la red, devuelve
// null en vez de tirar error: el campo "_pt" simplemente queda vacío y el
// guardado del contenido original nunca se bloquea por esto.
export async function translateBatchToPt(texts: string[]): Promise<(string | null)[]> {
  if (!texts.some((t) => t.trim().length > 0)) return texts.map(() => null)
  try {
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; translations?: string[] }>('translate-pt', {
      body: { texts },
    })
    if (error || !data?.ok || !data.translations) return texts.map(() => null)
    return data.translations
  } catch {
    return texts.map(() => null)
  }
}

export async function translateToPt(text: string): Promise<string | null> {
  if (!text.trim()) return null
  const [result] = await translateBatchToPt([text])
  return result
}

// Para mostrar: si quien mira está en portugués y hay traducción guardada,
// se muestra esa — si no, se muestra siempre el original (nunca texto vacío).
export function localized(original: string, pt: string | null | undefined, lang: string): string {
  return lang === 'pt-BR' && pt ? pt : original
}
