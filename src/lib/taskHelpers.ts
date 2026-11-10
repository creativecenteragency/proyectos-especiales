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

// Monto de una línea de costo con IVA, en su propia moneda.
export function costGross(amount: number, ivaRate: number) {
  return amount * (1 + ivaRate / 100)
}

// Misma cuenta que hace el trigger task_costs_compute en la base — acá solo sirve para
// mostrar el resultado en vivo mientras se edita. Devuelve null si falta el tipo de cambio.
export function costConverted(
  line: { amount: number; ivaRate: number; currency: string; exchangeRate: number | null },
  projectCurrency: string,
): number | null {
  const gross = costGross(line.amount, line.ivaRate)
  if (line.currency === projectCurrency) return Math.round(gross * 100) / 100
  if (!line.exchangeRate || line.exchangeRate <= 0) return null
  if (line.currency === 'ARS' && projectCurrency === 'USD') return Math.round((gross / line.exchangeRate) * 100) / 100
  if (line.currency === 'USD' && projectCurrency === 'ARS') return Math.round(gross * line.exchangeRate * 100) / 100
  return null
}

export const money2 = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Proyección de cierre: lo ya ejecutado + lo proyectado que todavía no se ejecutó.
// Sirve para saber si, aunque hoy no haya sobregiro, lo va a haber cuando se pague todo lo comprometido.
export function projectedClose(items: Task[]) {
  return items.reduce(
    (sum, t) => sum + Number(t.actual_amount) + Math.max(Number(t.planned_amount) - Number(t.actual_amount), 0),
    0,
  )
}
