import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { costConverted, costGross, money2 } from '../lib/taskHelpers'
import { localized } from '../lib/translate'
import type { CostStatus, InvoiceType, Provider, TaskCost } from '../types/database'

// Línea de costo en edición (todo como texto, igual que el resto del borrador).
export type CostDraft = {
  key: string // clave estable para React (el id real, o uno temporal si es nueva)
  id: string | null
  concept: string
  providerId: string
  currency: 'ARS' | 'USD'
  amount: string
  ivaRate: string
  invoiceType: string
  exchangeRate: string
  status: CostStatus
  paidOn: string
}

const IVA_OPTIONS = ['0', '10.5', '21', '27']
const INVOICE_OPTIONS: (InvoiceType | '')[] = ['', 'A', 'B', 'C', 'otro']

const labelCls = 'block text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-0.5'
const fieldCls = 'w-full text-xs px-2 py-1.5 rounded-md border border-brand-line'

// Subtareas con proveedor y monto. Cada línea guarda el monto neto en la moneda en que se pagó,
// el IVA, el tipo de factura y el tipo de cambio de ese momento; la conversión a la moneda del
// proyecto (USD) la hace la base al guardar — acá se muestra en vivo mientras se edita.
export default function CostLinesEditor({
  costs,
  onChange,
  providers,
  projectCurrency,
  rateHint,
  canEdit,
  lang,
  serverCosts,
  onAddProvider,
}: {
  costs: CostDraft[]
  onChange: (next: CostDraft[]) => void
  providers: Provider[]
  projectCurrency: string
  rateHint: string
  canEdit: boolean
  lang: string
  serverCosts: TaskCost[]
  onAddProvider: (input: { name: string; cuit: string }) => Promise<Provider | undefined>
}) {
  const { t, i18n } = useTranslation()
  const numberLocale = i18n.resolvedLanguage === 'pt-BR' ? 'pt-BR' : 'es-AR'
  const fmt = (n: number) => n.toLocaleString(numberLocale, { maximumFractionDigits: 2 })
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderCuit, setNewProviderCuit] = useState('')

  function update(key: string, patch: Partial<CostDraft>) {
    onChange(costs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }
  function addLine() {
    onChange([
      ...costs,
      {
        key: crypto.randomUUID(),
        id: null,
        concept: '',
        providerId: '',
        currency: 'ARS',
        amount: '',
        ivaRate: '0',
        invoiceType: '',
        exchangeRate: rateHint,
        status: 'proyectado',
        paidOn: '',
      },
    ])
  }

  const rows = costs.map((c) => {
    const amount = Number(c.amount) || 0
    const ivaRate = Number(c.ivaRate) || 0
    return {
      c,
      gross: costGross(amount, ivaRate),
      converted: costConverted(
        { amount, ivaRate, currency: c.currency, exchangeRate: Number(c.exchangeRate) || null },
        projectCurrency,
      ),
    }
  })
  const totalPlanned = rows.reduce((s, r) => s + (r.converted ?? 0), 0)
  const totalExecuted = rows.filter((r) => r.c.status === 'ejecutado').reduce((s, r) => s + (r.converted ?? 0), 0)
  const arsGross = rows.filter((r) => r.c.currency === 'ARS').reduce((s, r) => s + r.gross, 0)
  const missingRate = rows.some((r) => r.converted === null)
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? '—'

  // Auditor / Cliente: solo lectura.
  if (!canEdit) {
    if (serverCosts.length === 0) return null
    return (
      <div className="mt-4 pt-3 border-t border-brand-line space-y-1">
        <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold">
          {t('projectDetail.costs.title')}
        </h4>
        {serverCosts.map((c) => (
          <div key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs border-b border-brand-line/60 py-1">
            <span className="font-semibold text-brand-carbon flex-1 min-w-[160px]">
              {localized(c.concept, c.concept_pt, lang)}
            </span>
            <span className="text-brand-gray">{c.provider_id ? providerName(c.provider_id) : '—'}</span>
            <span className="text-brand-gray">
              {c.currency} {fmt(Number(c.amount))}
              {Number(c.iva_rate) > 0 ? ` ${t('projectDetail.costs.withIva', { rate: Number(c.iva_rate) })}` : ''}
              {c.invoice_type ? ` · ${t(`projectDetail.costs.invoiceTypes.${c.invoice_type}`)}` : ''}
              {c.exchange_rate ? ` · ${t('projectDetail.costs.rateShort', { rate: fmt(Number(c.exchange_rate)) })}` : ''}
            </span>
            <span className="font-semibold text-brand-carbon w-28 text-right">
              {projectCurrency} {money2(Number(c.amount_converted))}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-4 pt-3 border-t border-brand-line space-y-2">
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold">
          {t('projectDetail.costs.title')}
        </h4>
        <p className="text-[10px] text-brand-gray">{t('projectDetail.costs.help', { currency: projectCurrency })}</p>
      </div>

      {rows.map(({ c, gross, converted }) => (
        <div key={c.key} className="rounded-lg border border-brand-line p-3 space-y-2 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={c.concept}
              onChange={(e) => update(c.key, { concept: e.target.value })}
              placeholder={t('projectDetail.costs.conceptPlaceholder')}
              className={`${fieldCls} sm:col-span-2`}
            />
            <select value={c.providerId} onChange={(e) => update(c.key, { providerId: e.target.value })} className={fieldCls}>
              <option value="">{t('projectDetail.taskRow.noProvider')}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
            <div className="col-span-2">
              <span className={labelCls}>{t('projectDetail.costs.amount')}</span>
              <div className="flex gap-1">
                <select
                  value={c.currency}
                  onChange={(e) => update(c.key, { currency: e.target.value as 'ARS' | 'USD' })}
                  className="text-xs px-1 py-1.5 rounded-md border border-brand-line"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={c.amount}
                  onChange={(e) => update(c.key, { amount: e.target.value })}
                  className={fieldCls}
                />
              </div>
            </div>
            <div>
              <span className={labelCls}>{t('projectDetail.costs.iva')}</span>
              <select value={c.ivaRate} onChange={(e) => update(c.key, { ivaRate: e.target.value })} className={fieldCls}>
                {(IVA_OPTIONS.includes(c.ivaRate) ? IVA_OPTIONS : [...IVA_OPTIONS, c.ivaRate]).map((r) => (
                  <option key={r} value={r}>{r === '0' ? t('projectDetail.costs.ivaNone') : `${r}%`}</option>
                ))}
              </select>
            </div>
            <div>
              <span className={labelCls}>{t('projectDetail.costs.invoice')}</span>
              <select value={c.invoiceType} onChange={(e) => update(c.key, { invoiceType: e.target.value })} className={fieldCls}>
                {INVOICE_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o === '' ? '—' : t(`projectDetail.costs.invoiceTypes.${o}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <span className={labelCls}>{t('projectDetail.costs.rate')}</span>
              {c.currency !== projectCurrency ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={c.exchangeRate}
                  onChange={(e) => update(c.key, { exchangeRate: e.target.value })}
                  className={`${fieldCls} ${!(Number(c.exchangeRate) > 0) ? 'border-brand-red' : ''}`}
                />
              ) : (
                <div className="text-xs text-brand-gray px-2 py-1.5">—</div>
              )}
            </div>
            <div>
              <span className={labelCls}>{t('projectDetail.costs.status')}</span>
              <select
                value={c.status}
                onChange={(e) => update(c.key, { status: e.target.value as CostStatus })}
                className={fieldCls}
              >
                <option value="proyectado">{t('projectDetail.costs.statusProyectado')}</option>
                <option value="ejecutado">{t('projectDetail.costs.statusEjecutado')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-brand-gray">
                {t('projectDetail.costs.paidOn')}
                <input
                  type="date"
                  value={c.paidOn}
                  onChange={(e) => update(c.key, { paidOn: e.target.value })}
                  className="text-xs px-1.5 py-1 rounded-md border border-brand-line"
                />
              </label>
              <span className="text-brand-gray">
                {c.currency} {fmt(gross)}
                {Number(c.ivaRate) > 0 ? ` (${t('projectDetail.costs.withIvaShort')})` : ''}
              </span>
              <span className="font-semibold text-brand-carbon">
                {converted === null ? (
                  <span className="text-brand-red">{t('projectDetail.costs.missingRate')}</span>
                ) : (
                  `= ${projectCurrency} ${money2(converted)}`
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onChange(costs.filter((x) => x.key !== c.key))}
              className="text-brand-gray hover:text-brand-red"
            >
              {t('projectDetail.costs.remove')}
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addLine} className="text-xs font-semibold text-brand-orange hover:underline">
          {t('projectDetail.costs.add')}
        </button>
        <div className="flex items-center gap-1">
          <input
            value={newProviderName}
            onChange={(e) => setNewProviderName(e.target.value)}
            placeholder={t('projectDetail.taskRow.newProviderPlaceholder')}
            className="text-xs px-2 py-1 rounded-md border border-brand-line"
          />
          <input
            value={newProviderCuit}
            onChange={(e) => setNewProviderCuit(e.target.value)}
            placeholder={t('projectDetail.taskRow.cuitPlaceholder')}
            className="w-24 text-xs px-2 py-1 rounded-md border border-brand-line"
          />
          <button
            type="button"
            onClick={async () => {
              if (!newProviderName.trim()) return
              await onAddProvider({ name: newProviderName.trim(), cuit: newProviderCuit.trim() })
              setNewProviderName('')
              setNewProviderCuit('')
            }}
            className="text-xs font-semibold px-2 py-1 rounded-md bg-brand-orange text-white"
          >
            +
          </button>
        </div>
      </div>

      {costs.length > 0 && (
        <div
          className={`text-xs rounded-md p-2.5 flex flex-wrap gap-x-6 gap-y-1 ${missingRate ? 'bg-brand-red/10' : 'bg-brand-cream'}`}
        >
          <span>
            <span className="text-brand-gray">{t('projectDetail.costs.totalPlanned')}: </span>
            <span className="font-semibold text-brand-carbon">{projectCurrency} {money2(totalPlanned)}</span>
          </span>
          <span>
            <span className="text-brand-gray">{t('projectDetail.costs.totalExecuted')}: </span>
            <span className="font-semibold text-brand-carbon">{projectCurrency} {money2(totalExecuted)}</span>
          </span>
          {arsGross > 0 && projectCurrency !== 'ARS' && (
            <span>
              <span className="text-brand-gray">{t('projectDetail.costs.totalArs')}: </span>
              <span className="font-semibold text-brand-carbon">ARS {fmt(arsGross)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
