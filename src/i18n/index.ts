import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'
import ptBR from './locales/pt-BR.json'

// Idiomas soportados por la interfaz de la app (no confundir con el idioma del
// contenido que cargan las personas — tareas, comentarios, etc. — que se
// maneja aparte).
//
// Nota: se probó usar i18next-browser-languagedetector acá, pero en esta
// combinación de versiones (i18next 26.x) dejaba `i18n.languages` pisado en el
// fallback y nunca resolvía el idioma detectado — se armó la detección a mano,
// que es más simple y no depende de ese plugin.
const STORAGE_KEY = 'pe-language'
type SupportedLang = 'es' | 'pt-BR'

function detectInitialLanguage(): SupportedLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'es' || saved === 'pt-BR') return saved
  } catch {
    // localStorage puede no estar disponible (modo privado, etc.) — seguimos con el navegador.
  }
  const browserLang = typeof navigator !== 'undefined' ? navigator.language : 'es'
  return browserLang.toLowerCase().startsWith('pt') ? 'pt-BR' : 'es'
}

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    'pt-BR': { translation: ptBR },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'es',
  supportedLngs: ['es', 'pt-BR'],
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng === 'pt-BR' ? 'pt-BR' : 'es')
  } catch {
    // idem — si no hay localStorage, el idioma simplemente no persiste entre visitas.
  }
})

export default i18n
