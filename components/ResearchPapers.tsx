'use client'

import { useState } from 'react'
import type { ResearchPaper, ResearchPatent, RelevanceCategory } from '@/lib/types'
import { RELEVANCE_LABELS, RELEVANCE_COLORS } from '@/lib/types'

interface Props {
  papers:  ResearchPaper[]
  patents: ResearchPatent[]
}

type Filter = 'all' | 'core_to_company' | 'relevant_to_role' | 'tangential' | 'patents' | 'unscored'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',             label: 'All' },
  { id: 'core_to_company', label: '🔵 Core' },
  { id: 'relevant_to_role',label: '🟢 Role' },
  { id: 'tangential',      label: '🟡 Tangential' },
  { id: 'patents',         label: '📋 Patents' },
  { id: 'unscored',        label: '⏳ Unscored' },
]

function RelevanceBadge({ category }: { category: RelevanceCategory | null }) {
  if (!category) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Unscored</span>
  const colors = RELEVANCE_COLORS[category]
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
      {RELEVANCE_LABELS[category]}
    </span>
  )
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return null
  const pct = Math.round(score * 100)
  const color = score >= 0.7 ? 'bg-blue-500' : score >= 0.4 ? 'bg-green-500' : 'bg-yellow-400'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-7 text-right">{pct}%</span>
    </div>
  )
}

function PaperCard({ paper }: { paper: ResearchPaper }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <RelevanceBadge category={paper.relevance_category} />
            {paper.year && <span className="text-xs text-gray-400">{paper.year}</span>}
            {paper.citation_count > 0 && (
              <span className="text-xs text-gray-400">{paper.citation_count.toLocaleString()} citations</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-800 leading-snug">
            {paper.url ? (
              <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#3d74cc] hover:underline">
                {paper.title}
              </a>
            ) : paper.title}
          </h3>
          <ScoreBar score={paper.relevance_score} />
        </div>
      </div>

      {paper.authors.length > 0 && (
        <p className="text-xs text-gray-500 mb-2">
          {paper.authors.slice(0, 4).join(', ')}{paper.authors.length > 4 ? ` +${paper.authors.length - 4}` : ''}
          {paper.venue ? ` · ${paper.venue}` : ''}
        </p>
      )}

      {paper.entity_name && (
        <p className="text-xs text-[#3d74cc] mb-2">Found via {paper.entity_name}</p>
      )}

      {paper.relevance_note && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <p className="text-xs text-blue-700 leading-relaxed">💡 {paper.relevance_note}</p>
        </div>
      )}

      {paper.abstract && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? '▲ Hide abstract' : '▼ Show abstract'}
          </button>
          {expanded && (
            <p className="mt-2 text-xs text-gray-600 leading-relaxed">{paper.abstract}</p>
          )}
        </div>
      )}
    </div>
  )
}

function PatentCard({ patent }: { patent: ResearchPatent }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">Patent</span>
            <RelevanceBadge category={patent.relevance_category} />
            {patent.filing_date && <span className="text-xs text-gray-400">Filed {patent.filing_date}</span>}
          </div>
          <h3 className="text-sm font-semibold text-gray-800 leading-snug">
            {patent.url ? (
              <a href={patent.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#3d74cc] hover:underline">
                {patent.title}
              </a>
            ) : patent.title}
          </h3>
          <ScoreBar score={patent.relevance_score} />
        </div>
      </div>

      {patent.inventors.length > 0 && (
        <p className="text-xs text-gray-500 mb-2">
          {patent.inventors.join(', ')}
          {patent.assignee ? ` · ${patent.assignee}` : ''}
        </p>
      )}

      {patent.patent_id && (
        <p className="text-xs text-gray-400 mb-2">Patent {patent.patent_id}</p>
      )}

      {patent.relevance_note && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <p className="text-xs text-blue-700 leading-relaxed">💡 {patent.relevance_note}</p>
        </div>
      )}

      {patent.abstract && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? '▲ Hide abstract' : '▼ Show abstract'}
          </button>
          {expanded && (
            <p className="mt-2 text-xs text-gray-600 leading-relaxed">{patent.abstract}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ResearchPapers({ papers, patents }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const filteredPapers = papers.filter((p) => {
    if (filter === 'patents')   return false
    if (filter === 'unscored')  return !p.relevance_category
    if (filter === 'all')       return p.relevance_category !== 'not_relevant'
    return p.relevance_category === filter
  })

  const filteredPatents = patents.filter((p) => {
    if (filter === 'unscored') return !p.relevance_category
    if (filter === 'patents')  return true
    if (filter === 'all')      return p.relevance_category !== 'not_relevant'
    return p.relevance_category === filter
  })

  const counts: Record<Filter, number> = {
    all:              papers.filter((p) => p.relevance_category !== 'not_relevant').length + patents.filter((p) => p.relevance_category !== 'not_relevant').length,
    core_to_company:  papers.filter((p) => p.relevance_category === 'core_to_company').length,
    relevant_to_role: papers.filter((p) => p.relevance_category === 'relevant_to_role').length,
    tangential:       papers.filter((p) => p.relevance_category === 'tangential').length,
    patents:          patents.length,
    unscored:         papers.filter((p) => !p.relevance_category).length + patents.filter((p) => !p.relevance_category).length,
  }

  if (papers.length === 0 && patents.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
        No papers or patents found yet. Run research to discover academic work from the company&apos;s founders and executives.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.id
                ? 'bg-[#3d74cc] text-white border-[#3d74cc]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label}
            {counts[f.id] > 0 && (
              <span className={`ml-1 text-[10px] ${filter === f.id ? 'opacity-80' : 'text-gray-400'}`}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Papers */}
      {filteredPapers.length > 0 && (
        <div className="space-y-3">
          {filter === 'all' && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Research Papers</p>
          )}
          {filteredPapers.map((paper) => (
            <PaperCard key={paper.id} paper={paper} />
          ))}
        </div>
      )}

      {/* Patents */}
      {filteredPatents.length > 0 && (
        <div className="space-y-3">
          {filter === 'all' && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Patents</p>
          )}
          {filteredPatents.map((patent) => (
            <PatentCard key={patent.id} patent={patent} />
          ))}
        </div>
      )}

      {filteredPapers.length === 0 && filteredPatents.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
          No items in this category.
        </div>
      )}
    </div>
  )
}
