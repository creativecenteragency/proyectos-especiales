import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local y completá con los valores del proyecto de Supabase.'
  )
}

export const initialAuthHashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

// Sin el generic <Database>: el schema a mano generaba inferencias en cascada rotas
// en cadenas .insert()/.update()/.eq(). Los tipos fuertes se aplican en el punto de uso
// (ver src/types/database.ts) via `as` sobre los datos que devuelve cada query.
export const supabase = createClient(supabaseUrl, supabaseKey)
