import { useEffect } from 'react'

// Muestra el aviso nativo del navegador ("¿Seguro que querés salir?") si hay
// cambios sin guardar al cerrar la pestaña, cerrar el navegador o recargar.
// No recupera nada — solo evita perder trabajo por accidente.
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
