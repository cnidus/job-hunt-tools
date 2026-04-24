'use client'

/**
 * components/AdminConsole.tsx
 * Interactive admin UI — research job queue, Inngest health, retry/cancel controls.
 */

import { useState, useEffect, useCallback } from 'react'

interface ResearchJob {
  id: string
  job_id: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  trigger: string | null
  phases_complete: string[]
  error_message: string | null
  created_at: string
  updated_at: string
  jobs: { company_name: string; role_title: string; user_id: string } | null
}

interface Props {
  initialJobs: ResearchJob[]
  userMap: Record<string, string>
}

const ALL_PHASES = ['p1_company', 'p2_entities', 'p3_research', 'p4_news', 'p5_synthesis']
const PHASE_LABELS: Record<string, string> = {
  p1_company: 'Company Intel', p2_entities: 'Entity Enrichment',
  p3_research: 'Papers & Patents', p4_news: 'News', p5_synthesis: 'Claude Synthesis',
}
const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  running:  'bg-blue-100 text-blue-800 border-blue-300',
  complete: 'bg-green-100 text-green-800 border-green-300',
  failed:   'bg-red-100 text-red-800 border-red-300',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function isStuck(job: ResearchJob): boolean {
  if (job.status !== 'pending' && job.status !== 'running') return false
  return Date.now() - new Date(job.updated_at).getTime() > 10 * 60 * 1000
}

function InngestHealthBadge() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    fetch('/api/inngest', { method: 'GET' })
      .then((r) => {
        if (r.ok) { setStatus('ok'); setDetail('Endpoint reachable — Inngest can deliver events') }
        else { setStatus('error'); setDetail(`HTTP ${r.status} — endpoint not registered with Inngest Cloud`) }
      })
      .catch((e) => { setStatus('error'); setDetail(String(e)) })
  }, [])

  const colors = { checking: 'bg-gray-100 text-gray-600 border-gray-200', ok: 'bg-green-50 text-green-700 border-green-200', error: 'bg-red-50 text-red-700 border-red-200' }
  const icons = { checking: '⏳', ok: '✅', error: '❌' }

  return (
    <div className={`rounded-lg px-4 py-3 border text-sm ${colors[status]}`}>
      <div className="font-semibold mb-0.5">{icons[status]} Inngest Endpoint /api/inngest</div>
      <div className="opacity-80">{detail || 'Checking...'}</div>
      {status === 'error' && (
        <div className="mt-2 text-xs font-medium">
          Add <code className="bg-red-100 px-1 rounded">INNGEST_SIGNING_KEY</code> &amp;{' '}
          <code className="bg-red-100 px-1 rounded">INNGEST_EVENT_KEY</code> to Vercel env vars → redeploy → sync at{' '}
          <a href="https://app.inngest.com" target="_blank" rel="noopener noreferrer" className="underline">app.inngest.com</a>
        </div>
      )}
    </div>
  )
}

function StatsBar({ jobs }: { jobs: ResearchJob[] }) {
  const counts = jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] ?? 0) + 1; return acc }, {} as Record<string, number>)
  const stuck = jobs.filter(isStuck).length
  const items = [
    { label: 'Total',     value: jobs.length,          color: 'text-gray-800' },
    { label: 'Pending',   value: counts.pending ?? 0,  color: 'text-yellow-700' },
    { label: 'Running',   value: counts.running ?? 0,  color: 'text-blue-700' },
    { label: 'Complete',  value: counts.complete ?? 0, color: 'text-green-700' },
    { label: 'Failed',    value: counts.failed ?? 0,   color: 'text-red-700' },
    { label: 'Stuck >10m', value: stuck,               color: stuck > 0 ? 'text-orange-700' : 'text-gray-400' },
  ]
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {items.map(({ label, value, color }) => (
        <div key={label} className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center shadow-sm">
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

function PhaseProgress({ phases }: { phases: string[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {ALL_PHASES.map((p) => (
        <span key={p} title={PHASE_LABELS[p]}
          className={`text-xs px-1.5 py-0.5 rounded border font-mono ${phases.includes(p) ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
          {p.replace('p', 'P')}
        </span>
      ))}
    </div>
  )
}

function JobRow({ job, userEmail, onRetry, onCancel, busy }: {
  job: ResearchJob; userEmail: string
  onRetry: (id: string) => void; onCancel: (id: string) => void; busy: boolean
}) {
  const stuck = isStuck(job)
  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${stuck ? 'bg-orange-50' : ''}`}>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 text-sm">
          {job.jobs?.company_name ?? '—'}
          {stuck && <span className="ml-2 text-xs text-orange-600 font-semibold">⚠ stuck</span>}
        </div>
        <div className="text-xs text-gray-500">{job.jobs?.role_title ?? '—'}</div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">{userEmail || '—'}</td>
      <td className="px-4 py-3">
        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[job.status] ?? ''}`}>
          {job.status}
        </span>
      </td>
      <td className="px-4 py-3"><PhaseProgress phases={job.phases_complete ?? []} /></td>
      <td className="px-4 py-3 text-xs text-gray-500">
        <div>Created {timeAgo(job.created_at)}</div>
        <div>Updated {timeAgo(job.updated_at)}</div>
      </td>
      <td className="px-4 py-3 max-w-xs">
        {job.error_message && (
          <details className="text-xs">
            <summary className="text-red-600 cursor-pointer font-medium">Error ▸</summary>
            <pre className="mt-1 whitespace-pre-wrap text-red-700 bg-red-50 p-2 rounded text-[10px] max-h-24 overflow-auto">{job.error_message}</pre>
          </details>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => onRetry(job.id)}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-40 font-medium">
            Retry
          </button>
          {(job.status === 'pending' || job.status === 'running') && (
            <button disabled={busy} onClick={() => onCancel(job.id)}
              className="text-xs bg-gray-200 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-300 disabled:opacity-40 font-medium">
              Cancel
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function AdminConsole({ initialJobs, userMap }: Props) {
  const [jobs, setJobs] = useState<ResearchJob[]>(initialJobs)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'running' | 'complete' | 'failed' | 'stuck'>('all')
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/jobs')
      if (r.ok) { const d = await r.json(); setJobs(d.jobs); setLastRefresh(new Date()) }
    } catch {}
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const handleRetry = async (id: string) => {
    setBusyIds((s) => new Set(s).add(id))
    try {
      const r = await fetch('/api/admin/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ research_job_id: id }) })
      if (r.ok) { showToast('Job re-queued ✓'); await refresh() }
      else { const d = await r.json(); showToast(`Error: ${d.error}`) }
    } catch (e) { showToast(`Error: ${e}`) }
    finally { setBusyIds((s) => { const n = new Set(s); n.delete(id); return n }) }
  }

  const handleCancel = async (id: string) => {
    setBusyIds((s) => new Set(s).add(id))
    try {
      const r = await fetch('/api/admin/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ research_job_id: id }) })
      if (r.ok) { showToast('Job cancelled'); await refresh() }
      else { const d = await r.json(); showToast(`Error: ${d.error}`) }
    } catch (e) { showToast(`Error: ${e}`) }
    finally { setBusyIds((s) => { const n = new Set(s); n.delete(id); return n }) }
  }

  const filteredJobs = jobs.filter((j) => {
    if (filter === 'all') return true
    if (filter === 'stuck') return isStuck(j)
    return j.status === filter
  })

  const filterCount = (f: typeof filter) => {
    if (f === 'all') return jobs.length
    if (f === 'stuck') return jobs.filter(isStuck).length
    return jobs.filter((j) => j.status === f).length
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-pulse">
          {toast}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">⚙️ Admin Console</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Research queue &amp; backend health · auto-refreshes every 15s · last: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/" className="text-sm text-gray-600 px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50">← App</a>
            <button onClick={refresh} className="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-50 font-medium">Refresh</button>
          </div>
        </div>

        {/* Inngest health */}
        <div className="mb-5">
          <InngestHealthBadge />
        </div>

        {/* Stats */}
        <div className="mb-5">
          <StatsBar jobs={jobs} />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'pending', 'running', 'complete', 'failed', 'stuck'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-sm px-3 py-1.5 rounded-full border font-medium capitalize transition-colors ${filter === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
              {f} <span className="opacity-60 text-xs">({filterCount(f)})</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Job', 'User', 'Status', 'Phases', 'Time', 'Error', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No jobs for this filter.</td></tr>
                ) : filteredJobs.map((job) => (
                  <JobRow key={job.id} job={job}
                    userEmail={job.jobs?.user_id ? (userMap[job.jobs.user_id] ?? '') : ''}
                    onRetry={handleRetry} onCancel={handleCancel} busy={busyIds.has(job.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inngest fix guide */}
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm">
          <h3 className="font-bold text-amber-800 mb-2">🔧 Inngest Setup Checklist</h3>
          <ol className="list-decimal list-inside space-y-1.5 text-amber-900">
            <li>Get <strong>Signing Key</strong> &amp; <strong>Event Key</strong> from <a href="https://app.inngest.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">app.inngest.com</a> → Settings</li>
            <li>Add to Vercel env vars (Production): <code className="bg-amber-100 px-1 rounded">INNGEST_SIGNING_KEY</code> and <code className="bg-amber-100 px-1 rounded">INNGEST_EVENT_KEY</code></li>
            <li>Also add <code className="bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> (from Supabase → Settings → API → service_role)</li>
            <li>Redeploy on Vercel</li>
            <li>In Inngest dashboard → Apps → Sync: <code className="bg-amber-100 px-1 rounded">https://job-hunt-tools.vercel.app/api/inngest</code></li>
            <li>Use the <strong>Retry</strong> button above to re-queue any stuck jobs</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
