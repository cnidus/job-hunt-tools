'use client'

import { useState } from 'react'
import type { ResearchPaper, ResearchPatent, RelevanceCategory } from '@/lib/types'
import { RELEVANCE_LABELS, RELEVANCE_COLORS } from '@/lib/types'

interface Props {
  papers:  ResearchPaper[]
  patents: ResearchPatent[]
}

type FilterKey = 'all' | RelevanceCategory | 'unscored' | 'patents'

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all',              label: 'All' },
  { id: 'core_to_company',  label: '🏛 Core' },
  { id: 'relevant_to_role', label: '✅ Role' },
  { id: 'tangential',       label: '↗ Tangential' },
  { id: 'patents',          label: '📋 Patents' },
  { id: 'unscored',         label: '⏳ Unscored' },
]

function RelevanceBadge({ category }: { category: RelevanceCategory | null }) {
  if (!category) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-400 border-gray-200">
        Unscored
      </span>
    )
  }
  const c = RELEVANCE_COLORS[category]
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      {RELEVANCE_LABELS[category]}
    </span>
  )
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'bg-purple-400' : pct >= 40 ? 'bg-green-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-6 text-right">{pct}%</span>
    </div>
  )
}

function PaperCard({ paper }: { paper: ResearchPaper }) {
  const [expanded, setExpanded] = useState(false)
  const authors = (paper.authors ?? []).map(a => a.name).join(', ')

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {paper.url ? (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors leading-snug"
            >
              {paper.title}
            </a>
          ) : (
            <p className="text-sm font-semibold text-gray-800 leading-snug">{paper.title}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {authors && <span>{authors} · </span>}
            {paper.year && <span>{paper.year} · </span>}
            {paper.citation_count != null && paper.citation_count > 0 && (
              <span>{paper.citation_count.toLocaleString()} citations · </span>
            )}
            <span className="capitalize">{paper.source.replace('_', ' ')}</span>
          </p>
        </div>
        <RelevanceBadge category={paper.relevance_category} />
      </div>

      <ScoreBar score={paper.relevance_score} />

      {paper.relevance_note && (
        <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed border border-gray-100">
          💡 {paper.relevance_note}
        </p>
      )}

      {paper.abstract && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            {expanded ? 'Hide abstract ↑' : 'Show abstract ↓'}
          </button>
          {expanded && (
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{paper.abstract}</p>
          )}
        </div>
      )}
    </div>
  )
}

function PatentCard({ patent }: { patent: ResearchPatent }) {
  const [expanded, setExpanded] = useState(false)
  const inventors = (patent.inventors ?? []).map(i => i.name).join(', ')

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {patent.url ? (
            <a
              href={patent.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors leading-snug"
            >
              {patent.title}
            </a>
          ) : (
            <p className="text-sm font-semibold text-gray-800 leading-snug">{patent.title}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {inventors && <span>{inventors} · </span>}
            {patent.patent_number && <span>#{patent.patent_number} · </span>}
            {patent.grant_date && (
              <span>Granted {new Date(patent.grant_date).getFullYear()} · </span>
            )}
            <span>Patent</span>
          </p>
        </div>
        <RelevanceBadge category={patent.relevance_category} />
      </div>

      <ScoreBar score={patent.relevance_score} />

      {patent.relevance_note && (
        <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed border border-gray-100">
          💡 {patent.relevance_note}
        </p>
      )}

      {patent.abstract && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            {expanded ? 'Hide abstract ↑' : 'Show abstract ↓'}
          </button>
          {expanded && (
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{patent.abstract}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ResearchPapers({ papers, patents }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all')

  const filteredPapers = filter === 'patents' ? [] : papers.filter((p) => {
    if (filter === 'all')    return true
    if (filter === 'unscored') return !p.relevance_category
    return p.relevance_category === filter
  })

  const filteredPatents = filter === 'all' || filter === 'patents'
    ? patents
    : filter === 'unscored'
    ? patents.filter(p => !p.relevance_category)
    : patents.filter(p => p.relevance_category === filter)

  // Sort by relevance_score desc, nulls last
  const sortedPapers  = [...filteredPapers].sort((a, b) =>
    (b.relevance_score ?? -1) - (a.relevance_score ?? -1)
  )
  const sortedPatents = [...filteredPatents].sort((a, b) =>
    (b.relevance_score ?? -1) - (a.relevance_score ?? -1)
  )

  const totalCount = papers.length + patents.length

  if (!totalCount) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">🔬</div>
        <p className="text-sm font-medium text-gray-600 mb-1">No research found yet</p>
        <p className="text-xs text-gray-400">Run the research agent to search for papers and patents by the company&apos;s key people.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
        {FILTERS.map((f) => {
          const count = f.id === 'all'
            ? totalCount
            : f.id === 'patents'
            ? patents.length
            : f.id === 'unscored'
            ? [...papers, ...patents].filter(p => !p.relevance_category).length
            : [...papers, ...patents].filter(p => p.relevance_category === f.id).length

          if (count === 0 && f.id !== 'all') return null

          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${
                filter === f.id
                  ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {f.label}
              <span className={`text-[10px] ${filter === f.id ? 'text-blue-200' : 'text-gray-400'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Papers */}
      {sortedPapers.length > 0 && (
        <div className="space-y-3 mb-6">
          {filter === 'all' && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Research Papers ({sortedPapers.length})
            </p>
          )}
          {sortedPapers.map((p) => <PaperCard key={p.id} paper={p} />)}
        </div>
      )}

      {/* Patents */}
      {sortedPatents.length > 0 && (
        <div className="space-y-3">
          {(filter === 'all' || filter === 'patents') && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Patents ({sortedPatents.length})
            </p>
          )}
          {sortedPatents.map((p) => <PatentCard key={p.id} patent={p} />)}
        </div>
      )}
    </div>
  )
}
