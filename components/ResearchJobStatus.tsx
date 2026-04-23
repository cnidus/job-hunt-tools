'use client'

import type { ResearchJob } from '@/lib/types'

interface Props {
  researchJob:    ResearchJob | null
  onStart:        () => void
  onRerun?:       () => void
  starting:       boolean
}

const PHASES = [
  { key: 'p1_company',   label: 'Company data' },
  { key: 'p2_entities',  label: 'People' },
  { key: 'p3_research',  label: 'Papers & patents' },
  { key: 'p4_news',      label: 'News' },
  { key: 'p5_synthesis', label: 'AI scoring' },
]

export default function ResearchJobStatus({ researchJob, onStart, onRerun, starting }: Props) {
  if (!researchJob) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="text-4xl mb-3">🔬</div>
        <h3 className="text-base font-semibold text-gray-800 mb-1">No research run yet</h3>
        <p className="text-sm text-gray-500 mb-4">
          Start a deep research run to pull company data, founder profiles, academic papers, patents, and news — all scored for interview relevance.
        </p>
        <button
          onClick={onStart}
          disabled={starting}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#3d74cc] text-white text-sm font-medium hover:bg-[#2f5faa] transition-colors disabled:opacity-60"
        >
          {starting ? (
            <><span className="animate-spin inline-block">↻</span> Starting…</>
          ) : (
            <>🔍 Research this company</>
          )}
        </button>
      </div>
    )
  }

  const { status, phases_complete, error_message, updated_at } = researchJob
  const completedCount = phases_complete.length
  const totalPhases    = PHASES.length
  const pct            = Math.round((completedCount / totalPhases) * 100)

  if (status === 'failed') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-red-700 mb-1">⚠️ Research run failed</p>
            {error_message && (
              <p className="text-xs text-red-600 font-mono break-all">{error_message}</p>
            )}
          </div>
          <button
            onClick={onRerun ?? onStart}
            disabled={starting}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (status === 'complete') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-green-700">✅ Research complete</p>
            <p className="text-xs text-green-600 mt-0.5">
              Last run {new Date(updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button
            onClick={onRerun ?? onStart}
            disabled={starting}
            className="text-xs px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60"
          >
            {starting ? '↻ Starting…' : '↺ Re-run'}
          </button>
        </div>
      </div>
    )
  }

  // pending or running
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <p className="text-sm font-semibold text-blue-700">
          {status === 'pending' ? 'Research queued…' : `Researching — phase ${completedCount + 1} of ${totalPhases}`}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-blue-200 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Phase pills */}
      <div className="flex flex-wrap gap-2">
        {PHASES.map((phase) => {
          const done    = phases_complete.includes(phase.key)
          const isNext  = !done && phases_complete.length === PHASES.indexOf(phase)
          return (
            <span
              key={phase.key}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                done
                  ? 'bg-blue-500 text-white border-blue-500'
                  : isNext
                  ? 'bg-blue-100 text-blue-700 border-blue-300 animate-pulse'
                  : 'bg-white text-gray-400 border-gray-200'
              }`}
            >
              {done ? '✓ ' : ''}{phase.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
