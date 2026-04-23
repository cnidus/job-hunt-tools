'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'

import Header from '@/components/Header'
import IntelFeed from '@/components/IntelFeed'
import DailyTasks from '@/components/DailyTasks'
import MasteryChecklist from '@/components/MasteryChecklist'
import ResearchNotes from '@/components/ResearchNotes'

import {
  fetchIntelItems, addIntelItem, recordAction,
  fetchTasksForDate, completeTask, upsertTask,
  fetchMasteryItems, completeMasteryItem,
  fetchNotes, saveNote, updateNote, deleteNote,
} from '@/lib/storage'

import {
  IntelItem, ActionType, DailyTask, MasteryItem, ResearchNote,
  isUnread,
} from '@/lib/types'

// ─── Rotating daily task templates (7 days) ───────────────────────────────

const DAILY_TEMPLATES: Omit<DailyTask, 'id' | 'task_date' | 'completed_at' | 'notes'>[][] = [
  // Sunday (0)
  [
    { title: 'Read the Clockwork.io platform page end-to-end', detail: 'Focus on FleetIQ architecture — how does it instrument hosts, NICs, and switches?', category: 'company', sort_order: 1 },
    { title: 'Watch / read Suresh Vasudevan interviews', detail: 'Search LinkedIn or YouTube. What is his enterprise sales philosophy from NetApp / Nimble?', category: 'company', sort_order: 2 },
    { title: 'Map the neocloud landscape', detail: 'Research CoreWeave, Lambda Labs, Together.ai. What GPU clusters do they run? Public pain points?', category: 'market', sort_order: 3 },
    { title: 'Draft your "why Clockwork" narrative', detail: 'Write 3–5 sentences on why you\'re genuinely excited. Be specific — it will show in the interview.', category: 'presales', sort_order: 4 },
  ],
  // Monday (1)
  [
    { title: 'Study NCCL and GPU collective operations', detail: 'Read NVIDIA NCCL docs. Understand all-reduce, all-gather, reduce-scatter — these are what Clockwork optimises the fabric for.', category: 'technical', sort_order: 1 },
    { title: 'Read "Making Deep Learning Go Brrrr"', detail: 'Horace He\'s blog. Understand MFU and why GPU utilisation under 50% is common and costly.', category: 'technical', sort_order: 2 },
    { title: 'Review Clockwork\'s LinkedIn page', detail: 'Who joined recently? What do employees post? What conferences are they attending?', category: 'company', sort_order: 3 },
    { title: 'Draft a POC success-criteria document', detail: 'For a hypothetical hyperscaler: what does a 2-week POC measure? What is success? What does the readout look like?', category: 'presales', sort_order: 4 },
  ],
  // Tuesday (2)
  [
    { title: 'Study PTP (IEEE 1588) precision time protocol', detail: 'How does software clock sync work? Why is sub-microsecond sync hard and what does it unlock for one-way delay measurement?', category: 'technical', sort_order: 1 },
    { title: 'Read the Futuriom Clockwork analysis', detail: '"Clockwork\'s Moment Has Arrived" — futuriom.com. How does the analyst frame their value proposition?', category: 'market', sort_order: 2 },
    { title: 'Study RoCEv2 vs InfiniBand trade-offs', detail: 'Why are hyperscalers moving to Ethernet? PFC storms, congestion — how does Clockwork address these?', category: 'technical', sort_order: 3 },
    { title: 'Prepare 5 sharp questions to ask the interview team', detail: 'E.g.: How does FleetIQ handle heterogeneous clusters? What does a typical POC timeline look like? How is SE success measured?', category: 'presales', sort_order: 4 },
  ],
  // Wednesday (3)
  [
    { title: 'Get hands-on with Kubernetes GPU workloads', detail: 'Deploy a simple ML training job on GKE or minikube + NVIDIA device plugin. Touch the tools you\'ll talk about.', category: 'technical', sort_order: 1 },
    { title: 'Study AWS EFA and GCP GPUDirect Tcpx', detail: 'Cloud provider docs on GPU networking. Where does Clockwork fit alongside these cloud-native solutions?', category: 'technical', sort_order: 2 },
    { title: 'Build a GPU utilisation ROI calculator', detail: '# GPUs × cost/hr × utilisation improvement % = annual savings. For 1,000 H100s at $3/hr, what does 10% improvement mean?', category: 'presales', sort_order: 3 },
    { title: 'Research Datadog\'s AI monitoring capabilities', detail: 'What does Datadog do for AI/ML? Know exactly where it stops and where Clockwork goes deeper.', category: 'market', sort_order: 4 },
  ],
  // Thursday (4)
  [
    { title: 'Study GPU cluster fault tolerance', detail: 'What happens when one GPU fails in a 10k-GPU training job? Checkpoint strategies, elastic training, Clockwork\'s approach.', category: 'technical', sort_order: 1 },
    { title: 'Deep-read the SiliconAngle $20.5M funding article', detail: 'Read as a product analyst — what technical claims are made? What customer problems are called out?', category: 'company', sort_order: 2 },
    { title: 'Research Juniper / HPE and Arista in AI networking', detail: 'What are hardware vendors doing for AI fabrics? Their limitations vs Clockwork\'s software-only approach.', category: 'market', sort_order: 3 },
    { title: 'Practice your 2-minute Clockwork pitch — record it', detail: 'Record yourself. Watch it back. Is it crisp, specific, free of filler?', category: 'presales', sort_order: 4 },
  ],
  // Friday (5)
  [
    { title: 'Study RDMA fundamentals', detail: 'What is Remote Direct Memory Access? Why does it matter for GPU-to-GPU comms? How does fabric stability affect RDMA performance?', category: 'technical', sort_order: 1 },
    { title: 'Map your experience to the SE role requirements', detail: 'For each bullet in the JD, write one concrete example from your background with a specific metric or outcome.', category: 'presales', sort_order: 2 },
    { title: 'Study PFC and ECN in depth', detail: 'Priority Flow Control and Explicit Congestion Notification. Why do they matter at GPU cluster scale?', category: 'technical', sort_order: 3 },
    { title: 'Set up your ongoing learning routine', detail: 'Which newsletters / podcasts will you follow weekly? Build a sustainable 30-min/day habit.', category: 'company', sort_order: 4 },
  ],
  // Saturday (6)
  [
    { title: 'Deep-read the FleetIQ press release', detail: 'accessnewswire.com — "Clockwork Launches FleetIQ." Extract every technical claim. Verify you can explain each one.', category: 'company', sort_order: 1 },
    { title: 'Study neoclouds as a customer segment', detail: 'Top 10 neoclouds? Their business model? Why is GPU utilisation existential for them?', category: 'market', sort_order: 2 },
    { title: 'Build your technical demo storytelling framework', detail: '(1) Customer pain → (2) Show the problem → (3) Clockwork solves it → (4) Before/after win. Record and review.', category: 'presales', sort_order: 3 },
    { title: 'Update your mastery checklist', detail: 'Check off what you\'ve genuinely learned. What gaps remain? Plan next week\'s focus.', category: 'company', sort_order: 4 },
  ],
]

// ─── Tab definition ───────────────────────────────────────────────────────

type Tab = 'feed' | 'tasks' | 'mastery' | 'notes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'feed',    label: '📰 Intel Feed' },
  { id: 'tasks',   label: '✅ Daily Tasks' },
  { id: 'mastery', label: '🎓 Mastery' },
  { id: 'notes',   label: '📝 Notes' },
]

// ─── Main page ────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<Tab>('feed')

  const [intelItems,   setIntelItems]   = useState<IntelItem[]>([])
  const [dailyTasks,   setDailyTasks]   = useState<DailyTask[]>([])
  const [masteryItems, setMasteryItems] = useState<MasteryItem[]>([])
  const [notes,        setNotes]        = useState<ResearchNote[]>([])

  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [items, tasks, mastery, fetchedNotes] = await Promise.all([
        fetchIntelItems(),
        fetchTasksForDate(todayStr),
        fetchMasteryItems(),
        fetchNotes(),
      ])
      setIntelItems(items)
      setMasteryItems(mastery)
      setNotes(fetchedNotes)

      // Seed today's tasks from templates if none exist yet
      if (tasks.length === 0) {
        const dow       = new Date().getDay()
        const templates = DAILY_TEMPLATES[dow]
        const seeded: DailyTask[] = []
        for (const t of templates) {
          const task = await upsertTask({ ...t, task_date: todayStr })
          if (task) seeded.push(task)
        }
        setDailyTasks(seeded)
      } else {
        setDailyTasks(tasks)
      }

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fetch fresh intel from API route ─────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch('/api/fetch-intel')
      const fresh = await fetchIntelItems()
      setIntelItems(fresh)
    } finally {
      setRefreshing(false)
    }
  }, [])

  // ── Intel actions ─────────────────────────────────────────────────────────
  const handleIntelAction = useCallback(async (itemId: string, action: ActionType) => {
    await recordAction(itemId, action)
    // Optimistic update: re-fetch items to get updated actions
    const fresh = await fetchIntelItems()
    setIntelItems(fresh)
  }, [])

  const handleAddManual = useCallback(async (form: {
    title: string; url: string; summary: string; item_type: string
  }) => {
    const item = await addIntelItem({
      source:       'manual',
      item_type:    form.item_type as IntelItem['item_type'],
      title:        form.title,
      url:          form.url || null,
      summary:      form.summary || null,
      published_at: new Date().toISOString(),
      tags:         ['manual'],
      metadata:     {},
    })
    if (item) setIntelItems((prev) => [item, ...prev])
  }, [])

  // ── Task actions ──────────────────────────────────────────────────────────
  const handleToggleTask = useCallback(async (id: string, completed: boolean) => {
    await completeTask(id, completed)
    setDailyTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, completed_at: completed ? new Date().toISOString() : null } : t
      )
    )
  }, [])

  // ── Mastery actions ───────────────────────────────────────────────────────
  const handleToggleMastery = useCallback(async (id: string, completed: boolean) => {
    await completeMasteryItem(id, completed)
    setMasteryItems((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, completed_at: completed ? new Date().toISOString() : null } : m
      )
    )
  }, [])

  // ── Note actions ──────────────────────────────────────────────────────────
  const handleSaveNote = useCallback(async (note: Omit<ResearchNote, 'id' | 'created_at' | 'updated_at'>) => {
    const saved = await saveNote(note)
    if (saved) setNotes((prev) => [saved, ...prev])
  }, [])

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

  // ── Derived stats ─────────────────────────────────────────────────────────
  const unreadCount = intelItems.filter(isUnread).length

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <Header unreadCount={unreadCount} onRefresh={handleRefresh} refreshing={refreshing} />

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
                {/* Badges */}
                {t.id === 'feed'  && unreadCount > 0 && (
                  <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {unreadCount}
                  </span>
                )}
                {t.id === 'tasks' && dailyTasks.filter((t) => !t.completed_at).length > 0 && (
                  <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">
                    {dailyTasks.filter((t) => !t.completed_at).length}
                  </span>
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
              <p className="text-sm font-medium">Loading your research hub…</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl">
            {tab === 'feed' && (
              <IntelFeed
                items={intelItems}
                onAction={handleIntelAction}
                onAddManual={handleAddManual}
              />
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
          </div>
        )}
      </main>
    </div>
  )
}
