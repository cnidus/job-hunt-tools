'use client'

import type { CompanyProfile, CompanyEntity, CompanyInvestor } from '@/lib/types'

interface Props {
  profile:   CompanyProfile | null
  entities:  CompanyEntity[]
  investors: CompanyInvestor[]
}

function formatUSD(millions: number | null): string {
  if (millions === null) return '—'
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`
  return `$${millions}M`
}

const ROLE_ORDER = ['founder', 'ceo', 'cto', 'vp', 'advisor', 'board', 'investor']

const ROLE_BADGES: Record<string, string> = {
  founder:  'bg-blue-100 text-blue-700',
  ceo:      'bg-purple-100 text-purple-700',
  cto:      'bg-indigo-100 text-indigo-700',
  vp:       'bg-teal-100 text-teal-700',
  advisor:  'bg-yellow-100 text-yellow-700',
  board:    'bg-orange-100 text-orange-700',
  investor: 'bg-green-100 text-green-700',
}

export default function CompanyProfile({ profile, entities, investors }: Props) {
  if (!profile) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
        No company data yet. Run research to populate this section.
      </div>
    )
  }

  const sortedEntities = [...entities].sort((a, b) => {
    return (ROLE_ORDER.indexOf(a.role) ?? 99) - (ROLE_ORDER.indexOf(b.role) ?? 99)
  })

  return (
    <div className="space-y-4">
      {/* Snapshot stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Employees',    value: profile.employee_count ?? '—' },
          { label: 'Founded',      value: profile.founded_year?.toString() ?? '—' },
          { label: 'HQ',           value: profile.hq_location ?? '—' },
          { label: 'Total Raised', value: formatUSD(profile.funding_total) },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className="text-sm font-bold text-gray-800 truncate" title={stat.value}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Description */}
      {profile.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</p>
          <p className="text-sm text-gray-700 leading-relaxed">{profile.description}</p>
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs text-[#3d74cc] hover:underline"
            >
              {profile.website} ↗
            </a>
          )}
        </div>
      )}

      {/* Funding */}
      {(profile.funding_total || profile.funding_stage) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Funding</p>
          <div className="flex items-center gap-4">
            {profile.funding_total && (
              <div>
                <p className="text-xl font-bold text-gray-800">{formatUSD(profile.funding_total)}</p>
                <p className="text-xs text-gray-400">Total raised</p>
              </div>
            )}
            {profile.funding_stage && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                {profile.funding_stage}
              </span>
            )}
          </div>

          {investors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {investors.map((inv) => (
                <span key={inv.id} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                  {inv.name}{inv.stage ? ` (${inv.stage})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Key people */}
      {sortedEntities.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Key People</p>
          <div className="space-y-3">
            {sortedEntities.map((entity) => (
              <div key={entity.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#e8effc] flex items-center justify-center text-xs font-bold text-[#3d74cc] shrink-0">
                  {entity.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{entity.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${ROLE_BADGES[entity.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {entity.role}
                    </span>
                  </div>
                  {entity.title && (
                    <p className="text-xs text-gray-500 truncate">{entity.title}</p>
                  )}
                </div>
                {entity.linkedin_url && (
                  <a
                    href={entity.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-[#0a66c2] hover:underline"
                    title="LinkedIn"
                  >
                    in
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
