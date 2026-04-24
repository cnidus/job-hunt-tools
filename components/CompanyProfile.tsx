'use client'

import { useState } from 'react'
import type { CompanyProfile, CompanyEntity, CompanyInvestor } from '@/lib/types'

interface Props {
  profile:         CompanyProfile | null
  entities:        CompanyEntity[]
  investors:       CompanyInvestor[]
  jobId?:          string
  onEntitiesChange?: (entities: CompanyEntity[]) => void
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

const ALL_ROLES = ['ceo', 'cto', 'founder', 'vp', 'advisor', 'board', 'investor']

interface EditState {
  name:         string
  role:         string
  title:        string
  linkedin_url: string
}

export default function CompanyProfile({ profile, entities, investors, jobId, onEntitiesChange }: Props) {
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editForm,  setEditForm]    = useState<EditState>({ name: '', role: 'ceo', title: '', linkedin_url: '' })
  const [adding,    setAdding]      = useState(false)
  const [addForm,   setAddForm]     = useState<EditState>({ name: '', role: 'ceo', title: '', linkedin_url: '' })
  const [saving,    setSaving]      = useState(false)

  const canEdit = !!jobId && !!onEntitiesChange

  const sortedEntities = [...entities].sort((a, b) =>
    (ROLE_ORDER.indexOf(a.role) ?? 99) - (ROLE_ORDER.indexOf(b.role) ?? 99)
  )

  // ── Edit existing entity ───────────────────────────────────────────────────
  function startEdit(entity: CompanyEntity) {
    setEditingId(entity.id)
    setEditForm({
      name:         entity.name,
      role:         entity.role,
      title:        entity.title ?? '',
      linkedin_url: entity.linkedin_url ?? '',
    })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/research/entities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm, title: editForm.title || null, linkedin_url: editForm.linkedin_url || null }),
      })
      const json = await res.json()
      if (json.ok && onEntitiesChange) {
        onEntitiesChange(entities.map((e) => (e.id === id ? json.entity : e)))
      }
    } finally {
      setSaving(false)
      setEditingId(null)
    }
  }

  async function deleteEntity(id: string) {
    if (!confirm('Remove this person?')) return
    const res = await fetch('/api/research/entities', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const json = await res.json()
    if (json.ok && onEntitiesChange) {
      onEntitiesChange(entities.filter((e) => e.id !== id))
    }
  }

  // ── Add new entity ─────────────────────────────────────────────────────────
  async function saveAdd() {
    if (!addForm.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/research/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id:       jobId,
          name:         addForm.name.trim(),
          role:         addForm.role,
          title:        addForm.title || null,
          linkedin_url: addForm.linkedin_url || null,
        }),
      })
      const json = await res.json()
      if (json.ok && onEntitiesChange) {
        onEntitiesChange([...entities, json.entity])
      }
    } finally {
      setSaving(false)
      setAdding(false)
      setAddForm({ name: '', role: 'ceo', title: '', linkedin_url: '' })
    }
  }

  if (!profile) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
        No company data yet. Run research to populate this section.
      </div>
    )
  }

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
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Key People</p>
          {canEdit && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="text-xs text-[#3d74cc] hover:underline"
            >
              + Add person
            </button>
          )}
        </div>

        {sortedEntities.length === 0 && !adding && (
          <p className="text-sm text-gray-400">No people found. Add one manually.</p>
        )}

        <div className="space-y-3">
          {sortedEntities.map((entity) =>
            editingId === entity.id ? (
              // ── Edit row ───────────────────────────────────────────────────
              <div key={entity.id} className="border border-blue-200 rounded-lg p-3 space-y-2 bg-blue-50">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="col-span-2 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Full name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <select
                    className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                  </select>
                  <input
                    className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Title (optional)"
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  />
                  <input
                    className="col-span-2 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="LinkedIn URL (optional)"
                    value={editForm.linkedin_url}
                    onChange={(e) => setEditForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => saveEdit(entity.id)}
                    className="text-xs px-3 py-1 rounded bg-[#3d74cc] text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              // ── Display row ────────────────────────────────────────────────
              <div key={entity.id} className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-full bg-[#e8effc] flex items-center justify-center text-xs font-bold text-[#3d74cc] shrink-0">
                  {entity.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{entity.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${ROLE_BADGES[entity.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {entity.role}
                    </span>
                    {entity.source === 'manual' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">
                        edited
                      </span>
                    )}
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
                {canEdit && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => startEdit(entity)}
                      className="text-xs text-gray-400 hover:text-blue-600 px-1"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteEntity(entity.id)}
                      className="text-xs text-gray-400 hover:text-red-500 px-1"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {/* Add new person row */}
          {adding && (
            <div className="border border-green-200 rounded-lg p-3 space-y-2 bg-green-50">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="col-span-2 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="Full name *"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  value={addForm.role}
                  onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                </select>
                <input
                  className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="Title (optional)"
                  value={addForm.title}
                  onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                />
                <input
                  className="col-span-2 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="LinkedIn URL (optional)"
                  value={addForm.linkedin_url}
                  onChange={(e) => setAddForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setAdding(false); setAddForm({ name: '', role: 'ceo', title: '', linkedin_url: '' }) }}
                  className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  disabled={saving || !addForm.name.trim()}
                  onClick={saveAdd}
                  className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
