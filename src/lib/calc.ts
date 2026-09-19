/**
 * Local calculator and unit converter for the command bar. Pure functions, no eval.
 * Understands Spanish phrasing: "15% de 3400", "3400 + 16%", "120 km a millas", "72 f a c", "2 gb en mb".
 */

export interface CalcResult {
  display: string
  value: number
  /** What was understood, shown as a hint. */
  detail: string
}

/** Enough precision to be useful, few enough digits to read at a glance. */
function format(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  const abs = Math.abs(n)
  if (abs >= 1e15 || (abs < 1e-6 && n !== 0)) return n.toExponential(4)
  const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : 4
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(rounded)
}

// ---- Expressions -------------------------------------------------------------------------

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' } | { t: 'fn'; v: string }

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  raiz: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

function normalizeNumber(raw: string): number {
  // "1,234.5" → 1234.5 ; "1.234,5" → 1234.5 ; "3,5" → 3.5
  let s = raw
  if (/,\d{3}(\D|$)/.test(s) && !/,\d{1,2}$/.test(s)) s = s.replace(/,/g, '')
  else if (/\.\d{3}(\D|$)/.test(s) && /,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  return Number(s)
}

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  const re = /\s*(?:(\d+(?:[.,]\d+)*(?:[.,]\d+)?|\.\d+)|([a-zA-Zπ]+)|(\*\*|[+\-*/^%()×÷])|(.))/gy
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    if (m.index >= src.length) break
    if (m[1]) out.push({ t: 'num', v: normalizeNumber(m[1]) })
    else if (m[2]) {
      const w = m[2].toLowerCase()
      if (w === 'π') out.push({ t: 'num', v: Math.PI })
      else if (w in CONSTS) out.push({ t: 'num', v: CONSTS[w] })
      else if (w in FUNCS) out.push({ t: 'fn', v: w })
      else return null
    } else if (m[3]) {
      const op = m[3]
      if (op === '(') out.push({ t: 'lp' })
      else if (op === ')') out.push({ t: 'rp' })
      else out.push({ t: 'op', v: op === '×' ? '*' : op === '÷' ? '/' : op === '**' ? '^' : op })
    } else if (m[4]?.trim()) return null
    if (m[0].length === 0) break
  }
  return out
}

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }

function parse(tokens: Tok[]): number | null {
  let i = 0
  const peek = () => tokens[i]
  const next = () => tokens[i++]

  const primary = (): number | null => {
    const tok = next()
    if (!tok) return null
    if (tok.t === 'num') return tok.v
    if (tok.t === 'op' && tok.v === '-') {
      const v = unary()
      return v === null ? null : -v
    }
    if (tok.t === 'op' && tok.v === '+') return unary()
    if (tok.t === 'lp') {
      const v = expr(0)
      if (peek()?.t !== 'rp') return null
      next()
      return v
    }
    if (tok.t === 'fn') {
      if (peek()?.t !== 'lp') return null
      next()
      const v = expr(0)
      if (peek()?.t !== 'rp' || v === null) return null
      next()
      return FUNCS[tok.v](v)
    }
    return null
  }
  const unary = (): number | null => primary()

  const expr = (minPrec: number): number | null => {
    let left = unary()
    if (left === null) return null
    while (true) {
      const tok = peek()
      if (!tok || tok.t !== 'op' || PREC[tok.v] === undefined || PREC[tok.v] < minPrec) break
      next()
      const right = expr(tok.v === '^' ? PREC[tok.v] : PREC[tok.v] + 1)
      if (right === null) return null
      switch (tok.v) {
        case '+':
          left += right
          break
        case '-':
          left -= right
          break
        case '*':
          left *= right
          break
        case '/':
          left /= right
          break
        case '%':
          left %= right
          break
        case '^':
          left = Math.pow(left, right)
          break
      }
    }
    return left
  }

  const value = expr(0)
  return i === tokens.length ? value : null
}

/** Rewrites Spanish percent phrasing into plain arithmetic before parsing. */
function desugarPercent(src: string): string {
  let s = src
  // "15% de 3400" → (15/100)*(3400)
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|of)\s+/gi, '($1/100)*')
  // "3400 + 16%" / "3400 - 16%" → 3400*(1+16/100)
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*([+-])\s*(\d+(?:[.,]\d+)?)\s*%(?!\s*\d)/g, '$1*(1$2$3/100)')
  // bare "16%" → (16/100)
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*%/g, '($1/100)')
  return s
}

export function evaluateExpression(input: string): CalcResult | null {
  const raw = input.trim().replace(/^=\s*/, '').replace(/\s*=\s*\??$/, '')
  if (!/\d/.test(raw)) return null
  if (!/[+\-*/^%×÷()]|sqrt|raiz|sin|cos|tan|log|ln|abs|round|floor|ceil|pi|π/i.test(raw)) return null
  const tokens = tokenize(desugarPercent(raw))
  if (!tokens || tokens.length < 2) return null
  const value = parse(tokens)
  // «5/0» answered «= ∞» with Enter ready to copy the ∞ character: a division by zero is not a result.
  // Infinity joins NaN on the way out, so the bar falls back to normal search.
  if (value === null || !Number.isFinite(value)) return null
  return { display: format(value), value, detail: raw }
}

// ---- Units --------------------------------------------------------------------------------

interface UnitDef {
  category: string
  /** Multiply by this to get the base unit. */
  factor: number
  label: string
}

const UNITS: Record<string, UnitDef> = {}
function def(category: string, label: string, factor: number, aliases: string[]) {
  for (const a of aliases) UNITS[a.toLowerCase()] = { category, factor, label }
}
def('length', 'mm', 0.001, ['mm', 'milimetro', 'milimetros', 'milímetro', 'milímetros'])
def('length', 'cm', 0.01, ['cm', 'centimetro', 'centimetros', 'centímetro', 'centímetros'])
def('length', 'm', 1, ['m', 'metro', 'metros'])
def('length', 'km', 1000, ['km', 'kilometro', 'kilometros', 'kilómetro', 'kilómetros'])
def('length', 'in', 0.0254, ['in', 'pulgada', 'pulgadas', 'inch', 'inches'])
def('length', 'ft', 0.3048, ['ft', 'pie', 'pies', 'feet', 'foot'])
def('length', 'yd', 0.9144, ['yd', 'yarda', 'yardas'])
def('length', 'mi', 1609.344, ['mi', 'milla', 'millas', 'mile', 'miles'])
def('mass', 'g', 0.001, ['g', 'gramo', 'gramos'])
def('mass', 'kg', 1, ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'])
def('mass', 'lb', 0.45359237, ['lb', 'lbs', 'libra', 'libras'])
def('mass', 'oz', 0.028349523, ['oz', 'onza', 'onzas'])
def('mass', 't', 1000, ['t', 'tonelada', 'toneladas'])
def('volume', 'ml', 0.001, ['ml', 'mililitro', 'mililitros'])
def('volume', 'l', 1, ['l', 'litro', 'litros'])
def('volume', 'gal', 3.785411784, ['gal', 'galon', 'galones', 'galón'])
def('data', 'B', 1, ['b', 'byte', 'bytes'])
def('data', 'KB', 1024, ['kb', 'kilobyte', 'kilobytes'])
def('data', 'MB', 1024 ** 2, ['mb', 'megabyte', 'megabytes', 'megas'])
def('data', 'GB', 1024 ** 3, ['gb', 'gigabyte', 'gigabytes', 'gigas'])
def('data', 'TB', 1024 ** 4, ['tb', 'terabyte', 'terabytes'])
def('time', 's', 1, ['s', 'seg', 'segundo', 'segundos'])
def('time', 'min', 60, ['min', 'minuto', 'minutos'])
def('time', 'h', 3600, ['h', 'hr', 'hora', 'horas'])
def('time', 'd', 86400, ['d', 'dia', 'dias', 'día', 'días'])
def('time', 'sem', 604800, ['sem', 'semana', 'semanas'])
def('speed', 'km/h', 1, ['km/h', 'kmh', 'kph'])
def('speed', 'mph', 1.609344, ['mph'])
def('speed', 'm/s', 3.6, ['m/s', 'ms'])
def('temp', '°C', 1, ['c', '°c', 'celsius', 'centigrados', 'centígrados'])
def('temp', '°F', 1, ['f', '°f', 'fahrenheit'])
def('temp', 'K', 1, ['k', 'kelvin'])

function convertTemp(v: number, from: string, to: string): number {
  const c = from === '°C' ? v : from === '°F' ? ((v - 32) * 5) / 9 : v - 273.15
  return to === '°C' ? c : to === '°F' ? (c * 9) / 5 + 32 : c + 273.15
}

export function convertUnits(input: string): CalcResult | null {
  const m = input
    .trim()
    .match(/^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z°/áéíóú]+)\s+(?:a|en|to|->|→)\s+([a-zA-Z°/áéíóú]+)\s*\??$/i)
  if (!m) return null
  const value = normalizeNumber(m[1])
  const from = UNITS[m[2].toLowerCase()]
  const to = UNITS[m[3].toLowerCase()]
  if (!from || !to || from.category !== to.category) return null
  const result = from.category === 'temp' ? convertTemp(value, from.label, to.label) : (value * from.factor) / to.factor
  // Same as arithmetic: an impossible conversion is not an answer either.
  if (!Number.isFinite(result)) return null
  return { display: `${format(result)} ${to.label}`, value: result, detail: `${format(value)} ${from.label} → ${to.label}` }
}

/** Tries the converter first, then arithmetic. Returns null when the text is not a calculation. */
export function calculate(input: string): CalcResult | null {
  return convertUnits(input) ?? evaluateExpression(input)
}
