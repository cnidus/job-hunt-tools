'use client'

import type { ResearchJob } from '@/lib/types'

interface Props {
  researchJob: ResearchJob | null
  onStartResearch: () => void
  starting: boolean
}

const PHASE_LABELS: Record<string, string> = {
  'p1-discovery':        'Company profile',
  'p2-entity-enrichment':'Key people',
  'p3-research':         'Papers & patents',
  'p4-news':             'News',
  'p5-synthesis':        'AI scoring',
}

const ALL_PHASES = ['p1-discovery', 'p2-entity-enrichment', 'p3-research', 'p4-news', 'p5-synthesis']

export default function ResearchJobStatus({ researchJob, onStartResearch, starting }: Props) {
  if (!researchJob) {
    return (
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
        <div>
          <p className="text-sm font-medium text-gray-700">Company research not yet run</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Fetch Crunchbase data, founder profiles, research papers, patents &amp; AI relevance scoring
          </p>
        </div>
        <button
          onClick={onStartResearch}
          disabled={starting}
          className="text-sm font-medium text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #3d74cc 100%)' }}
        >
          {starting ? 'Starting…' : '🔍 Research'}
        </button>
      </div>
    )
  }

  if (researchJob.status === 'complete') {
    return (
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-base">✓</span>
          <p className="text-sm font-medium text-green-800">
            Research complete
            {researchJob.completed_at && (
              <span className="font-normal text-green-600 ml-1">
                · {new Date(researchJob.completed_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onStartResearch}
          disabled={starting}
          className="text-xs font-medium text-green-700 px-3 py-1.5 rounded-lg border border-green-300 hover:bg-green-100 transition-colors disabled:opacity-60"
        >
          {starting ? 'Starting…' : '↻ Re-run'}
        </button>
      </div>
    )
  }

  if (researchJob.status === 'failed') {
    return (
      <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
        <div>
          <p className="text-sm font-medium text-red-800">⚠ Research failed</p>
          {researchJob.error_message && (
            <p className="text-xs text-red-600 mt-0.5">{researchJob.error_message.slice(0, 120)}</p>
          )}
        </div>
        <button
          onClick={onStartResearch}
          disabled={starting}
          className="text-xs font-medium text-red-700 px-3 py-1.5 rounded-lg border border-red-300 hover:bg-red-100 transition-colors disabled:opacity-60"
        >
          {starting ? 'Starting…' : '↻ Retry'}
        </button>
      </div>
    )
  }

  // pending or running
  const phasesComplete = new Set(researchJob.phases_complete ?? [])

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-blue-800">
          {researchJob.status === 'pending' ? '⏳ Research queued' : '🔍 Researching company…'}
        </span>
        <span className="text-xs font-mono text-blue-500">{researchJob.progress_pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-blue-100 rounded-full h-1.5 mb-3">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${researchJob.progress_pct}%` }}
        />
      </div>

      {/* Phase pills */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {ALL_PHASES.map((phase) => {
          const done = phasesComplete.has(phase)
          const current = !done && researchJob.status === 'running' &&
            researchJob.progress_message?.toLowerCase().includes(
              PHASE_LABELS[phase]?.split(' ')[0]?.toLowerCase() ?? ''
            )
          return (
            <span
              key={phase}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                done
                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : current
                  ? 'bg-white text-blue-600 border-blue-300 animate-pulse'
                  : 'bg-white text-gray-400 border-gray-200'
              }`}
            >
              {done ? '✓ ' : current ? '· ' : ''}{PHASE_LABELS[phase]}
            </span>
          )
        })}
      </div>

      {researchJob.progress_message && (
        <p className="text-xs text-blue-600">{researchJob.progress_message}</p>
      )}
    </div>
  )
}
