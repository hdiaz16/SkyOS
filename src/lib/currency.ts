/** Frankfurter: European Central Bank reference rates, free, no key, CORS-enabled. */

export const CURRENCIES: Record<string, string> = {
  USD: 'Dólar estadounidense',
  MXN: 'Peso mexicano',
  EUR: 'Euro',
  GBP: 'Libra esterlina',
  CAD: 'Dólar canadiense',
  JPY: 'Yen japonés',
  BRL: 'Real brasileño',
  CHF: 'Franco suizo',
  CNY: 'Yuan chino',
  AUD: 'Dólar australiano',
  INR: 'Rupia india',
  KRW: 'Won surcoreano',
}

export interface Rate {
  from: string
  to: string
  rate: number
  date: string
  fetchedAt: number
}

const cache = new Map<string, Rate>()
const TTL = 60 * 60 * 1000

export async function fetchRate(from: string, to: string): Promise<Rate> {
  if (from === to) return { from, to, rate: 1, date: new Date().toISOString().slice(0, 10), fetchedAt: Date.now() }
  const key = `${from}>${to}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached

  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`)
  if (!res.ok) throw new Error('No se pudo obtener el tipo de cambio')
  const data = (await res.json()) as { date: string; rates: Record<string, number> }
  const rate = data.rates[to]
  if (typeof rate !== 'number') throw new Error('Moneda no disponible')
  const out: Rate = { from, to, rate, date: data.date, fetchedAt: Date.now() }
  cache.set(key, out)
  return out
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: value >= 100 ? 2 : 4 }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}
