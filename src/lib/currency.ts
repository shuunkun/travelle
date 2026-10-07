import { Expense, SplitEntry } from './types';
import { fromCents, toCents } from './split';

/**
 * Multi-currency support.
 *
 * Every trip has a home currency. An expense keeps the amount and currency it
 * was actually paid in, plus `exchangeRate`: how many units of the trip's
 * currency one unit of the expense currency is worth. Balances, budgets and
 * settlements are all in the home currency; use the helpers below rather than
 * reading `expense.amount` directly when adding things up.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'MOP', name: 'Macanese pataca' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'TWD', name: 'New Taiwan dollar' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'BND', name: 'Brunei dollar' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'VND', name: 'Vietnamese dong' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'KHR', name: 'Cambodian riel' },
  { code: 'LAK', name: 'Lao kip' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'LKR', name: 'Sri Lankan rupee' },
  { code: 'NPR', name: 'Nepalese rupee' },
  { code: 'MVR', name: 'Maldivian rufiyaa' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'QAR', name: 'Qatari riyal' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'NOK', name: 'Norwegian krone' },
  { code: 'DKK', name: 'Danish krone' },
  { code: 'CZK', name: 'Czech koruna' },
  { code: 'PLN', name: 'Polish zloty' },
  { code: 'HUF', name: 'Hungarian forint' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'ARS', name: 'Argentine peso' },
  { code: 'CLP', name: 'Chilean peso' },
  { code: 'PEN', name: 'Peruvian sol' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'EGP', name: 'Egyptian pound' },
  { code: 'MAD', name: 'Moroccan dirham' },
  { code: 'KES', name: 'Kenyan shilling' },
  { code: 'FJD', name: 'Fijian dollar' },
];

export const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }));

export function isKnownCurrency(code: string): boolean {
  return CURRENCIES.some((c) => c.code === code);
}

const REGION_CURRENCY: Record<string, string> = {
  AU: 'AUD', US: 'USD', GB: 'GBP', NZ: 'NZD', SG: 'SGD', HK: 'HKD', CN: 'CNY', TW: 'TWD', JP: 'JPY', KR: 'KRW',
  MY: 'MYR', TH: 'THB', VN: 'VND', ID: 'IDR', PH: 'PHP', IN: 'INR', AE: 'AED', CH: 'CHF', SE: 'SEK', NO: 'NOK',
  DK: 'DKK', CZ: 'CZK', PL: 'PLN', CA: 'CAD', MX: 'MXN', BR: 'BRL', ZA: 'ZAR', BN: 'BND',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
};

/** Best guess at the user's own currency from the browser locale. */
export function guessHomeCurrency(): string {
  if (typeof navigator === 'undefined') return 'USD';
  for (const tag of navigator.languages ?? [navigator.language]) {
    const region = tag.split('-').find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part));
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (tz.startsWith('Australia/')) return 'AUD';
    if (tz.startsWith('Europe/London')) return 'GBP';
    if (tz.startsWith('Europe/')) return 'EUR';
    if (tz.startsWith('Asia/Hong_Kong')) return 'HKD';
    if (tz.startsWith('Asia/Singapore')) return 'SGD';
    if (tz.startsWith('Asia/Tokyo')) return 'JPY';
    if (tz.startsWith('Pacific/Auckland')) return 'NZD';
  } catch {
    /* ignore */
  }
  return 'USD';
}

const symbolCache = new Map<string, string>();

/** "$", "HK$", "€", "¥" … for input prefixes. */
export function currencySymbol(code: string): string {
  const cached = symbolCache.get(code);
  if (cached) return cached;
  let symbol = code;
  try {
    // 'symbol' (not 'narrowSymbol') so HKD and AUD read "HK$" / "A$" rather than a bare "$",
    // matching formatCurrency() output elsewhere.
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(1);
    symbol = parts.find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    /* unknown code: fall back to the code itself */
  }
  symbolCache.set(code, symbol);
  return symbol;
}

/** The parts of an expense needed for conversion. */
export type MoneyFields = Pick<Expense, 'amount' | 'currency' | 'exchangeRate' | 'splitBetween'>;

/** Trip-currency units per one unit of the expense's currency. */
export function expenseRate(expense: Pick<Expense, 'exchangeRate'>): number {
  const rate = expense.exchangeRate;
  return rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/** The expense's split, converted to the trip currency (each entry rounded to cents). */
export function homeSplits(expense: MoneyFields): SplitEntry[] {
  const rate = expenseRate(expense);
  if (rate === 1) return expense.splitBetween;
  return expense.splitBetween.map((s) => ({ ...s, amount: fromCents(Math.round(toCents(s.amount) * rate)) }));
}

/** What the expense cost in the trip currency. Equals the sum of the converted split so balances stay exact. */
export function homeAmountCents(expense: MoneyFields): number {
  const rate = expenseRate(expense);
  if (rate === 1) return toCents(expense.amount);
  if (expense.splitBetween.length === 0) return Math.round(toCents(expense.amount) * rate);
  return homeSplits(expense).reduce((sum, s) => sum + toCents(s.amount), 0);
}

export function homeAmount(expense: MoneyFields): number {
  return fromCents(homeAmountCents(expense));
}

/** A copy of the expense expressed in the trip currency, for balance maths. */
export function toHomeExpense(expense: Expense): Expense {
  if (expenseRate(expense) === 1) return expense;
  return { ...expense, amount: homeAmount(expense), splitBetween: homeSplits(expense) };
}

/** True when the expense was paid in a different currency from the trip's. */
export function isForeign(expense: Pick<Expense, 'currency'>, tripCurrency: string): boolean {
  return expense.currency !== tripCurrency;
}

// ---------------------------------------------------------------------------
// Live rates (free, no key). Cached per base currency for a day.
// ---------------------------------------------------------------------------

const RATES_KEY = 'travelle:rates:';
const RATES_TTL = 24 * 60 * 60 * 1000;

interface RatesCache {
  fetchedAt: number;
  rates: Record<string, number>;
}

function readCache(base: string): RatesCache | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RATES_KEY + base);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatesCache;
    if (!parsed.rates || Date.now() - parsed.fetchedAt > RATES_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * How many `to` one `from` buys, from the cached or freshly fetched table.
 * Resolves to undefined offline or for unknown codes, so callers fall back to
 * manual entry.
 */
export async function fetchRate(from: string, to: string): Promise<number | undefined> {
  if (from === to) return 1;
  let cache = readCache(from);
  if (!cache) {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
      if (!res.ok) return undefined;
      const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (json.result !== 'success' || !json.rates) return undefined;
      cache = { fetchedAt: Date.now(), rates: json.rates };
      try {
        localStorage.setItem(RATES_KEY + from, JSON.stringify(cache));
      } catch {
        /* storage full or unavailable */
      }
    } catch {
      return undefined;
    }
  }
  const rate = cache.rates[to];
  return typeof rate === 'number' && rate > 0 ? rate : undefined;
}

/** Rates are shown with enough precision to be useful for both JPY→AUD and AUD→JPY. */
export function formatRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toPrecision(4);
}
