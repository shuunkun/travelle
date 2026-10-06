import { Activity, ActivityCategory, FlightDetails, HotelDetails } from './types';
import { DEFAULT_CHECK_IN_TIME, buildFlightTitle, buildHotelTitle, joinDateTime } from './activities';
import { addDays, compareDateKeys, isDateKey } from './utils';

/**
 * Rule-based reader for pasted trip notes, itineraries and booking emails.
 * Runs entirely in the browser. It is deliberately forgiving: anything it
 * can't place is returned in `unplaced` so the user can see what was missed.
 */

export interface ParseContext {
  /** "Today" as a date key; used to pick the year when the text omits it. */
  today: string;
  /** Existing trip range, when adding to a trip. */
  startDate?: string;
  endDate?: string;
}

export interface ParsedItem {
  key: string;
  /** Resolved home date, or undefined when only `dayNumber` (or nothing) is known. */
  date?: string;
  /** "Day 3" style placement, resolved against the trip start. */
  dayNumber?: number;
  activity: Omit<Activity, 'id'>;
  source: string;
  /** Things the user should double-check (e.g. "No time found"). */
  warnings: string[];
}

export interface ParsedTripText {
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  travelerNames: string[];
  checklist: string[];
  items: ParsedItem[];
  unplaced: string[];
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WEEKDAY_RE = '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday)?\\.?,?';
const RANGE_SEP = '\\s*(?:-|–|—|to|until|till|through|thru)\\s*';

/** City names for common airports; also used to accept a 3-letter code as an airport. */
export const AIRPORT_CITIES: Record<string, string> = {
  SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane', PER: 'Perth', ADL: 'Adelaide', CBR: 'Canberra',
  OOL: 'Gold Coast', CNS: 'Cairns', HBA: 'Hobart', DRW: 'Darwin', AKL: 'Auckland', CHC: 'Christchurch',
  ZQN: 'Queenstown', WLG: 'Wellington', NAN: 'Nadi',
  HKG: 'Hong Kong', MFM: 'Macau', CAN: 'Guangzhou', SZX: 'Shenzhen', PEK: 'Beijing', PKX: 'Beijing',
  PVG: 'Shanghai', SHA: 'Shanghai', CTU: 'Chengdu', TFU: 'Chengdu', XIY: "Xi'an", HGH: 'Hangzhou',
  KMG: 'Kunming', CKG: 'Chongqing', XMN: 'Xiamen', TPE: 'Taipei', TSA: 'Taipei', KHH: 'Kaohsiung',
  NRT: 'Tokyo', HND: 'Tokyo', KIX: 'Osaka', ITM: 'Osaka', NGO: 'Nagoya', CTS: 'Sapporo', FUK: 'Fukuoka',
  OKA: 'Okinawa', ICN: 'Seoul', GMP: 'Seoul', PUS: 'Busan', CJU: 'Jeju',
  SIN: 'Singapore', KUL: 'Kuala Lumpur', PEN: 'Penang', BKI: 'Kota Kinabalu', BKK: 'Bangkok',
  DMK: 'Bangkok', HKT: 'Phuket', CNX: 'Chiang Mai', USM: 'Koh Samui', SGN: 'Ho Chi Minh City',
  HAN: 'Hanoi', DAD: 'Da Nang', PQC: 'Phu Quoc', REP: 'Siem Reap', PNH: 'Phnom Penh', MNL: 'Manila',
  CEB: 'Cebu', DPS: 'Bali', CGK: 'Jakarta', DEL: 'Delhi', BOM: 'Mumbai', BLR: 'Bangalore', CMB: 'Colombo',
  MLE: 'Malé', KTM: 'Kathmandu', DXB: 'Dubai', AUH: 'Abu Dhabi', DOH: 'Doha',
  LHR: 'London', LGW: 'London', STN: 'London', CDG: 'Paris', ORY: 'Paris', AMS: 'Amsterdam',
  FRA: 'Frankfurt', MUC: 'Munich', BER: 'Berlin', FCO: 'Rome', MXP: 'Milan', VCE: 'Venice',
  BCN: 'Barcelona', MAD: 'Madrid', LIS: 'Lisbon', ZRH: 'Zurich', GVA: 'Geneva', VIE: 'Vienna',
  PRG: 'Prague', CPH: 'Copenhagen', ATH: 'Athens', IST: 'Istanbul', DUB: 'Dublin', EDI: 'Edinburgh',
  JFK: 'New York', EWR: 'New York', LGA: 'New York', LAX: 'Los Angeles', SFO: 'San Francisco',
  SEA: 'Seattle', ORD: 'Chicago', LAS: 'Las Vegas', MIA: 'Miami', BOS: 'Boston', HNL: 'Honolulu',
  YVR: 'Vancouver', YYZ: 'Toronto', MEX: 'Mexico City', CUN: 'Cancún',
};

const NOT_AIRPORTS = new Set([
  'THE', 'AND', 'FOR', 'YOU', 'ARE', 'NOT', 'ALL', 'TBC', 'TBD', 'ETA', 'ETD', 'PAX', 'REF', 'VIA',
  'USD', 'AUD', 'HKD', 'EUR', 'GBP', 'CNY', 'RMB', 'JPY', 'SGD', 'NZD', 'CAD', 'THB', 'MYR', 'KRW', 'TWD',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'DAY', 'MTR', 'AM', 'PM',
]);

const CURRENCY_CODES = 'USD|AUD|HKD|EUR|GBP|CNY|RMB|JPY|SGD|NZD|CAD|THB|MYR|KRW|TWD|MOP';
const PRICE_RE = new RegExp(
  `(?:\\b(?:${CURRENCY_CODES})\\s?|(?:HK|US|A|AU|S|NZ|C|NT|MOP)\\$\\s?|[$€£¥]\\s?)(\\d[\\d,]*(?:\\.\\d{1,2})?)|\\b(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s?(?:${CURRENCY_CODES}|dollars|bucks)\\b`,
  'i',
);

const HOTEL_RE =
  /\b(hotel|hostel|resort|motel|inn|airbnb|apartment|serviced apartment|guesthouse|guest house|ryokan|lodge|suites?|accommodation|check[- ]?in|staying at|stay at|stay:)/i;
const FLIGHT_WORD_RE = /\b(flight|flights|fly|flying|depart(?:s|ure)?|airline|boarding)\b/i;

const CATEGORY_WORDS: [ActivityCategory, RegExp][] = [
  ['food', /\b(breakfast|brunch|lunch|dinner|supper|dim sum|yum cha|restaurant|cafe|café|coffee|bar|drinks|food|eat|meal|tea|dessert|street food|hotpot|hot pot|bbq|michelin|bakery|ramen|sushi|izakaya|noodles?|dumplings?|pho|tapas|pizza|brewery|winery|wine|cocktails?|omakase|kaiseki|food court|hawker)\b/i],
  ['transport', /\b(train|rail|mtr|metro|subway|bus|coach|ferry|boat|taxi|uber|didi|transfer|drive|car hire|rental car|shuttle|tram|high[- ]speed|airport|pick ?up|cruise|shinkansen|bullet train|jr|grab|lyft|scooter|bike hire)\b/i],
  ['accommodation', /\b(hotel|hostel|check[- ]?in|check[- ]?out|airbnb|resort)\b/i],
  ['activity', /\b(museum|tour|visit|hike|walk|temple|park|peak|market|beach|show|concert|gallery|disney|disneyland|zoo|aquarium|shopping|explore|sightseeing|island|tower|garden|palace|trip|cable car|spa|massage|class)\b/i],
];

// ---------------------------------------------------------------------------
// Low-level matchers
// ---------------------------------------------------------------------------

interface DateHit {
  index: number;
  length: number;
  month: number;
  day: number;
  year?: number;
}

interface RangeHit {
  index: number;
  length: number;
  start: DateHit;
  end: DateHit;
}

const monthOf = (word: string): number => MONTHS[word.toLowerCase().replace(/\.$/, '')] ?? 0;
const yearOf = (raw?: string): number | undefined => {
  if (!raw) return undefined;
  const n = Number(raw);
  if (raw.length === 2) return 2000 + n;
  return n >= 1990 && n <= 2100 ? n : undefined;
};

function validDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Date ranges written compactly: "21–30 Nov 2026", "Nov 21-30", "21 Nov - 3 Dec 2026". */
export function findRanges(text: string): RangeHit[] {
  const hits: RangeHit[] = [];
  const patterns: [RegExp, (m: RegExpExecArray) => [DateHit, DateHit] | null][] = [
    [
      new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:${MONTH_RE})?${RANGE_SEP}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:,?\\s+(\\d{4}))?`, 'gi'),
      (m) => {
        const endMonth = monthOf(m[4]);
        const startMonth = m[2] ? monthOf(m[2]) : endMonth;
        const year = yearOf(m[5]);
        return [
          { index: 0, length: 0, month: startMonth, day: Number(m[1]), year },
          { index: 0, length: 0, month: endMonth, day: Number(m[3]), year },
        ];
      },
    ],
    [
      new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?${RANGE_SEP}(?:${MONTH_RE}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?!\\s*[:.]\\d)`, 'gi'),
      (m) => {
        const startMonth = monthOf(m[1]);
        const endMonth = m[3] ? monthOf(m[3]) : startMonth;
        const year = yearOf(m[5]);
        return [
          { index: 0, length: 0, month: startMonth, day: Number(m[2]), year },
          { index: 0, length: 0, month: endMonth, day: Number(m[4]), year },
        ];
      },
    ],
  ];
  for (const [re, build] of patterns) {
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const pair = build(m);
      if (!pair || !validDay(pair[0].month, pair[0].day) || !validDay(pair[1].month, pair[1].day)) continue;
      if (hits.some((h) => m!.index < h.index + h.length && h.index < m!.index + m![0].length)) continue;
      hits.push({ index: m.index, length: m[0].length, start: pair[0], end: pair[1] });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Single dates: "2026-11-21", "21 Nov 2026", "Sat, Nov 21", "21/11/2026". */
export function findDates(text: string): DateHit[] {
  const hits: DateHit[] = [];
  const add = (index: number, length: number, month: number, day: number, year?: number) => {
    if (!validDay(month, day)) return;
    if (hits.some((h) => index < h.index + h.length && h.index < index + length)) return;
    hits.push({ index, length, month, day, year });
  };
  let m: RegExpExecArray | null;

  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = iso.exec(text))) add(m.index, m[0].length, Number(m[2]), Number(m[3]), yearOf(m[1]));

  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s+(\\d{4}))?\\b`, 'gi');
  while ((m = dayMonth.exec(text))) add(m.index, m[0].length, monthOf(m[2]), Number(m[1]), yearOf(m[3]));

  const monthDay = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, 'gi');
  while ((m = monthDay.exec(text))) add(m.index, m[0].length, monthOf(m[1]), Number(m[2]), yearOf(m[3]));

  // Numeric dates need a slash; day-first unless that's impossible.
  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g;
  while ((m = numeric.exec(text))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b];
    add(m.index, m[0].length, month, day, yearOf(m[3]));
  }
  return hits.sort((a, b) => a.index - b.index);
}

interface TimeHit {
  index: number;
  length: number;
  time: string;
}

export function findTimes(text: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const add = (index: number, length: number, h: number, min: number) => {
    if (h < 0 || h > 23 || min < 0 || min > 59) return;
    if (hits.some((x) => index < x.index + x.length && x.index < index + length)) return;
    hits.push({ index, length, time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` });
  };
  let m: RegExpExecArray | null;
  const ampm = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/gi;
  while ((m = ampm.exec(text))) {
    let h = Number(m[1]);
    const pm = m[3].toLowerCase().startsWith('p');
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    add(m.index, m[0].length, h, Number(m[2] ?? 0));
  }
  const clock = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/g;
  while ((m = clock.exec(text))) add(m.index, m[0].length, Number(m[1]), Number(m[2]));
  const military = /\b([01]\d|2[0-3])([0-5]\d)\s?(?:hrs?|h)\b/gi;
  while ((m = military.exec(text))) add(m.index, m[0].length, Number(m[1]), Number(m[2]));
  return hits.sort((a, b) => a.index - b.index);
}

export function findPrice(text: string): { amount: number; index: number; length: number } | undefined {
  const m = PRICE_RE.exec(text);
  if (!m) return undefined;
  const amount = Number((m[1] ?? m[2]).replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? { amount, index: m.index, length: m[0].length } : undefined;
}

interface FlightHit {
  flightNumber: string;
  from: string;
  to: string;
}

function findFlight(text: string): FlightHit | undefined {
  const numberMatch = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/.exec(text);
  const flightNumber =
    numberMatch && !NOT_AIRPORTS.has(numberMatch[1]) && !/^\d+$/.test(numberMatch[1])
      ? `${numberMatch[1]}${numberMatch[2]}`
      : '';

  const pair = /\b([A-Z]{3})\b\)?\s*(?:→|->|➝|✈|>|–|—|-|to)\s*(?:[A-Za-z .']+\()?\b([A-Z]{3})\b/.exec(text);
  let from = '';
  let to = '';
  if (pair && !NOT_AIRPORTS.has(pair[1]) && !NOT_AIRPORTS.has(pair[2]) && pair[1] !== pair[2]) {
    [from, to] = [pair[1], pair[2]];
  } else if (flightNumber || FLIGHT_WORD_RE.test(text)) {
    const codes = [...text.matchAll(/\b([A-Z]{3})\b/g)]
      .map((c) => c[1])
      .filter((c) => !NOT_AIRPORTS.has(c) && (AIRPORT_CITIES[c] || flightNumber));
    const distinct = codes.filter((c, i) => codes.indexOf(c) === i);
    if (distinct.length >= 2) [from, to] = [distinct[0], distinct[1]];
  }
  if (!from || !to) return undefined;
  const known = AIRPORT_CITIES[from] || AIRPORT_CITIES[to];
  if (!flightNumber && !FLIGHT_WORD_RE.test(text) && !known) return undefined;
  return { flightNumber, from, to };
}

// ---------------------------------------------------------------------------
// Year resolution
// ---------------------------------------------------------------------------

class DateResolver {
  private last?: string;
  constructor(
    private readonly today: string,
    private readonly docYear?: number,
  ) {}

  resolve(hit: Pick<DateHit, 'month' | 'day' | 'year'>): string | undefined {
    let year = hit.year;
    if (!year) {
      if (this.last) year = Number(this.last.slice(0, 4));
      else if (this.docYear) year = this.docYear;
      else {
        year = Number(this.today.slice(0, 4));
        // A date well in the past most likely means next year.
        const candidate = this.key(year, hit.month, hit.day);
        if (candidate && compareDateKeys(candidate, addDays(this.today, -60)) < 0) year += 1;
      }
      const candidate = this.key(year, hit.month, hit.day);
      // Running past December: "28 Dec … 2 Jan".
      if (candidate && this.last && compareDateKeys(candidate, addDays(this.last, -120)) < 0) year += 1;
    }
    const key = this.key(year, hit.month, hit.day);
    if (key) this.last = key;
    return key;
  }

  private key(year: number, month: number, day: number): string | undefined {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return isDateKey(key) ? key : undefined;
  }
}

// ---------------------------------------------------------------------------
// Line helpers
// ---------------------------------------------------------------------------

const BULLET_RE = /^\s*(?:[-*•·▪◦‣>]+|\d{1,2}[.)]|[a-z][.)])\s+/i;

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, '').trim();
}

function removeSpans(text: string, spans: { index: number; length: number }[]): string {
  let out = text;
  for (const s of [...spans].sort((a, b) => b.index - a.index)) {
    out = `${out.slice(0, s.index)} ${out.slice(s.index + s.length)}`;
  }
  return out;
}

function tidy(text: string): string {
  return text
    .replace(new RegExp(`\\b${WEEKDAY_RE}(?=\\s|$)`, 'gi'), ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:|@–—\-–>]+|[\s,;:|@–—\-–]+$/g, '')
    .trim();
}

function categorize(text: string): ActivityCategory {
  for (const [category, re] of CATEGORY_WORDS) if (re.test(text)) return category;
  return 'activity';
}

function splitNames(raw: string): string[] {
  return raw
    .split(/,|&|\band\b|\+|\//i)
    .map((n) => n.replace(/[.()]/g, '').trim())
    .filter((n) => n && !/^(me|i|myself|you|us)$/i.test(n) && n.split(/\s+/).length <= 3);
}

function cleanHotelName(raw: string): { name: string; address: string } {
  const cleaned = raw
    .replace(/\b(?:check[- ]?in|check[- ]?out|staying at|stay at|accommodation|booking|confirmed|reservation|nights?|\d+\s*nights?)\b:?/gi, ' ')
    .replace(/^\s*(?:hotel|stay)\s*:/i, ' ');
  const parts = tidy(cleaned)
    .replace(/^(?:at|in)\s+/i, '')
    .replace(/\s+(?:from|on|until|till|to|for)$/i, '')
    .split(/\s*(?:,|\||;|–|—| - )\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { name: parts[0] ?? '', address: parts.slice(1).join(', ') };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const META_RE = {
  name: /^\s*(?:trip(?:\s+name)?|name|title)\s*[:\-–]\s*(.+)$/i,
  destination: /^\s*(?:destinations?|where|place|places|cities|city)\s*[:\-–]\s*(.+)$/i,
  dates: /^\s*(?:dates?|when)\s*[:\-–]\s*(.+)$/i,
  budget: /\bbudget\b[^\d$€£¥]*(?:(?:[A-Z]{3}|[A-Z]{1,2}\$)\s?)?[$€£¥]?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?/i,
  travelers: /^\s*(?:travel+ers?|people|who|group|with|companions?|pax)\s*[:\-–]\s*(.+)$/i,
  withNames: /\bwith\s+([A-Z][a-z]+(?:\s*(?:,|&|and)\s*[A-Z][a-z]+)*)/,
  notATitle: /\b(booking|confirm(?:ed|ation)|reservation|receipt|e-?ticket|itinerary for|order|invoice|dear|hello|hi)\b/i,
  tripTo: /\b(?:[Tt]rip|[Hh]oliday|[Vv]acation|[Gg]etaway|[Hh]oneymoon|[Tt]ravel(?:ling|ing)?)\s+to\s+([A-Z][\w'’.-]*(?:[ ,]+(?:and\s+)?[A-Z][\w'’.-]*)*)/,
  checklistHeader: /^\s*(?:packing(?:\s+list)?|checklist|to[- ]?dos?|todo list|things to (?:bring|pack|do before)|pack|bring|before (?:we go|leaving|the trip))\s*:?\s*(.*)$/i,
  checkbox: /^\s*(?:[-*]\s*)?(?:\[\s?[xX ]?\s?\]|☐|☑|✅|✓)\s*(.+)$/,
  dayHeader: /^\s*day\s*(\d{1,2})\b\s*(?:\(([^)]*)\))?\s*[:\-–—.)]?\s*(.*)$/i,
};

export function parseTripText(text: string, ctx: ParseContext): ParsedTripText {
  const result: ParsedTripText = { travelerNames: [], checklist: [], items: [], unplaced: [] };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const yearMatch = /\b(20\d{2})\b/.exec(text);
  const resolver = new DateResolver(ctx.startDate ?? ctx.today, ctx.startDate ? Number(ctx.startDate.slice(0, 4)) : yearMatch ? Number(yearMatch[1]) : undefined);
  let keySeq = 0;
  const nextKey = () => `item-${keySeq++}`;

  let currentDate: string | undefined;
  let currentDayNumber: number | undefined;
  let inChecklist = false;
  const consumed = new Set<number>();

  const addItem = (item: Omit<ParsedItem, 'key'>) => result.items.push({ ...item, key: nextKey() });

  // --- Bookings that span several lines (booking emails): paragraph-level pass.
  const paragraphs: number[][] = [];
  let block: number[] = [];
  lines.forEach((line, i) => {
    if (line.trim()) block.push(i);
    else if (block.length) {
      paragraphs.push(block);
      block = [];
    }
  });
  if (block.length) paragraphs.push(block);

  for (const rawPara of paragraphs) {
    const para = rawPara.filter((i) => !isMetaLine(lines[i]));
    if (para.length < 2) continue;
    const joined = para.map((i) => lines[i]).join('  ');
    const perLineHasBooking = para.some(
      (i) => (findFlight(lines[i]) && findDates(lines[i]).length) || isHotelLine(lines[i]),
    );
    if (perLineHasBooking) continue;
    const flight = findFlight(joined);
    if (flight && (flight.flightNumber || FLIGHT_WORD_RE.test(joined))) {
      const item = buildFlight(joined, flight, resolver, undefined);
      if (item) {
        addItem(item);
        para.forEach((i) => consumed.add(i));
        continue;
      }
    }
    if (HOTEL_RE.test(joined) && (findRanges(joined).length || findDates(joined).length >= 2)) {
      const item = buildHotel(joined, resolver, undefined, true);
      if (item) {
        addItem(item);
        para.forEach((i) => consumed.add(i));
      }
    }
  }

  // --- Line-by-line pass.
  lines.forEach((rawLine, index) => {
    if (consumed.has(index)) return;
    const line = rawLine.trim();
    if (!line) {
      inChecklist = false;
      return;
    }
    const bare = stripBullet(line);

    // Checklist items.
    const box = META_RE.checkbox.exec(line);
    if (box) {
      result.checklist.push(box[1].trim());
      return;
    }
    const checklistHeader = META_RE.checklistHeader.exec(bare);
    if (checklistHeader && !findDates(bare).length && !findTimes(bare).length) {
      inChecklist = true;
      const inline = checklistHeader[1].trim();
      if (inline) result.checklist.push(...inline.split(/\s*,\s*/).filter(Boolean));
      return;
    }
    if (inChecklist && BULLET_RE.test(line)) {
      result.checklist.push(bare);
      return;
    }
    inChecklist = false;

    // Trip-level metadata.
    const nameMeta = META_RE.name.exec(bare);
    if (nameMeta && !findDates(bare).length) {
      result.name = nameMeta[1].trim();
      return;
    }
    const destMeta = META_RE.destination.exec(bare);
    if (destMeta) {
      result.destination = destMeta[1].trim();
      return;
    }
    const travelersMeta = META_RE.travelers.exec(bare);
    if (travelersMeta) {
      result.travelerNames.push(...splitNames(travelersMeta[1]));
      return;
    }
    const datesMeta = META_RE.dates.exec(bare);
    if (datesMeta) {
      const range = rangeIn(datesMeta[1], resolver);
      if (range) {
        result.startDate = range[0];
        result.endDate = range[1];
        return;
      }
    }
    const budget = META_RE.budget.exec(bare);
    if (budget && !findTimes(bare).length) {
      result.budget = Number(budget[1].replace(/,/g, '')) * (budget[2] ? 1000 : 1);
      return;
    }

    // Day headers: "Day 3", "Day 3 (23 Nov): Macau", "Sat 21 Nov", "21 Nov – Arrival".
    const dayHeader = META_RE.dayHeader.exec(bare);
    if (dayHeader) {
      currentDayNumber = Number(dayHeader[1]);
      const inParens = dayHeader[2] ? findDates(dayHeader[2])[0] : undefined;
      let rest = dayHeader[3] ?? '';
      const leading = findDates(rest)[0];
      currentDate = inParens ? resolver.resolve(inParens) : leading && leading.index < 3 ? resolver.resolve(leading) : undefined;
      if (leading && leading.index < 3) rest = rest.slice(leading.index + leading.length);
      rest = tidy(rest);
      if (rest) parseActivityLine(rest, rawLine);
      return;
    }
    const leadingDate = findDates(bare)[0];
    const leadingRange = findRanges(bare)[0];
    const isLeadingDate =
      leadingDate &&
      (!leadingRange || leadingRange.index > leadingDate.index) &&
      tidy(bare.slice(0, leadingDate.index)) === '' &&
      !findFlight(bare) &&
      !(HOTEL_RE.test(bare) && (findRanges(bare).length || findDates(bare).length > 1));
    if (isLeadingDate) {
      currentDate = resolver.resolve(leadingDate);
      currentDayNumber = undefined;
      const rest = tidy(bare.slice(leadingDate.index + leadingDate.length));
      if (rest) parseActivityLine(rest, rawLine);
      return;
    }

    // Title-ish first line: "Hong Kong trip", "Trip to Hong Kong, Guangzhou and Shenzhen 21–30 Nov 2026".
    // A line that is only a date range sets the trip dates.
    const soleRange = findRanges(bare)[0];
    if (soleRange && !tidy(removeSpans(bare, [soleRange])) && !result.startDate) {
      result.startDate = resolver.resolve(soleRange.start);
      result.endDate = resolver.resolve(soleRange.end);
      return;
    }

    if (
      index === firstContentLine(lines) &&
      !META_RE.notATitle.test(bare) &&
      !findFlight(bare) &&
      !HOTEL_RE.test(bare) &&
      !findTimes(bare).length
    ) {
      const range = findRanges(bare)[0];
      if (range) {
        result.startDate ??= resolver.resolve(range.start);
        result.endDate ??= resolver.resolve(range.end);
      }
      const titleText = tidy(range ? removeSpans(bare, [range]) : bare);
      const tripTo = META_RE.tripTo.exec(titleText);
      if (tripTo) result.destination ??= tripTo[1].replace(/[.,]+$/, '').trim();
      const withNames = META_RE.withNames.exec(titleText);
      if (withNames) result.travelerNames.push(...splitNames(withNames[1]));
      const name = tidy(titleText.replace(META_RE.withNames, ''));
      if (name && name.split(/\s+/).length <= 8) {
        result.name ??= name;
        return;
      }
    }

    parseActivityLine(bare, rawLine);
  });

  function parseActivityLine(textLine: string, source: string) {
    const flight = findFlight(textLine);
    if (flight) {
      const item = buildFlight(textLine, flight, resolver, currentDate);
      if (item) {
        addItem({ ...item, source: source.trim() });
        return;
      }
    }
    if (HOTEL_RE.test(textLine) && !/\bcheck[- ]?out\b/i.test(textLine)) {
      const item = buildHotel(textLine, resolver, currentDate, false);
      if (item) {
        addItem({ ...item, source: source.trim(), dayNumber: item.date ? undefined : currentDayNumber });
        return;
      }
    }

    // Generic activity.
    const range = findRanges(textLine)[0];
    const dateHit = findDates(textLine)[0];
    const times = findTimes(textLine);
    const price = findPrice(textLine);
    const spans = [...(range ? [range] : dateHit ? [dateHit] : []), ...times.slice(0, 2), ...(price ? [price] : [])];
    let title = tidy(removeSpans(textLine, spans).replace(/\b(?:at|from|until|till|by)\s*$/i, ''));
    title = title.replace(/^(?:at|from|-|–)\s+/i, '').replace(/\s*[-–]\s*$/, '');
    if (!title || title.length < 2) {
      if (!range && !dateHit) result.unplaced.push(source.trim());
      return;
    }
    let location = '';
    const at = /\s(?:@|at)\s+([A-Z][^,;()]+)$/.exec(title);
    if (at) {
      location = at[1].trim();
      title = title.slice(0, at.index).trim() || title;
    }
    const date = range ? resolver.resolve(range.start) : dateHit ? resolver.resolve(dateHit) : currentDate;
    const dayNumber = date ? undefined : currentDayNumber;
    if (!date && !dayNumber) {
      // Without any date context, only keep lines that look like plans.
      if (!times.length && !price && !BULLET_RE.test(source)) {
        result.unplaced.push(source.trim());
        return;
      }
    }
    addItem({
      date,
      dayNumber,
      source: source.trim(),
      warnings: date || dayNumber ? [] : ['No date found'],
      activity: {
        kind: 'generic',
        title: title.charAt(0).toUpperCase() + title.slice(1),
        time: times[0]?.time ?? '',
        location,
        notes: '',
        category: categorize(textLine),
        ...(price ? { estimatedCost: price.amount } : {}),
      },
    });
  }

  finalize(result, ctx);
  return result;
}

function isMetaLine(line: string): boolean {
  const bare = stripBullet(line.trim());
  return [META_RE.name, META_RE.destination, META_RE.dates, META_RE.travelers].some((re) => re.test(bare)) || /^\s*budget\b/i.test(bare);
}

/** A single line that is a whole hotel booking: names a property and gives a date. */
function isHotelLine(line: string): boolean {
  if (!HOTEL_RE.test(line)) return false;
  const dates = findDates(line);
  const ranges = findRanges(line);
  if (!dates.length && !ranges.length) return false;
  const rest = removeSpans(line, [...ranges, ...dates, ...findTimes(line)]);
  return Boolean(cleanHotelName(rest).name);
}

function firstContentLine(lines: string[]): number {
  return lines.findIndex((l) => l.trim());
}

function rangeIn(text: string, resolver: DateResolver): [string, string] | undefined {
  const range = findRanges(text)[0];
  if (range) {
    const a = resolver.resolve(range.start);
    const b = resolver.resolve(range.end);
    if (a && b) return [a, b];
  }
  const dates = findDates(text);
  if (dates.length >= 2) {
    // Give the first date the second's year when only the latter has one.
    const first = dates[0].year ? dates[0] : { ...dates[0], year: dates[1].year };
    const a = resolver.resolve(first);
    const b = resolver.resolve(dates[1]);
    if (a && b) return [a, b];
  }
  return undefined;
}

function buildFlight(
  text: string,
  flight: FlightHit,
  resolver: DateResolver,
  contextDate: string | undefined,
): Omit<ParsedItem, 'key'> | undefined {
  const warnings: string[] = [];
  const dates = findDates(text).map((d) => resolver.resolve(d)).filter((d): d is string => Boolean(d));
  const depDate = dates[0] ?? contextDate;
  if (!depDate) return undefined;
  const times = findTimes(text);
  const depTime = times[0]?.time ?? '12:00';
  if (!times[0]) warnings.push('No departure time found');
  let arrDate = dates[1] ?? depDate;
  let arrTime = times[1]?.time;
  if (!arrTime) {
    arrTime = depTime;
    warnings.push('No arrival time found');
  }
  if (/\+\s?1\b/.test(text) && !dates[1]) arrDate = addDays(depDate, 1);
  if (joinDateTime(arrDate, arrTime) <= joinDateTime(depDate, depTime)) {
    if (times[1]) arrDate = addDays(arrDate, 1);
    else arrTime = addMinutes(depTime, 60);
  }
  const airlineMatch = /\b(Cathay(?: Pacific)?|Qantas|Jetstar|Virgin(?: Australia)?|Singapore Airlines|Scoot|Emirates|Qatar(?: Airways)?|ANA|JAL|Japan Airlines|Air New Zealand|Air China|China Southern|China Eastern|Hong Kong Airlines|HK Express|AirAsia|Cebu Pacific|Thai(?: Airways)?|Korean Air|Asiana|EVA Air|China Airlines|Malaysia Airlines|Vietnam Airlines|Philippine Airlines|British Airways|Lufthansa|Air France|KLM|United|Delta|American Airlines)\b/i.exec(text);
  const details: FlightDetails = {
    type: 'flight',
    airline: airlineMatch?.[1] ?? '',
    flightNumber: flight.flightNumber,
    departureAirport: flight.from,
    arrivalAirport: flight.to,
    departureDateTime: joinDateTime(depDate, depTime),
    arrivalDateTime: joinDateTime(arrDate, arrTime),
  };
  const ref = /\b(?:booking|confirmation|reference|ref|pnr|record locator)\b[^A-Z0-9]*([A-Z0-9]{5,8})\b/i.exec(text);
  if (ref) details.bookingReference = ref[1].toUpperCase();
  const seat = /\bseat\s*:?\s*(\d{1,2}[A-K])\b/i.exec(text);
  if (seat) details.seat = seat[1].toUpperCase();
  const price = findPrice(text);
  return {
    date: depDate,
    source: text.trim(),
    warnings,
    activity: {
      kind: 'flight',
      title: buildFlightTitle(details),
      time: depTime,
      location: '',
      notes: '',
      category: 'transport',
      details,
      ...(price ? { estimatedCost: price.amount } : {}),
    },
  };
}

function buildHotel(
  text: string,
  resolver: DateResolver,
  contextDate: string | undefined,
  multiline: boolean,
): Omit<ParsedItem, 'key'> | undefined {
  const warnings: string[] = [];
  let checkIn: string | undefined;
  let checkOut: string | undefined;
  const range = findRanges(text)[0];
  const dates = findDates(text);
  const spans: { index: number; length: number }[] = [];
  if (range) {
    checkIn = resolver.resolve(range.start);
    checkOut = resolver.resolve(range.end);
    spans.push(range);
  } else if (dates.length >= 2) {
    checkIn = resolver.resolve(dates[0].year ? dates[0] : { ...dates[0], year: dates[1].year });
    checkOut = resolver.resolve(dates[1]);
    spans.push(dates[0], dates[1]);
  } else if (dates.length === 1) {
    checkIn = resolver.resolve(dates[0]);
    spans.push(dates[0]);
  } else {
    checkIn = contextDate;
  }
  const nights = /\b(\d{1,2})\s*nights?\b/i.exec(text);
  if (checkIn && !checkOut && nights) checkOut = addDays(checkIn, Number(nights[1]));

  const times = findTimes(text);
  const price = findPrice(text);
  if (price) spans.push(price);
  spans.push(...times);
  const ref = /\b(?:booking|confirmation|reference|ref)\b[^A-Z0-9]*([A-Z0-9]{5,12})\b/i.exec(text);
  if (ref) spans.push({ index: ref.index, length: ref[0].length });

  let nameSource = removeSpans(text, spans);
  if (multiline) {
    // Booking emails: prefer the line that names the property.
    const named = /([A-Z][\w'’&.-]*(?:\s+[A-Z][\w'’&.-]*)*\s+(?:Hotel|Hostel|Resort|Inn|Suites?|Lodge|Apartments?)|(?:Hotel|Hostel|Resort)\s+[A-Z][\w'’&.-]*(?:\s+[A-Z][\w'’&.-]*)*)/.exec(nameSource);
    if (named) nameSource = named[1];
  }
  const nameMatch = /\b(?:staying at|stay at|check[- ]?in(?: at)?)\s+(.+)/i.exec(nameSource);
  const cleaned = cleanHotelName(nameMatch ? nameMatch[1] : nameSource);
  const name = cleaned.name;
  let address = cleaned.address;
  if (multiline && name && !address) {
    // In booking emails the address is usually the line after the property name.
    const segments = text.split(/\s{2,}/).map((s) => s.trim());
    const at = segments.findIndex((s) => s.includes(name));
    const next = at >= 0 ? segments[at + 1] : undefined;
    if (next && !HOTEL_RE.test(next) && !findDates(next).length && !findTimes(next).length && !/\d{5,}/.test(next)) {
      address = next;
    }
  }
  if (!name) return undefined;
  if (!checkIn) return undefined;
  if (!checkOut) warnings.push('No check-out date found');

  const details: HotelDetails = {
    type: 'hotel',
    hotelName: name,
    address,
    checkInDate: checkIn,
    checkOutDate: checkOut ?? '',
  };
  if (times[0]) details.checkInTime = times[0].time;
  if (times[1]) details.checkOutTime = times[1].time;
  if (ref) details.bookingReference = ref[1].toUpperCase();
  return {
    date: checkIn,
    source: text.trim(),
    warnings,
    activity: {
      kind: 'hotel',
      title: buildHotelTitle(details),
      time: details.checkInTime ?? DEFAULT_CHECK_IN_TIME,
      location: address,
      notes: '',
      category: 'accommodation',
      details,
      ...(price ? { estimatedCost: price.amount } : {}),
    },
  };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Fill the trip range, hotel check-outs and destination from what was found. */
function finalize(result: ParsedTripText, ctx: ParseContext): void {
  const dates: string[] = [];
  for (const item of result.items) {
    if (item.date) dates.push(item.date);
    const d = item.activity.details;
    if (d?.type === 'hotel' && d.checkOutDate) dates.push(d.checkOutDate);
  }
  dates.sort(compareDateKeys);
  const start = result.startDate ?? ctx.startDate ?? dates[0];
  const maxDay = Math.max(0, ...result.items.map((i) => i.dayNumber ?? 0));
  let end = result.endDate ?? ctx.endDate ?? dates[dates.length - 1];
  if (start && maxDay) {
    const byDays = addDays(start, maxDay - 1);
    if (!end || compareDateKeys(byDays, end) > 0) end = byDays;
  }
  if (!ctx.startDate) {
    result.startDate = start;
    result.endDate = end && start && compareDateKeys(end, start) >= 0 ? end : start;
  }

  // Hotels without a check-out stay until the next hotel, or the end of the trip.
  const hotels = result.items
    .filter((i) => i.activity.details?.type === 'hotel')
    .sort((a, b) => compareDateKeys(a.date ?? '', b.date ?? ''));
  hotels.forEach((item, i) => {
    const d = item.activity.details as HotelDetails;
    if (d.checkOutDate) return;
    const next = hotels.slice(i + 1).find((h) => compareDateKeys(h.date ?? '', d.checkInDate) > 0)?.date;
    const tripEnd = ctx.endDate ?? result.endDate;
    let out = next ?? tripEnd ?? addDays(d.checkInDate, 1);
    if (compareDateKeys(out, d.checkInDate) <= 0) out = addDays(d.checkInDate, 1);
    d.checkOutDate = out;
  });

  if (!result.destination && !ctx.startDate) {
    const flights = result.items
      .map((i) => i.activity.details)
      .filter((d): d is FlightDetails => d?.type === 'flight');
    const home = flights[0]?.departureAirport;
    const cities = flights
      .map((f) => f.arrivalAirport)
      .filter((code) => code !== home)
      .map((code) => AIRPORT_CITIES[code] ?? code);
    const unique = cities.filter((c, i) => cities.indexOf(c) === i);
    if (unique.length) result.destination = unique.join(', ');
  }
  if (!result.name && !ctx.startDate) {
    result.name = result.destination ? `${result.destination.split(',')[0]} trip` : undefined;
  }
  result.travelerNames = result.travelerNames.filter(
    (n, i, all) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i,
  );
}

/** Where an item lands, given the (possibly user-edited) trip start. */
export function resolveItemDate(item: ParsedItem, startDate: string | undefined): string | undefined {
  if (item.date) return item.date;
  if (item.dayNumber && startDate && isDateKey(startDate)) return addDays(startDate, item.dayNumber - 1);
  return startDate && isDateKey(startDate) ? startDate : undefined;
}