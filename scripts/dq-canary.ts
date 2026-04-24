/**
 * DQ Canary — scripts/dq-canary.ts
 *
 * Validates that the company intelligence pipeline correctly identifies
 * the known leadership of Clockwork Systems Inc (ground truth: Crunchbase).
 *
 * Run locally:   npx tsx scripts/dq-canary.ts
 * Run in CI:     npm run canary
 *
 * Exits 0 if all checks pass, 1 if any fail.
 *
 * Required env vars (loaded from .env.local in dev):
 *   SERP_API_KEY
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load .env.local BEFORE any other imports that touch env vars.
// We use a dynamic import below so the module isn't hoisted above this call.
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
  console.log('Loaded env from .env.local')
} else {
  console.log('No .env.local found — using process environment')
}

// fetchCompanyIntelligence is dynamically imported inside main() below
// so that dotenv runs before research-agent's module-level Supabase init.

// ── Ground truth (source: Crunchbase, verified Apr 2026) ─────────────────────
const COMPANY = 'Clockwork Systems Inc'

interface ExpectedPerson {
  name:       string
  lastName:   string   // used for fuzzy matching
  roles:      string[] // any of these is acceptable
  title:      string   // for display only
}

const EXPECTED: ExpectedPerson[] = [
  { name: 'Balaji Prabhakar', lastName: 'prabhakar', roles: ['ceo', 'founder'], title: 'Co-Founder & CEO'  },
  { name: 'Yilong Geng',      lastName: 'geng',      roles: ['cto', 'founder'], title: 'Co-Founder & CTO'  },
  { name: 'Deepak Merugu',    lastName: 'merugu',     roles: ['founder'],        title: 'Co-Founder'         },
  { name: 'Suresh Vasudevan', lastName: 'vasudevan',  roles: ['ceo', 'founder'], title: 'CEO'               },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalize(s: string) { return s.toLowerCase().trim() }

function nameMatches(entityName: string, expected: ExpectedPerson): boolean {
  const n = normalize(entityName)
  return n.includes(expected.lastName) || n.includes(normalize(expected.name))
}

const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

function pass(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`) }
function warn(msg: string) { console.log(`  ${YELLOW}~${RESET} ${msg}`) }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Dynamic import here (not top-level) so dotenv runs first.
  // Imports from lib/company-intelligence — no Inngest/Supabase/Anthropic deps.
  const { fetchCompanyIntelligence } = await import('../lib/company-intelligence')

  console.log(`\n${BOLD}DQ Canary — ${COMPANY}${RESET}`)
  console.log('─'.repeat(50))
  console.log('Calling fetchCompanyIntelligence…\n')

  const start = Date.now()
  const result = await fetchCompanyIntelligence(COMPANY)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`Completed in ${elapsed}s`)
  console.log(`Website detected: ${result.website ?? '(none — phases 1d/1e skipped)'}`)
  console.log(`Found ${result.entities.length} entit${result.entities.length === 1 ? 'y' : 'ies'}:\n`)

  for (const e of result.entities) {
    console.log(`  • ${e.name} [${e.role}] (source: ${e.source})`)
  }

  console.log(`\n${BOLD}Validation against ground truth (Crunchbase):${RESET}`)
  console.log('─'.repeat(50))

  let failures = 0

  for (const expected of EXPECTED) {
    const match = result.entities.find((e) => nameMatches(e.name, expected))

    if (!match) {
      fail(`${expected.name} (${expected.title}) — NOT FOUND`)
      failures++
      continue
    }

    const roleOk = expected.roles.includes(match.role)
    if (roleOk) {
      pass(`${expected.name} — found as [${match.role}] ✓`)
    } else {
      warn(`${expected.name} — found but role is [${match.role}], expected one of [${expected.roles.join('/')}]`)
      // Role mismatch is a warning, not a hard failure
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50))

  const found   = EXPECTED.filter((e) => result.entities.find((r) => nameMatches(r.name, e))).length
  const missing = EXPECTED.length - found

  if (failures === 0) {
    console.log(`${GREEN}${BOLD}PASS${RESET} — all ${EXPECTED.length} expected people found (${found}/${EXPECTED.length})`)
  } else {
    console.log(`${RED}${BOLD}FAIL${RESET} — ${missing} of ${EXPECTED.length} expected people missing`)
    console.log(`\nTip: The pipeline extracts people from SerpAPI + Nubela/NinjaPear.`)
    console.log(`     Adding NUBELA_API_KEY improves coverage significantly (company/details endpoint).`)
    console.log(`     Adding CRUNCHBASE_API_KEY also helps for alternative coverage.`)
  }

  // Extra entities not in expected list (bonus finds — good)
  const extras = result.entities.filter((e) => !EXPECTED.find((ex) => nameMatches(e.name, ex)))
  if (extras.length > 0) {
    console.log(`\nBonus finds (not in ground truth but extracted):`)
    for (const e of extras) console.log(`  + ${e.name} [${e.role}]`)
  }

  console.log('')
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Canary crashed:', err)
  process.exit(1)
})
