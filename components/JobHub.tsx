'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

import Header           from '@/components/Header'
import IntelFeed        from '@/components/IntelFeed'
import DailyTasks       from '@/components/DailyTasks'
import MasteryChecklist from '@/components/MasteryChecklist'
import ResearchNotes    from '@/components/ResearchNotes'
import CompanyProfile   from '@/components/CompanyProfile'
import ResearchPapers   from '@/components/ResearchPapers'
import ResearchJobStatus from '@/components/ResearchJobStatus'

import {
  fetchJob,
  fetchIntelItems, addIntelItem, recordAction,
  fetchTasksForDate, completeTask, upsertTask,
  fetchMasteryItems, completeMasteryItem,
  fetchNotes, saveNote, updateNote, deleteNote,
  fetchLatestResearchJob,
  fetchCompanyProfile, fetchCompanyEntities, fetchCompanyInvestors,
  fetchResearchPapers, fetchPatents,
} from '@/lib/storage'

import type {
  Job, IntelItem, ActionType, DailyTask, MasteryItem, ResearchNote,
  ResearchJob, CompanyProfile as CompanyProfileType,
  CompanyEntity, CompanyInvestor, ResearchPaper, ResearchPatent,
} from '@/lib/types'
import { isUnread } from '@/lib/types'

// ─── Daily task templates (7-day rotation) ────────────────────────────────

const DAILY_TEMPLATES: Omit<DailyTask, 'id' | 'task_date' | 'completed_at' | 'notes' | 'job_id'>[][] = [
  // Sunday (0) — Company & culture
  [
    { title: 'Read the company website end-to-end', detail: 'Product pages, about, blog, case studies. How do they describe their value and differentiation?', category: 'company', sort_order: 1 },
    { title: 'Research the leadership team', detail: 'LinkedIn profiles, prior companies, interviews. What is their background and philosophy?', category: 'company', sort_order: 2 },
    { title: 'Draft your "why this company" story', detail: 'Write 3–5 sentences on why you are genuinely excited. Be specific — vague enthusiasm reads as generic.', category: 'presales', sort_order: 3 },
    { title: 'Check Glassdoor, Blind, and LinkedIn reviews', detail: 'What do employees say about culture and pace? Any patterns to watch for or prepare around?', category: 'company', sort_order: 4 },
  ],
  // Monday (1) — Technical deep dive
  [
    { title: 'Study the core technical domain', detail: 'Read docs, whitepapers, and engineering blog posts. Understand the technology deeply enough to teach it.', category: 'technical', sort_order: 1 },
    { title: 'Understand the product architecture', detail: 'How does it actually work? Key components, APIs, deployment models, and integrations?', category: 'technical', sort_order: 2 },
    { title: 'Identify your technical knowledge gaps', detail: 'What parts of the domain are weakest for you? Make a study plan for the top 2–3 gaps.', category: 'technical', sort_order: 3 },
    { title: 'Get hands-on with the product', detail: 'Sign up for a free trial or sandbox if available. First-hand product knowledge shows in interviews.', category: 'technical', sort_order: 4 },
  ],
  // Tuesday (2) — Market & competitive
  [
    { title: 'Map the competitive landscape', detail: 'Top 3–5 competitors. Where does this company win and lose? What is the defensible moat?', category: 'market', sort_order: 1 },
    { title: 'Read 3 recent analyst reports or news articles', detail: 'How does the market frame this space? What trends and tailwinds are driving adoption?', category: 'market', sort_order: 2 },
    { title: 'Understand the ICP (Ideal Customer Profile)', detail: 'Who buys this? Typical deal size, sales cycle, buyer personas — economic buyer vs. technical champion?', category: 'market', sort_order: 3 },
    { title: 'Research recent funding and company milestones', detail: 'Stage, investors, press releases. What does the trajectory tell you about where they are going?', category: 'company', sort_order: 4 },
  ],
  // Wednesday (3) — Presales & demo prep
  [
    { title: 'Build a demo story framework', detail: '(1) Customer pain → (2) Show the problem → (3) Solution walk-through → (4) Quantified outcome. Write it out.', category: 'presales', sort_order: 1 },
    { title: 'Map your experience to the job description', detail: 'For each key requirement, write one concrete example from your background with a specific metric.', category: 'presales', sort_order: 2 },
    { title: 'Draft a POC / pilot success framework', detail: '2–4 week POC: success criteria, timeline, stakeholders, and readout format.', category: 'presales', sort_order: 3 },
    { title: 'Practice your 2-minute product pitch', detail: 'Record yourself explaining the product to a peer. Watch it back. Is it crisp and specific?', category: 'presales', sort_order: 4 },
  ],
  // Thursday (4) — Behavioral prep
  [
    { title: 'Prepare 5 STAR stories', detail: 'Cover: complex technical deal, difficult customer, cross-functional project, failure/learning, biggest win.', category: 'presales', sort_order: 1 },
    { title: 'Prepare your "greatest technical achievement" story', detail: 'Something novel you built or solved that had measurable impact. Shows depth.', category: 'technical', sort_order: 2 },
    { title: 'Research your interviewers on LinkedIn', detail: 'Know their background before you meet. Look for shared experience or interests.', category: 'company', sort_order: 3 },
    { title: 'Prepare 5 sharp questions to ask', detail: 'Questions that show deep thinking: product roadmap, SE success metrics, biggest technical challenge.', category: 'presales', sort_order: 4 },
  ],
  // Friday (5) — Integrations & discovery
  [
    { title: 'Study the integrations ecosystem', detail: 'What tools does this product connect with? How does it fit into a typical customer stack?', category: 'technical', sort_order: 1 },
    { title: 'Prepare your objection-handling playbook', detail: 'Top 3–5 objections customers raise. Prepare a concise, confident response for each.', category: 'presales', sort_order: 2 },
    { title: 'Build a technical discovery question list', detail: 'What 10 questions would you ask in discovery to understand a prospect\'s environment and pain?', category: 'presales', sort_order: 3 },
    { title: 'Set up your ongoing learning routine', detail: 'Newsletters, podcasts, or communities to follow weekly. Build a 30-min/day habit before the interview.', category: 'company', sort_order: 4 },
  ],
  // Saturday (6) — Review & gap analysis
  [
    { title: 'Do a full mock interview (30–45 min)', detail: 'Ask a colleague or use AI to run a technical + behavioral interview. Record and review critically.', category: 'presales', sort_order: 1 },
    { title: 'Review your research notes from this week', detail: 'Synthesize: what are the 3 most important things you now know? What gaps remain?', category: 'company', sort_order: 2 },
    { title: 'Review your mastery checklist', detail: 'Check off what you have genuinely internalized. Be honest. Plan next week\'s focus areas.', category: 'company', sort_order: 3 },
    { title: 'Tailor your resume / LinkedIn for this role', detail: 'Update highlights to match the JD language. Does your top experience reflect what they care about?', category: 'presales', sort_order: 4 },
  ],
]

type Tab = 'feed' | 'tasks' | 'mastery' | 'notes' | 'company' | 'research'

const TABS: { id: Tab; label: string }[] = [
  { id: 'feed',     label: '📰 Intel Feed' },
  { id: 'tasks',    label: '✅ Daily Tasks' },
  { id: 'mastery',  label: '🎓 Mastery' },
  { id: 'notes',    label: '📝 Notes' },
  { id: 'company',  label: '🏢 Company' },
  { id: 'research', label: '🔬 Research' },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { jobId: string }

export default function JobHub({ jobId }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('feed')

  const [job,           setJob]           = useState<Job | null>(null)
  const [intelItems,    setIntelItems]     = useState<IntelItem[]>([])
  const [dailyTasks,    setDailyTasks]     = useState<DailyTask[]>([])
  const [masteryItems,  setMasteryItems]   = useState<MasteryItem[]>([])
  const [notes,         setNotes]          = useState<ResearchNote[]>([])
  const [researchJob,   setResearchJob]    = useState<ResearchJob | null>(null)
  const [companyProfile,setCompanyProfile] = useState<CompanyProfileType | null>(null)
  const [entities,      setEntities]       = useState<CompanyEntity[]>([])
  const [investors,     setInvestors]      = useState<CompanyInvestor[]>([])
  const [papers,        setPapers]         = useState<ResearchPaper[]>([])
  const [patents,       setPatents]        = useState<ResearchPatent[]>([])

  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [startingResearch, setStartingResearch] = useState(false)

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)

      const [jobData, items, tasks, mastery, fetchedNotes, rJob] = await Promise.all([
        fetchJob(jobId),
        fetchIntelItems(jobId),
        fetchTasksForDate(todayStr, jobId),
        fetchMasteryItems(jobId),
        fetchNotes(jobId),
        fetchLatestResearchJob(jobId),
      ])

      if (!jobData) { router.push('/'); return }

      setJob(jobData)
      setIntelItems(items)
      setMasteryItems(mastery)
      setNotes(fetchedNotes)
      setResearchJob(rJob)

      // Seed today's tasks if none exist
      if (tasks.length === 0) {
        const dow = new Date().getDay()
        const seeded: DailyTask[] = []
        for (const t of DAILY_TEMPLATES[dow]) {
          const task = await upsertTask(
            { ...t, task_date: todayStr, completed_at: null, notes: null },
            jobId
          )
          if (task) seeded.push(task)
        }
        setDailyTasks(seeded)
      } else {
        setDailyTasks(tasks)
      }

      // Load company/research data if research has completed
      if (rJob?.status === 'complete') {
        const [profile, ents, invs, paps, pats] = await Promise.all([
          fetchCompanyProfile(jobId),
          fetchCompanyEntities(jobId),
          fetchCompanyInvestors(jobId),
          fetchResearchPapers(jobId),
          fetchPatents(jobId),
        ])
        setCompanyProfile(profile)
        setEntities(ents)
        setInvestors(invs)
        setPapers(paps)
        setPatents(pats)
      }

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  // ── Poll research job status while running ─────────────────────────────────
  useEffect(() => {
    if (!researchJob || (researchJob.status !== 'pending' && researchJob.status !== 'running')) return

    const interval = setInterval(async () => {
      const res = await fetch(`/api/research/status?job_id=${jobId}`)
      const { research_job: rJob } = await res.json()
      if (!rJob) return

      setResearchJob(rJob)

      if (rJob.status === 'complete') {
        clearInterval(interval)
        const [profile, ents, invs, paps, pats] = await Promise.all([
          fetchCompanyProfile(jobId),
          fetchCompanyEntities(jobId),
          fetchCompanyInvestors(jobId),
          fetchResearchPapers(jobId),
          fetchPatents(jobId),
        ])
        setCompanyProfile(profile)
        setEntities(ents)
        setInvestors(invs)
        setPapers(paps)
        setPatents(pats)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [researchJob?.status, jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start research ─────────────────────────────────────────────────────────
  const handleStartResearch = useCallback(async () => {
    setStartingResearch(true)
    try {
      const res = await fetch('/api/research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, trigger: 'manual' }),
      })
      const { research_job_id } = await res.json()
      if (research_job_id) {
        const statusRes = await fetch(`/api/research/status?job_id=${jobId}`)
        const { research_job } = await statusRes.json()
        setResearchJob(research_job)
      }
    } finally {
      setStartingResearch(false)
    }
  }, [jobId])

  // ── Intel refresh ──────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch(`/api/fetch-intel?job_id=${jobId}`)
      const fresh = await fetchIntelItems(jobId)
      setIntelItems(fresh)
    } finally {
      setRefreshing(false)
    }
  }, [jobId])

  // ── Intel actions ──────────────────────────────────────────────────────────
  const handleIntelAction = useCallback(async (itemId: string, action: ActionType) => {
    await recordAction(itemId, action)
    setIntelItems(await fetchIntelItems(jobId))
  }, [jobId])

  const handleAddManual = useCallback(async (form: {
    title: string; url: string; summary: string; item_type: string
  }) => {
    const item = await addIntelItem({
      job_id: jobId, source: 'manual',
      item_type: form.item_type as IntelItem['item_type'],
      title: form.title, url: form.url || null,
      summary: form.summary || null,
      published_at: new Date().toISOString(),
      tags: ['manual'], metadata: {},
    }, jobId)
    if (item) setIntelItems((prev) => [item, ...prev])
  }, [jobId])

  // ── Task actions ───────────────────────────────────────────────────────────
  const handleToggleTask = useCallback(async (id: string, completed: boolean) => {
    await completeTask(id, completed)
    setDailyTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, completed_at: completed ? new Date().toISOString() : null } : t)
    )
  }, [])

  // ── Mastery actions ────────────────────────────────────────────────────────
  const handleToggleMastery = useCallback(async (id: string, completed: boolean) => {
    await completeMasteryItem(id, completed, jobId)
    setMasteryItems((prev) =>
      prev.map((m) => m.id === id ? { ...m, completed_at: completed ? new Date().toISOString() : null } : m)
    )
  }, [jobId])

  // ── Note actions ───────────────────────────────────────────────────────────
  const handleSaveNote = useCallback(async (note: Omit<ResearchNote, 'id' | 'created_at' | 'updated_at'>) => {
    const saved = await saveNote(note, jobId)
    if (saved) setNotes((prev) => [saved, ...prev])
  }, [jobId])

  const handleUpdateNote = useCallback(async (
    id: string, patch: Partial<Pick<ResearchNote, 'title' | 'content' | 'tags'>>
  ) => {
    await updateNote(id, patch)
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n))
  }, [])

  const handleDeleteNote = useCallback(async (id: string) => {
    await deleteNote(id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const unreadCount     = intelItems.filter(isUnread).length
  const pendingTasks    = dailyTasks.filter((t) => !t.completed_at).length
  const researchActive  = researchJob?.status === 'pending' || researchJob?.status === 'running'

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <Header
        job={job ?? undefined}
        unreadCount={unreadCount}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'border-[#3d74cc] text-[#3d74cc]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                {t.id === 'feed' && unreadCount > 0 && (
                  <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {unreadCount}
                  </span>
                )}
                {t.id === 'tasks' && pendingTasks > 0 && (
                  <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">
                    {pendingTasks}
                  </span>
                )}
                {t.id === 'company' && researchActive && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3 animate-spin">⟳</div>
              <p className="text-sm font-medium">Loading hub…</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl">
            {tab === 'feed' && (
              <IntelFeed items={intelItems} onAction={handleIntelAction} onAddManual={handleAddManual} />
            )}
            {tab === 'tasks' && (
              <DailyTasks tasks={dailyTasks} onToggle={handleToggleTask} />
            )}
            {tab === 'mastery' && (
              <MasteryChecklist items={masteryItems} onToggle={handleToggleMastery} />
            )}
            {tab === 'notes' && (
              <ResearchNotes
                notes={notes}
                onSave={handleSaveNote}
                onUpdate={handleUpdateNote}
                onDelete={handleDeleteNote}
              />
            )}
            {tab === 'company' && (
              <>
                <ResearchJobStatus
                  researchJob={researchJob}
                  onStartResearch={handleStartResearch}
                  starting={startingResearch}
                />
                <CompanyProfile
                  profile={companyProfile}
                  entities={entities}
                  investors={investors}
                />
              </>
            )}
            {tab === 'research' && (
              <>
                <ResearchJobStatus
                  researchJob={researchJob}
                  onStartResearch={handleStartResearch}
                  starting={startingResearch}
                />
                <ResearchPapers papers={papers} patents={patents} />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
