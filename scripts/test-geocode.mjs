// Tests the shared geocoder against the real Open-Meteo API — the exact module the
// weather tool ships. Cases are spoken-style place names that the raw API fails on.
// Run: node scripts/test-geocode.mjs

import { geocode } from '../src/shared/geocode.mjs'

const CASES = [
  // [input, expected name fragment, expected admin1/country fragment]
  ['Washington DC', 'Washington', 'District of Columbia'], // raw API: ZERO results
  ['washington d.c.', 'Washington', 'District of Columbia'],
  ['Washington', 'Washington', 'District of Columbia'], // bare — top hit is D.C.
  ['New York City', 'New York', 'New York'],
  ['NYC', 'New York', 'New York'],
  ['Paris', 'Paris', 'France'],
  ['Paris, France', 'Paris', 'France'],
  ['Paris Texas', 'Paris', 'Texas'],
  ['St. Louis', 'St Louis', 'Missouri'], // API spells it without the dot
  ['San Francisco', 'San Francisco', 'California'],
  ['Tokyo', 'Tokyo', 'Japan'],
  ['Seattle WA', 'Seattle', 'Washington'],
  ['Portland Maine', 'Portland', 'Maine'],
  ['London', 'London', 'United Kingdom'],
]

let failures = 0
for (const [input, wantName, wantRegion] of CASES) {
  try {
    const p = await geocode(input)
    const region = `${p.admin1 ?? ''} ${p.country ?? ''}`
    const ok =
      p.name.toLowerCase().includes(wantName.toLowerCase()) &&
      region.toLowerCase().includes(wantRegion.toLowerCase())
    if (!ok) {
      failures++
      console.error(`✗ ${JSON.stringify(input)} → ${p.name}, ${p.admin1 ?? ''}, ${p.country ?? ''} (wanted ${wantName} / ${wantRegion})`)
    } else {
      console.log(`✓ ${JSON.stringify(input)} → ${p.name}, ${p.admin1 ?? p.country}`)
    }
  } catch (err) {
    failures++
    console.error(`✗ ${JSON.stringify(input)} → threw: ${err.message}`)
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll geocode cases pass.')
