// Falla el build si src/i18n/locales/es.json y pt-BR.json no tienen exactamente
// las mismas claves. Así, si se agrega una pantalla o un texto nuevo en un
// idioma y se olvida el otro, el deploy no pasa hasta que se complete.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const localesDir = fileURLToPath(new URL('../src/i18n/locales/', import.meta.url))

function flattenKeys(obj, prefix = '') {
  const keys = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

const locales = {
  es: JSON.parse(readFileSync(`${localesDir}es.json`, 'utf-8')),
  'pt-BR': JSON.parse(readFileSync(`${localesDir}pt-BR.json`, 'utf-8')),
}

const keysByLocale = Object.fromEntries(
  Object.entries(locales).map(([lang, dict]) => [lang, new Set(flattenKeys(dict))]),
)

const [es, ptBR] = [keysByLocale.es, keysByLocale['pt-BR']]
const missingInPt = [...es].filter((k) => !ptBR.has(k)).sort()
const missingInEs = [...ptBR].filter((k) => !es.has(k)).sort()

if (missingInPt.length === 0 && missingInEs.length === 0) {
  console.log(`i18n: ${es.size} claves, es y pt-BR sincronizados.`)
  process.exit(0)
}

console.error('i18n: es.json y pt-BR.json están desincronizados.\n')
if (missingInPt.length > 0) {
  console.error(`Faltan en pt-BR.json (${missingInPt.length}):`)
  for (const k of missingInPt) console.error(`  - ${k}`)
}
if (missingInEs.length > 0) {
  console.error(`Faltan en es.json (${missingInEs.length}):`)
  for (const k of missingInEs) console.error(`  - ${k}`)
}
process.exit(1)
