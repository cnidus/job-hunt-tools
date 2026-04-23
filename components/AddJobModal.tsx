'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createJob } from '@/lib/storage'
import type { JobStatus } from '@/lib/types'

interface Props {
  onClose: () => void
}

export default function AddJobModal({ onClose }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    company_name: '',
    role_title:   '',
    company_url:  '',
    job_url:      '',
    location:     '',
    salary_min:   '',
    salary_max:   '',
    status:       'applied' as JobStatus,
    applied_at:   new Date().toISOString().slice(0, 10),
    notes:        '',
  })

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim() || !form.role_title.trim()) return
    setSaving(true)

    try {
      const job = await createJob({
        company_name: form.company_name.trim(),
        role_title:   form.role_title.trim(),
        company_url:  form.company_url.trim()  || null,
        job_url:      form.job_url.trim()      || null,
        location:     form.location.trim()     || null,
        salary_min:   form.salary_min ? parseInt(form.salary_min) : null,
        salary_max:   form.salary_max ? parseInt(form.salary_max) : null,
        status:       form.status,
        applied_at:   form.applied_at || null,
        notes:        form.notes.trim() || null,
      })

      if (!job) { setSaving(false); return }

      // Kick off initial intel fetch in background (don't await — let it run async)
      fetch(`/api/fetch-intel?job_id=${job.id}`).catch(() => null)

      router.push(`/jobs/${job.id}`)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-800">Track a new job</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Company + Role (required) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Company name <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={form.company_name}
                onChange={(e) => set('company_name', e.target.value)}
                placeholder="Acme Corp"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Role title <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={form.role_title}
                onChange={(e) => set('role_title', e.target.value)}
                placeholder="Senior Solutions Engineer"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          {/* URLs */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company website</label>
            <input
              type="url"
              value={form.company_url}
              onChange={(e) => set('company_url', e.target.value)}
              placeholder="https://acmecorp.com"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job listing URL</label>
            <input
              type="url"
              value={form.job_url}
              onChange={(e) => set('job_url', e.target.value)}
              placeholder="https://acmecorp.com/jobs/123"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Location + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="Remote / SF / NYC"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                <option value="saved">Saved</option>
                <option value="applied">Applied</option>
                <option value="interviewing">Interviewing</option>
                <option value="offered">Offered</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>
          </div>

          {/* Salary */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salary min ($K)</label>
              <input
                type="number"
                value={form.salary_min}
                onChange={(e) => set('salary_min', e.target.value)}
                placeholder="150"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salary max ($K)</label>
              <input
                type="number"
                value={form.salary_max}
                onChange={(e) => set('salary_max', e.target.value)}
                placeholder="220"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          {/* Applied date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Applied date</label>
            <input
              type="date"
              value={form.applied_at}
              onChange={(e) => set('applied_at', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Referred by John, hot role, AI networking..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.company_name || !form.role_title}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #3d74cc 100%)' }}
            >
              {saving ? 'Creating…' : 'Track job →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
