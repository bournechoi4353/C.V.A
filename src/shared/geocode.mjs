// Place-name → coordinates via Open-Meteo's free geocoder, hardened for how people
// actually say places. The raw API is name-prefix-only: "Washington DC" returns ZERO
// results (verified) while "Washington" returns Washington D.C. as the top hit. So we
// try progressively shorter queries and use the dropped words as a disambiguation hint
// ("dc" → District of Columbia, "france" → country France, "tx" → Texas).
//
// Plain JS (not TS) so the Electron main process and the Node test harness
// (scripts/test-geocode.mjs) share the exact same logic.

/* global fetch, AbortSignal -- built-in in both runtimes (Node 18+, Electron main) */

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search'

// US state/territory abbreviations → admin1 names, for hints like "DC", "TX", "NY".
const US_STATES = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
  co: 'Colorado', ct: 'Connecticut', de: 'Delaware', dc: 'District of Columbia',
  fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho', il: 'Illinois',
  in: 'Indiana', ia: 'Iowa', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana',
  me: 'Maine', md: 'Maryland', ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota',
  ms: 'Mississippi', mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada',
  nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York',
  nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon',
  pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota',
  tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia',
  wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming',
  pr: 'Puerto Rico',
}

// Coordinates never change — cache lookups for the process lifetime.
const cache = new Map()

async function search(name) {
  const res = await fetch(
    `${GEO_URL}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`,
    { signal: AbortSignal.timeout(8000) },
  )
  const json = await res.json()
  return json.results ?? []
}

function expandHint(hint) {
  const bare = hint.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return US_STATES[bare] ?? bare
}

function hintMatches(place, hint) {
  const expanded = expandHint(hint)
  if (!expanded) return true
  const fields = [place.admin1, place.country, place.country_code]
    .filter(Boolean)
    .map((s) => s.toLowerCase())
  return fields.some((f) => f === expanded || f.includes(expanded) || expanded.includes(f))
}

/**
 * Resolve a spoken location ("Washington DC", "Paris, France", "Paris Texas",
 * "St. Louis") to a geocoded place. Throws if nothing plausible is found.
 */
export async function geocode(location) {
  const key = location.trim().toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached

  // Query plans, in order: the raw string; without periods ("D.C." → "DC"); the part
  // before a comma with the rest as a hint; then progressively fewer leading words
  // with the dropped tail as a hint ("Washington DC" → "Washington" + hint "dc").
  const cleaned = location.replace(/\./g, '').replace(/\s+/g, ' ').trim()
  const plans = [[location.trim(), '']]
  if (cleaned !== location.trim()) plans.push([cleaned, ''])
  const comma = cleaned.indexOf(',')
  if (comma > 0) {
    plans.push([cleaned.slice(0, comma).trim(), cleaned.slice(comma + 1).trim()])
  }
  const words = cleaned.replace(/,/g, ' ').replace(/\s+/g, ' ').split(' ')
  for (let n = words.length - 1; n >= 1; n--) {
    plans.push([words.slice(0, n).join(' '), words.slice(n).join(' ')])
  }

  const seen = new Set()
  let fallback = null
  for (const [query, hint] of plans) {
    const planKey = `${query}|${hint}`.toLowerCase()
    if (!query || seen.has(planKey)) continue
    seen.add(planKey)

    const results = await search(query)
    if (!results.length) continue
    fallback ??= results[0]

    const place = hint ? results.find((r) => hintMatches(r, hint)) : results[0]
    if (place) {
      cache.set(key, place)
      return place
    }
  }

  // Some plan returned results but none matched the hint — better than nothing.
  if (fallback) {
    cache.set(key, fallback)
    return fallback
  }
  throw new Error(`Couldn't find a place called "${location}".`)
}
