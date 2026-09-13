import { useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { widgets, type Widget } from '../../kernel/widgets'
import { CURRENCIES, fetchRate, formatMoney, type Rate } from '../../lib/currency'

type State = { status: 'loading' } | { status: 'ok'; rate: Rate } | { status: 'error'; message: string }

const selectClass = 'h-7 rounded-md bg-surface-2 px-1.5 text-[12px] font-medium text-ink outline-none focus:ring-1 focus:ring-accent/40'

export function CurrencyWidget({ widget }: { widget: Widget }) {
  const from = typeof widget.config.from === 'string' ? widget.config.from : 'USD'
  const to = typeof widget.config.to === 'string' ? widget.config.to : 'MXN'
  const amount = typeof widget.config.amount === 'number' ? widget.config.amount : 1
  const [state, setState] = useState<State>({ status: 'loading' })
  const [draft, setDraft] = useState(String(amount))

  useEffect(() => {
    let alive = true
    const load = () =>
      fetchRate(from, to)
        .then((rate) => alive && setState({ status: 'ok', rate }))
        .catch((err: unknown) =>
          alive &&
          setState({
            status: 'error',
            message: err instanceof TypeError ? 'Sin conexión con el servicio de divisas' : err instanceof Error ? err.message : 'Error',
          }),
        )
    void load()
    const id = window.setInterval(load, 60 * 60 * 1000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [from, to])

  const set = (config: Record<string, unknown>) => void widgets.setConfig(widget.id, config)
  const commitAmount = () => {
    const n = Number(draft.replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) set({ amount: n })
    else setDraft(String(amount))
  }

  const codes = Object.keys(CURRENCIES)
  const converted = state.status === 'ok' ? amount * state.rate.rate : null

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commitAmount()
          }}
          className="h-8 min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 text-[15px] font-medium tabular-nums text-ink outline-none focus:ring-1 focus:ring-accent/40"
          aria-label="Monto"
        />
        <select value={from} onChange={(e) => set({ from: e.target.value })} className={selectClass} aria-label="Moneda origen">
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => set({ from: to, to: from })}
          aria-label="Intercambiar monedas"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
        <select value={to} onChange={(e) => set({ to: e.target.value })} className={selectClass} aria-label="Moneda destino">
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        {state.status === 'ok' && converted !== null ? (
          <>
            <p className="text-[26px] font-medium leading-tight tabular-nums text-ink">{formatMoney(converted, to)}</p>
            <p className="mt-1 text-[12px] text-ink-2">
              1 {from} = {state.rate.rate.toFixed(state.rate.rate >= 100 ? 2 : 4)} {to}
            </p>
          </>
        ) : state.status === 'error' ? (
          <p className="text-[12px] text-danger">{state.message}</p>
        ) : (
          <p className="text-[12px] text-ink-3">Consultando el tipo de cambio…</p>
        )}
      </div>

      <p className="truncate text-[10px] text-ink-3">
        {CURRENCIES[from]} → {CURRENCIES[to]}
        {state.status === 'ok' && ` · BCE ${state.rate.date}`}
      </p>
    </div>
  )
}
