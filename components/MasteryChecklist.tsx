'use client'

import { useMemo } from 'react'
import { MasteryItem, MasteryPriority } from '@/lib/types'

interface Props {
  items: MasteryItem[]
  onToggle: (id: string, completed: boolean) => void
}

const PRIORITY_STYLES: Record<MasteryPriority, string> = {
  must:   'bg-red-50 text-red-600 border-red-100',
  high:   'bg-orange-50 text-orange-500 border-orange-100',
  medium: 'bg-green-50 text-green-600 border-green-100',
}

const PRIORITY_LABELS: Record<MasteryPriority, string> = {
  must:   'MUST',
  high:   'HIGH',
  medium: 'MED',
}

export default function MasteryChecklist({ items, onToggle }: Props) {
  const byCategory = useMemo(() => {
    const map: Record<string, MasteryItem[]> = {}
    for (const item of items) {
      if (!map[item.category]) map[item.category] = []
      map[item.category].push(item)
    }
    return map
  }, [items])

  const totalDone  = items.filter((i) => i.completed_at).length
  const totalItems = items.length
  const overallPct = totalItems ? Math.round((totalDone / totalItems) * 100) : 0

  return (
    <div>
      {/* Overall progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Overall Mastery Progress</span>
          <span className="text-sm font-bold text-[#3d74cc]">{overallPct}%</span>
        </div>
        <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${overallPct}%`, background: 'linear-gradient(90deg, #3d74cc, #578bdd)' }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{totalDone} of {totalItems} topics mastered</p>
      </div>

      {/* Per-category sections */}
      {Object.entries(byCategory).map(([category, catItems]) => {
        const done    = catItems.filter((i) => i.completed_at).length
        const catPct  = Math.round((done / catItems.length) * 100)

        return (
          <div key={category} className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
            {/* Category header */}
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{category}</h3>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${catPct}%`, background: 'linear-gradient(90deg, #3d74cc, #578bdd)' }}
                  />
                </div>
                <span className="text-xs text-gray-400">{done}/{catItems.length}</span>
              </div>
            </div>

            {/* Items */}
            <ul className="divide-y divide-gray-50">
              {catItems.map((item) => {
                const done = !!item.completed_at
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => onToggle(item.id, !done)}
                      className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors mt-0.5 ${
                        done
                          ? 'bg-[#3d74cc] border-[#3d74cc]'
                          : 'border-gray-300 hover:border-[#3d74cc]'
                      }`}
                    >
                      {done && <span className="text-white text-[8px] font-bold">✓</span>}
                    </button>

                    <label
                      onClick={() => onToggle(item.id, !done)}
                      className={`text-xs leading-relaxed cursor-pointer flex-1 ${
                        done ? 'line-through text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {item.title}
                    </label>

                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_STYLES[item.priority]}`}>
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
