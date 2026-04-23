'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ResearchNote } from '@/lib/types'

interface Props {
  notes: ResearchNote[]
  onSave:   (note: Omit<ResearchNote, 'id' | 'created_at' | 'updated_at'>) => void
  onUpdate: (id: string, patch: Partial<Pick<ResearchNote, 'title' | 'content' | 'tags'>>) => void
  onDelete: (id: string) => void
}

export default function ResearchNotes({ notes, onSave, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<string | null>(null)   // note id being edited
  const [showNew, setShowNew] = useState(false)
  const [newNote, setNewNote] = useState({ title: '', content: '', tags: '' })
  const [editData, setEditData] = useState({ title: '', content: '', tags: '' })

  function startEdit(note: ResearchNote) {
    setEditing(note.id)
    setEditData({ title: note.title, content: note.content, tags: note.tags.join(', ') })
  }

  function saveEdit() {
    if (!editing) return
    onUpdate(editing, {
      title:   editData.title,
      content: editData.content,
      tags:    editData.tags.split(',').map((t) => t.trim()).filter(Boolean),
    })
    setEditing(null)
  }

  function handleSaveNew(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.title || !newNote.content) return
    onSave({
      title:   newNote.title,
      content: newNote.content,
      tags:    newNote.tags.split(',').map((t) => t.trim()).filter(Boolean),
    })
    setNewNote({ title: '', content: '', tags: '' })
    setShowNew(false)
  }

  return (
    <div>
      {/* New note button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowNew(!showNew)}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#3d74cc] text-white font-medium hover:bg-[#2a5bb5] transition-colors"
        >
          + New Note
        </button>
      </div>

      {/* New note form */}
      {showNew && (
        <form
          onSubmit={handleSaveNew}
          className="bg-white rounded-xl border border-[#c5d5f5] p-4 mb-4 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-gray-800 mb-3">New Research Note</h3>
          <div className="space-y-3">
            <input
              required
              value={newNote.title}
              onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
              placeholder="Title *"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc]"
            />
            <textarea
              required
              value={newNote.content}
              onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
              placeholder="Your notes… *"
              rows={5}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc] resize-none font-mono"
            />
            <input
              value={newNote.tags}
              onChange={(e) => setNewNote({ ...newNote, tags: e.target.value })}
              placeholder="Tags (comma separated, e.g. fleetiq, technical, presales)"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc]"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-[#3d74cc] text-white font-medium hover:bg-[#2a5bb5]">
              Save Note
            </button>
            <button type="button" onClick={() => setShowNew(false)} className="text-sm px-4 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-3xl mb-2">📝</div>
          <p className="text-sm font-medium">No notes yet</p>
          <p className="text-xs mt-1">Capture key learnings as you research — they'll persist across sessions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {editing === note.id ? (
                /* Edit mode */
                <div className="p-4 space-y-3">
                  <input
                    value={editData.title}
                    onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                    className="w-full text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc]"
                  />
                  <textarea
                    value={editData.content}
                    onChange={(e) => setEditData({ ...editData, content: e.target.value })}
                    rows={6}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc] resize-none font-mono"
                  />
                  <input
                    value={editData.tags}
                    onChange={(e) => setEditData({ ...editData, tags: e.target.value })}
                    placeholder="Tags (comma separated)"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc]"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded-lg bg-[#3d74cc] text-white font-medium hover:bg-[#2a5bb5]">Save</button>
                    <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-800">{note.title}</h3>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(note)} className="text-[11px] text-gray-400 hover:text-[#3d74cc] px-2 py-0.5 rounded hover:bg-blue-50">Edit</button>
                      <button onClick={() => onDelete(note.id)} className="text-[11px] text-gray-400 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-50">Delete</button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed mb-3">{note.content}</p>

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex flex-wrap gap-1">
                      {note.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0f5ff] text-[#3d74cc]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {(() => { try { return format(parseISO(note.updated_at), 'MMM d, h:mm a') } catch { return note.updated_at.slice(0, 10) } })()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
