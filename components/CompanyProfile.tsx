'use client'

import type { CompanyProfile, CompanyEntity, CompanyInvestor } from '@/lib/types'

interface Props {
  profile: CompanyProfile | null
  entities: CompanyEntity[]
  investors: CompanyInvestor[]
}

function formatUSD(n: number | null): string {
  if (!n) return '—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function Chip({ children, href }: { children: React.ReactNode; href?: string | null }) {
  const cls = 'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200'
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls + ' hover:bg-gray-200 transition-colors'}>{children}</a>
  }
  return <span className={cls}>{children}</span>
}

function SectionHead({ title }: { title: string }) {
  return <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{title}</h3>
}

export default function CompanyProfile({ profile, entities, investors }: Props) {
  const founders   = entities.filter(e => e.entity_type === 'founder' || e.entity_type === 'executive')
  const leadInvest = investors.filter(i => i.lead_investor)
  const otherInvest= investors.filter(i => !i.lead_investor)

  if (!profile && !entities.length) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">🏢</div>
        <p className="text-sm font-medium text-gray-600 mb-1">No company data yet</p>
        <p className="text-xs text-gray-400">Run the research agent to fetch Crunchbase data, founder profiles, and funding history.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Company snapshot ──────────────────────────────────────────────── */}
      {profile && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionHead title="Company Snapshot" />

          {profile.short_description && (
            <p className="text-sm text-gray-700 mb-4 leading-relaxed">{profile.short_description}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {profile.founded_year && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Founded</div>
                <div className="text-sm font-bold text-gray-800">{profile.founded_year}</div>
              </div>
            )}
            {profile.employee_count_label && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Team size</div>
                <div className="text-sm font-bold text-gray-800">{profile.employee_count_label}</div>
              </div>
            )}
            {profile.total_funding_usd && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Total raised</div>
                <div className="text-sm font-bold text-gray-800">{formatUSD(profile.total_funding_usd)}</div>
              </div>
            )}
            {profile.last_round_type && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Last round</div>
                <div className="text-sm font-bold text-gray-800">{profile.last_round_type}</div>
                {profile.last_round_date && (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(profile.last_round_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {profile.crunchbase_url && <Chip href={profile.crunchbase_url}>📊 Crunchbase</Chip>}
            {profile.linkedin_url   && <Chip href={profile.linkedin_url}>💼 LinkedIn</Chip>}
            {profile.twitter_url    && <Chip href={profile.twitter_url}>𝕏 Twitter</Chip>}
          </div>

          {profile.last_crunchbase_fetch && (
            <p className="text-[10px] text-gray-300 mt-3">
              Crunchbase data as of {new Date(profile.last_crunchbase_fetch).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* ── Key people ────────────────────────────────────────────────────── */}
      {founders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionHead title="Key People" />
          <div className="space-y-3">
            {founders.map((entity) => (
              <div key={entity.id} className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-gray-800">{entity.name}</span>
                  {entity.title && (
                    <span className="text-xs text-gray-500 ml-2">{entity.title}</span>
                  )}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-gray-400 uppercase font-semibold">
                      {entity.entity_type}
                    </span>
                    <span className="text-[10px] text-gray-300 mx-1">·</span>
                    <span className="text-[10px] text-gray-400">via {entity.source}</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {entity.linkedin_url && (
                    <a
                      href={entity.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors"
                    >
                      LinkedIn →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Investors ─────────────────────────────────────────────────────── */}
      {(leadInvest.length > 0 || otherInvest.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionHead title="Investors" />
          {leadInvest.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Lead Investors</p>
              <div className="flex flex-wrap gap-2">
                {leadInvest.map((inv) => (
                  <Chip key={inv.id} href={inv.crunchbase_url}>⭐ {inv.name}</Chip>
                ))}
              </div>
            </div>
          )}
          {otherInvest.length > 0 && (
            <div>
              {leadInvest.length > 0 && (
                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Other</p>
              )}
              <div className="flex flex-wrap gap-2">
                {otherInvest.map((inv) => (
                  <Chip key={inv.id} href={inv.crunchbase_url}>{inv.name}</Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state if profile missing but entities exist ─────────────── */}
      {!profile && entities.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
          ℹ Company profile data not available (Crunchbase may not have found this company). Key people were sourced from web search.
        </div>
      )}
    </div>
  )
}
