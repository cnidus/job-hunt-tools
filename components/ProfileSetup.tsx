'use client'

import { useState, useRef } from 'react'

interface ParsedProfile {
  source?:          'proxycurl' | 'pdf' | 'manual'
  name?:            string | null
  headline?:        string | null
  location?:        string | null
  summary?:         string | null
  skills?:          string[]
  experience?:      { title?: string|null; company?: string|null; start?: string|null; end?: string|null }[]
  education?:       { degree?: string|null; school?: string|null; year?: number|null }[]
  patents?:         { title?: string|null; number?: string|null }[]
  certifications?:  string[]
}

interface UserProfile {
  linkedin_url?:    string | null
  parsed_profile?:  ParsedProfile
  last_updated_at?: string
}

interface Props {
  initialProfile: UserProfile | null
}

export default function ProfileSetup({ initialProfile }: Props) {
  const [profile, setProfile]         = useState<UserProfile | null>(initialProfile)
  const [linkedinUrl, setLinkedinUrl] = useState(initialProfile?.linkedin_url ?? '')
  const [uploading, setUploading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = profile?.parsed_profile

  // ── PDF upload ────────────────────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setSuccess(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/profile/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      setProfile(json.profile)
      setSuccess('Resume parsed and saved successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {/* ── LinkedIn section ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">LinkedIn Profile</h2>
        <p className="text-sm text-gray-500 mb-4">
          Save your LinkedIn URL here for reference, then export your profile as a PDF
          and upload it below — LinkedIn&apos;s built-in export captures everything including
          skills, patents, and certifications.
        </p>
        <input
          type="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://www.linkedin.com/in/your-handle"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />
        <a
          href="https://www.linkedin.com/help/linkedin/answer/a541960"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
        >
          How to export your LinkedIn profile as PDF {'→'}
        </a>
      </div>

      {/* ── PDF / resume upload ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Upload Resume / LinkedIn PDF</h2>
        <p className="text-sm text-gray-500 mb-4">
          Export your LinkedIn profile as a PDF (or upload any resume PDF / .txt file). Claude will
          parse it directly — no third-party API needed.
        </p>
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <p className="text-sm text-blue-600 font-medium">Parsing with Claude…</p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">PDF or plain text, up to 10 MB</p>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* ── Status messages ─────────────────────────────────────────────── */}
      {error   && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">{success}</div>}

      {/* ── Parsed profile summary ──────────────────────────────────────── */}
      {parsed && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {parsed.name ?? 'Your Profile'}
              </h2>
              {parsed.headline && <p className="text-sm text-gray-500">{parsed.headline}</p>}
            </div>
            <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1">
              via {parsed.source === 'proxycurl' ? 'LinkedIn' : 'PDF'}
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {/* Skills */}
            {(parsed.skills?.length ?? 0) > 0 && (
              <div className="px-6 py-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {parsed.skills!.slice(0, 30).map((s) => (
                    <span key={s} className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">{s}</span>
                  ))}
                  {(parsed.skills!.length > 30) && (
                    <span className="text-xs text-gray-400">+{parsed.skills!.length - 30} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Experience */}
            {(parsed.experience?.length ?? 0) > 0 && (
              <div className="px-6 py-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Experience</h3>
                <ul className="space-y-1">
                  {parsed.experience!.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      <span className="font-medium">{e.title}</span>
                      {e.company && <> · {e.company}</>}
                      {(e.start || e.end) && (
                        <span className="text-gray-400 ml-1">({e.start ?? '?'} – {e.end ?? 'Present'})</span>
                      )}
                    </li>
                  ))}
                  {(parsed.experience!.length > 5) && (
                    <li className="text-xs text-gray-400">+{parsed.experience!.length - 5} more roles</li>
                  )}
                </ul>
              </div>
            )}

            {/* Patents */}
            {(parsed.patents?.length ?? 0) > 0 && (
              <div className="px-6 py-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Patents ({parsed.patents!.length})
                </h3>
                <ul className="space-y-1">
                  {parsed.patents!.map((p, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      {p.title}
                      {p.number && <span className="text-gray-400 ml-1">({p.number})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Education */}
            {(parsed.education?.length ?? 0) > 0 && (
              <div className="px-6 py-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Education</h3>
                <ul className="space-y-1">
                  {parsed.education!.map((e, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      {e.degree && <span className="font-medium">{e.degree}</span>}
                      {e.school && <> · {e.school}</>}
                      {e.year && <span className="text-gray-400 ml-1">({e.year})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Certifications */}
            {(parsed.certifications?.length ?? 0) > 0 && (
              <div className="px-6 py-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Certifications</h3>
                <div className="flex flex-wrap gap-2">
                  {parsed.certifications!.map((c) => (
                    <span key={c} className="text-xs bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {profile?.last_updated_at && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              Last updated {new Date(profile.last_updated_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
