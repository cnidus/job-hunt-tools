'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import Header from '@/components/Header'
import JobCard from '@/components/JobCard'
import AddJobModal from '@/components/AddJobModal'
import { fetchJobs, fetchIntelUnreadCount, fetchTasksForDate } from '@/lib/storage'
import type { Job } from '@/lib/types'

interface JobMetrics {
  jobId: string
  unreadCount: number
  tasksDone: number
  tasksTotal: number
}

export default function JobsOverview() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [metrics, setMetrics] = useState<Record<string, JobMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const allJobs = await fetchJobs()
      setJobs(allJobs)

      // Fetch metrics for all jobs in parallel
      const metricsArr = await Promise.all(
        allJobs.map(async (job) => {
          const [unreadCount, tasks] = await Promise.all([
            fetchIntelUnreadCount(job.id),
            fetchTasksForDate(todayStr, job.id),
          ])
          return {
            jobId:      job.id,
            unreadCount,
            tasksDone:  tasks.filter((t) => t.completed_at).length,
            tasksTotal: tasks.length,
          }
        })
      )

      const map: Record<string, JobMetrics> = {}
      for (const m of metricsArr) map[m.jobId] = m
      setMetrics(map)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalUnread = Object.values(metrics).reduce((sum, m) => sum + m.unreadCount, 0)

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Page title + Add button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Your jobs</h2>
            {!loading && jobs.length > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {jobs.length} role{jobs.length !== 1 ? 's' : ''} tracked
                {totalUnread > 0 && ` · ${totalUnread} unread intel`}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-xl transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #3d74cc 100%)' }}
          >
            + Track new job
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3 animate-spin">⟳</div>
              <p className="text-sm font-medium">Loading your jobs…</p>
            </div>
          </div>
        ) : jobs.length === 0 ? (
          /* Empty state */
          <div className="text-center py-24">
            <div className="text-5xl mb-4">🎯</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No jobs tracked yet</h3>
            <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
              Add a role you are pursuing and get a full research hub: intel feed, daily tasks, mastery checklist, and notes.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-sm font-medium text-white px-6 py-3 rounded-xl transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #3d74cc 100%)' }}
            >
              Track your first job →
            </button>
          </div>
        ) : (
          /* Job grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => {
              const m = metrics[job.id]
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  unreadCount={m?.unreadCount ?? 0}
                  tasksDone={m?.tasksDone ?? 0}
                  tasksTotal={m?.tasksTotal ?? 0}
                />
              )
            })}

            {/* Add another */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex flex-col items-center justify-center gap-2 bg-white rounded-xl border-2 border-dashed border-gray-200 p-8 text-gray-400 hover:border-blue-200 hover:text-blue-400 transition-colors min-h-[160px]"
            >
              <span className="text-3xl">+</span>
              <span className="text-sm font-medium">Track another job</span>
            </button>
          </div>
        )}
      </main>

      {showAddModal && <AddJobModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
