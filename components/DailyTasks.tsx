'use client'

import { DailyTask, TaskCategory } from '@/lib/types'

interface Props {
  tasks: DailyTask[]
  onToggle: (id: string, completed: boolean) => void
}

const CATEGORY_STYLES: Record<TaskCategory | 'general', string> = {
  company:  'bg-blue-50 text-blue-600 border-blue-100',
  technical:'bg-purple-50 text-purple-600 border-purple-100',
  presales: 'bg-green-50 text-green-600 border-green-100',
  market:   'bg-orange-50 text-orange-600 border-orange-100',
  general:  'bg-gray-50 text-gray-500 border-gray-200',
}

const CATEGORY_LABELS: Record<string, string> = {
  company:   '🏢 Company',
  technical: '⚙️ Technical',
  presales:  '🤝 Pre-Sales',
  market:    '📊 Market',
  general:   '📋 General',
}

export default function DailyTasks({ tasks, onToggle }: Props) {
  const completed = tasks.filter((t) => t.completed_at)
  const pending   = tasks.filter((t) => !t.completed_at)
  const pct       = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-sm">No tasks for today yet.</p>
        <p className="text-xs mt-1">Click &quot;Fetch Intel&quot; to generate today&apos;s tasks.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Today&apos;s Progress</span>
          <span className="text-sm font-bold text-[#3d74cc]">{pct}%</span>
        </div>
        <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #3d74cc, #578bdd)' }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {completed.length} of {tasks.length} tasks complete
        </p>
      </div>

      {/* Pending tasks */}
      {pending.length > 0 && (
        <div className="space-y-2 mb-4">
          {pending.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} />
          ))}
        </div>
      )}

      {/* Completed tasks */}
      {completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Completed</p>
          <div className="space-y-2 opacity-60">
            {completed.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={onToggle} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle }: { task: DailyTask; onToggle: (id: string, done: boolean) => void }) {
  const done = !!task.completed_at
  const cat  = task.category as TaskCategory | 'general'

  return (
    <div
      className={`flex items-start gap-3 p-3.5 rounded-xl border bg-white shadow-sm transition-opacity ${done ? 'opacity-70' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.id, !done)}
        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5 ${
          done
            ? 'bg-[#3d74cc] border-[#3d74cc]'
            : 'border-gray-300 hover:border-[#3d74cc]'
        }`}
      >
        {done && <span className="text-white text-[10px] font-bold">✓</span>}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </p>
        {task.detail && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{task.detail}</p>
        )}
      </div>

      {/* Category badge */}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${CATEGORY_STYLES[cat] ?? CATEGORY_STYLES.general}`}>
        {CATEGORY_LABELS[cat] ?? cat}
      </span>
    </div>
  )
}
