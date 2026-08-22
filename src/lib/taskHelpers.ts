import type { Task, TaskStatus } from '../types/database'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  preparacion: 'Preparación',
  planificado: 'Planificado',
  en_curso: 'En curso',
  hecho: 'Hecho',
  bloqueado: 'Bloqueado',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  preparacion: '#746d64',
  planificado: '#1f4f7a',
  en_curso: '#f47a20',
  hecho: '#2f6b48',
  bloqueado: '#9b4a43',
}

export const money = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

// Proyección de cierre: lo ya ejecutado + lo proyectado que todavía no se ejecutó.
// Sirve para saber si, aunque hoy no haya sobregiro, lo va a haber cuando se pague todo lo comprometido.
export function projectedClose(items: Task[]) {
  return items.reduce(
    (sum, t) => sum + Number(t.actual_amount) + Math.max(Number(t.planned_amount) - Number(t.actual_amount), 0),
    0,
  )
}
