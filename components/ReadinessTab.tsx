'use client'

interface SkillRadarItem {
  skill:           string
  user_level:      number  // 0-5
  required_level:  number  // 0-5
}

interface StudyTopic {
  topic:     string
  priority:  'high' | 'medium' | 'low'
  reason:    string
  resources: string[]
}

interface Strength {
  area:   string
  detail: string
}

interface TalkingPoint {
  requirement:   string
  talking_point: string
  evidence:      string
}

interface GapAnalysis {
  match_score:    number
  skill_radar:    SkillRadarItem[]
  study_topics:   StudyTopic[]
  strengths:      Strength[]
  talking_points: TalkingPoint[]
  generated_at:   string
}

interface Props {
  gapAnalysis:    GapAnalysis | null
  phasesComplete: string[]
}

const PRIORITY_COLOURS = {
  high:   'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low:    'bg-gray-50 border-gray-200 text-gray-600',
}

const PRIORITY_DOT = {
  high:   'bg-red-500',
  medium: 'bg-amber-400',
  low:    'bg-gray-400',
}

function ScoreRing({ score }: { score: number }) {
  const size  = 120
  const r     = 46
  const cx    = size / 2
  const circ  = 2 * Math.PI * r
  const dash  = (score / 100) * circ
  const colour = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={colour} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="relative" style={{ marginTop: `-${size / 2 + 16}px` }}>
        <span className="text-3xl font-bold text-gray-900">{score}</span>
        <span className="text-base text-gray-400">/100</span>
      </div>
      <div style={{ marginTop: `${size / 2 - 12}px` }} className="text-sm text-gray-500 font-medium">
        {score >= 75 ? 'Strong fit' : score >= 50 ? 'Solid base' : 'Gap to close'}
      </div>
    </div>
  )
}

function SkillBar({ item }: { item: SkillRadarItem }) {
  const gap      = Math.max(0, item.required_level - item.user_level)
  const userPct  = (item.user_level / 5) * 100
  const reqPct   = (item.required_level / 5) * 100
  const barColour = gap === 0 ? 'bg-green-500' : gap <= 1 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium text-gray-700">{item.skill}</span>
        <span className="text-gray-400">{item.user_level}/5 · need {item.required_level}/5</span>
      </div>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        {/* Required level marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-gray-400 z-10"
          style={{ left: `${reqPct}%` }}
        />
        {/* User level bar */}
        <div
          className={`h-full rounded-full ${barColour} transition-all duration-500`}
          style={{ width: `${userPct}%` }}
        />
      </div>
    </div>
  )
}

export default function ReadinessTab({ gapAnalysis, phasesComplete }: Props) {
  const p6Done = phasesComplete.includes('p6_gap_analysis')

  // Not yet run
  if (!p6Done && !gapAnalysis) {
    return (
      <div className="py-16 text-center text-gray-400">
        <p className="text-4xl mb-3">🔍</p>
        <p className="font-medium text-gray-600">Gap analysis hasn&apos;t run yet</p>
        <p className="text-sm mt-1">
          Add your profile at{' '}
          <a href="/profile" className="text-blue-600 hover:underline">Settings → Profile</a>
          {' '}then start a new research run.
        </p>
      </div>
    )
  }

  // Phase running
  if (p6Done && !gapAnalysis) {
    return (
      <div className="py-16 text-center text-gray-400">
        <p className="text-4xl mb-3">⏳</p>
        <p className="font-medium text-gray-600">No profile found</p>
        <p className="text-sm mt-1">
          Set up your profile at{' '}
          <a href="/profile" className="text-blue-600 hover:underline">Settings → Profile</a>
          {' '}to enable personalised gap analysis.
        </p>
      </div>
    )
  }

  if (!gapAnalysis) return null

  const { match_score, skill_radar, study_topics, strengths, talking_points, generated_at } = gapAnalysis

  // Sort skill radar: biggest gaps first
  const sortedSkills = [...(skill_radar ?? [])].sort(
    (a, b) => (b.required_level - b.user_level) - (a.required_level - a.user_level)
  )
  const highTopics = study_topics?.filter((t) => t.priority === 'high') ?? []
  const otherTopics = study_topics?.filter((t) => t.priority !== 'high') ?? []

  return (
    <div className="space-y-6 py-2">

      {/* ── Score + skills grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Match score */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Match Score</p>
          <ScoreRing score={match_score} />
        </div>

        {/* Skill radar bars */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Skill Fit · <span className="font-normal normal-case">grey bar = required level</span>
          </p>
          <div className="space-y-3">
            {sortedSkills.slice(0, 10).map((item) => (
              <SkillBar key={item.skill} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Study plan ─────────────────────────────────────────────────── */}
      {study_topics?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">📚 Personalised Study Plan</p>
            <p className="text-xs text-gray-400 mt-0.5">Ranked by gap size × role importance</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[...highTopics, ...otherTopics].map((topic, i) => (
              <div key={i} className={`px-6 py-4 border-l-4 ${
                topic.priority === 'high' ? 'border-l-red-400' :
                topic.priority === 'medium' ? 'border-l-amber-400' : 'border-l-gray-300'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLOURS[topic.priority]}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${PRIORITY_DOT[topic.priority]}`} />
                        {topic.priority}
                      </span>
                      <span className="font-semibold text-sm text-gray-800">{topic.topic}</span>
                    </div>
                    <p className="text-xs text-gray-500">{topic.reason}</p>
                  </div>
                </div>
                {topic.resources?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topic.resources.map((r, ri) => (
                      <span key={ri} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">
                        🔍 {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Strengths ──────────────────────────────────────────────────── */}
      {strengths?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">⚡ Your Competitive Edge</p>
          </div>
          <div className="divide-y divide-gray-50">
            {strengths.map((s, i) => (
              <div key={i} className="px-6 py-4 border-l-4 border-l-green-400">
                <p className="text-sm font-semibold text-gray-800 mb-0.5">{s.area}</p>
                <p className="text-xs text-gray-500">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Talking points ─────────────────────────────────────────────── */}
      {talking_points?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">💬 Tailored Talking Points</p>
            <p className="text-xs text-gray-400 mt-0.5">Your experience mapped to each key requirement</p>
          </div>
          <div className="divide-y divide-gray-50">
            {talking_points.map((tp, i) => (
              <div key={i} className="px-6 py-5">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                  {tp.requirement}
                </p>
                <p className="text-sm text-gray-800 mb-2">{tp.talking_point}</p>
                <p className="text-xs text-gray-400 italic">Evidence: {tp.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-300 text-right">
        Generated {new Date(generated_at).toLocaleString()}
      </p>
    </div>
  )
}
