import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Video, Upload, Film, Clock, HardDrive, X, Loader2, LogOut, User,
  Send, Paperclip, CheckCircle2, AlertCircle, Play, Trash2, MessageSquare,
  Smartphone, FileText, Mic,
} from 'lucide-react'
import MuxPlayer from '@mux/mux-player-react'
import QRUploadSection from './QRUploadSection'
import './ChatUploadPage.css'

const API_BASE = '/api'

interface UserInfo {
  userId: string
  username: string
  displayName: string
}

interface ChatUploadPageProps {
  token: string
  user: UserInfo
  onLogout: () => void
}

interface VideoItem {
  id: string
  name: string
  size: number
  duration: string
  playbackId: string | null
  status: string
  createdAt: string
}

interface VideoEntry {
  entryId: string
  video: VideoItem
  uploadProgress: number
  uploadStatus: 'uploading' | 'processing' | 'complete' | 'error'
  uploadError?: string
}

// Local UI message (not persisted — only system + text-only user messages)
interface LocalMessage {
  id: string
  kind: 'system'
  text: string
  isError?: boolean
  timestamp: Date
}

// Persisted chat message from the API
interface ChatMsg {
  id: string
  kind: 'chat'
  serverMsgId: string | null // null while saving
  text?: string
  videos: VideoEntry[]
  timestamp: Date
}

type AnyMessage = LocalMessage | ChatMsg

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(1) + ' GB'
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB'
  return (bytes / 1_000).toFixed(1) + ' KB'
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: 'numeric', minute: '2-digit' })
}

function getVideoDuration(file: File): Promise<{ formatted: string; totalSeconds: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      const totalSeconds = Math.floor(video.duration)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      resolve({ formatted: `${minutes}:${seconds.toString().padStart(2, '0')}`, totalSeconds })
    }
    video.onerror = () => resolve({ formatted: '0:00', totalSeconds: 0 })
    video.src = URL.createObjectURL(file)
  })
}

interface UploadLimits {
  maxFileSizeBytes: number
  maxDurationSeconds: number
}

function ChatUploadPage({ token, user, onLogout }: ChatUploadPageProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<AnyMessage[]>([
    {
      id: 'welcome',
      kind: 'system',
      text: 'Bienvenue ! Joignez jusqu\'à 2 vidéos, ajoutez un message, puis envoyez.',
      timestamp: new Date(),
    },
  ])
  const [textInput, setTextInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingVideos, setPendingVideos] = useState<VideoItem[]>([]) // already-uploaded (e.g. from mobile)
  const [dragging, setDragging] = useState(false)
  const [limits, setLimits] = useState<UploadLimits>({ maxFileSizeBytes: 5 * 1024 * 1024, maxDurationSeconds: 60 })
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null)
  const [showQR, setShowQR] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const pendingVideosRef = useRef(pendingVideos)
  pendingVideosRef.current = pendingVideos
  const mobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mobileCountdown, setMobileCountdown] = useState<number | null>(null)
  const mobileCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingFilesRef = useRef(pendingFiles)
  pendingFilesRef.current = pendingFiles
  const knownVideoIdsRef = useRef(new Set<string>())
  const mobileCheckingRef = useRef(false)

  const authHeaders = { Authorization: `Bearer ${token}` }

  const clearMobileTimer = useCallback(() => {
    if (mobileTimerRef.current) { clearTimeout(mobileTimerRef.current); mobileTimerRef.current = null }
    if (mobileCountdownRef.current) { clearInterval(mobileCountdownRef.current); mobileCountdownRef.current = null }
    setMobileCountdown(null)
  }, [])

  const startMobileTimer = useCallback(() => {
    clearMobileTimer()
    const expiresAt = Date.now() + 60_000
    setMobileCountdown(60)
    mobileCountdownRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setMobileCountdown(left)
      if (left <= 0) {
        clearMobileTimer()
        setPendingVideos([])
      }
    }, 1000)
    mobileTimerRef.current = setTimeout(() => {
      clearMobileTimer()
      setPendingVideos([])
    }, 60_000)
  }, [clearMobileTimer])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  // Fetch upload limits
  useEffect(() => {
    fetch(`${API_BASE}/settings/upload-limits`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setLimits(data) })
      .catch(() => {})
  }, [])

  // Load persisted chat messages on mount
  useEffect(() => {
    fetch(`${API_BASE}/chat-messages`, { headers: authHeaders })
      .then(res => {
        if (res.status === 401) { onLogout(); return null }
        return res.ok ? res.json() : null
      })
      .then((data: Array<{ id: string; text?: string; videos: VideoItem[]; createdAt: string }> | null) => {
        if (!data || data.length === 0) {
          // Even with no messages, seed known IDs from all existing videos
          fetch(`${API_BASE}/videos`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then((vids: VideoItem[]) => vids.forEach(v => knownVideoIdsRef.current.add(v.id)))
            .catch(() => {})
          return
        }
        // Mark all video IDs from chat messages as known
        data.forEach(m => m.videos.forEach(v => knownVideoIdsRef.current.add(v.id)))
        const chatMsgs: ChatMsg[] = data.map(m => ({
          id: `chat-${m.id}`,
          kind: 'chat' as const,
          serverMsgId: m.id,
          text: m.text || undefined,
          videos: m.videos.map(v => ({
            entryId: v.id,
            video: v,
            uploadProgress: 100,
            uploadStatus: v.status === 'ready' ? 'complete' as const : v.status === 'errored' ? 'error' as const : 'processing' as const,
          })),
          timestamp: new Date(m.createdAt),
        }))
        setMessages(prev => {
          const existingServerIds = new Set(
            prev.filter((m): m is ChatMsg => m.kind === 'chat').map(m => m.serverMsgId)
          )
          const newMsgs = chatMsgs.filter(m => !existingServerIds.has(m.serverMsgId))
          if (newMsgs.length === 0) return prev
          return [...prev, ...newMsgs]
        })
        scrollToBottom()
      })
      .catch(() => {})
  }, [token])

  // Poll for processing videos
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      const currentMessages = messagesRef.current
      const hasProcessing = currentMessages.some(m => {
        if (m.kind !== 'chat') return false
        return m.videos.some(v => v.uploadStatus === 'processing' || v.uploadStatus === 'uploading')
      })
      if (!hasProcessing) return

      try {
        const res = await fetch(`${API_BASE}/videos`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const videos: VideoItem[] = await res.json()
        const videoMap = new Map(videos.map(v => [v.id, v]))

        setMessages(prev => {
          let changed = false
          const next = prev.map(m => {
            if (m.kind !== 'chat') return m
            let groupChanged = false
            const updatedVideos = m.videos.map(entry => {
              if (!entry.video.id) return entry
              const updated = videoMap.get(entry.video.id)
              if (!updated) return entry
              if (updated.status === 'ready' && entry.uploadStatus !== 'complete') {
                groupChanged = true
                return { ...entry, video: updated, uploadStatus: 'complete' as const }
              }
              if (updated.status === 'errored' && entry.uploadStatus !== 'error') {
                groupChanged = true
                return { ...entry, video: updated, uploadStatus: 'error' as const }
              }
              if (updated.playbackId !== entry.video.playbackId) {
                groupChanged = true
                return { ...entry, video: updated }
              }
              return entry
            })
            if (groupChanged) {
              changed = true
              return { ...m, videos: updatedVideos }
            }
            return m
          })
          return changed ? next : prev
        })
      } catch { /* ignore */ }
    }, 4000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [token])

  const addLocalMessage = useCallback((msg: Omit<LocalMessage, 'id' | 'timestamp'>) => {
    const newMsg: LocalMessage = { ...msg, id: crypto.randomUUID(), timestamp: new Date() }
    setMessages(prev => [...prev, newMsg])
    scrollToBottom()
  }, [scrollToBottom])

  // Stage a file as pending attachment
  const addPendingFile = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      addLocalMessage({ kind: 'system', text: `"${file.name}" n'est pas un fichier vidéo.`, isError: true })
      return
    }
    if (file.size > limits.maxFileSizeBytes) {
      addLocalMessage({
        kind: 'system',
        text: `"${file.name}" (${formatFileSize(file.size)}) dépasse la limite de ${limits.maxFileSizeBytes / (1024 * 1024)} Mo.`,
        isError: true,
      })
      return
    }
    setPendingFiles(prev => {
      const totalPending = prev.length + pendingVideos.length
      if (totalPending >= 2) return prev
      if (prev.some(f => f.name === file.name && f.size === file.size)) return prev
      return [...prev, file]
    })
  }, [limits, addLocalMessage, pendingVideos])

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Upload a single file, return videoId
  const uploadOneFile = useCallback(async (
    file: File,
    localMsgId: string,
    entryId: string,
  ): Promise<string | null> => {
    const updateEntry = (updates: Partial<VideoEntry>) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== localMsgId || m.kind !== 'chat') return m
        return {
          ...m,
          videos: m.videos.map(v => v.entryId === entryId ? { ...v, ...updates } : v),
        }
      }))
    }

    try {
      const { formatted: duration, totalSeconds } = await getVideoDuration(file)

      if (totalSeconds > limits.maxDurationSeconds) {
        updateEntry({
          uploadStatus: 'error',
          uploadError: `La vidéo dure ${totalSeconds}s — dépasse la limite de ${limits.maxDurationSeconds}s`,
        })
        return null
      }

      const createRes = await fetch(`${API_BASE}/videos/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name: file.name, size: file.size, duration }),
      })

      if (!createRes.ok) {
        if (createRes.status === 401) { onLogout(); return null }
        let msg = 'Envoi rejeté par le serveur'
        try { const errJson = await createRes.json(); if (errJson.message) msg = errJson.message } catch { /* */ }
        throw new Error(msg)
      }

      const { videoId, uploadUrl } = await createRes.json()

      updateEntry({
        video: { id: videoId, name: file.name, size: file.size, duration, playbackId: null, status: 'uploading', createdAt: new Date().toISOString() },
      })

      return new Promise<string | null>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateEntry({ uploadProgress: (e.loaded / e.total) * 100 })
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateEntry({ uploadProgress: 100, uploadStatus: 'processing' })
            resolve(videoId)
          } else {
            updateEntry({ uploadStatus: 'error', uploadError: `Échec de l'envoi (${xhr.status})` })
            resolve(null)
          }
        }

        xhr.onerror = () => {
          updateEntry({ uploadStatus: 'error', uploadError: 'Erreur réseau pendant l\'envoi' })
          resolve(null)
        }

        xhr.send(file)
      })
    } catch (err) {
      updateEntry({
        uploadStatus: 'error',
        uploadError: err instanceof Error ? err.message : 'Échec de l\'envoi',
      })
      return null
    }
  }, [token, limits, onLogout])

  const removePendingVideo = useCallback((id: string) => {
    setPendingVideos(prev => {
      const next = prev.filter(v => v.id !== id)
      if (next.length === 0) clearMobileTimer()
      return next
    })
  }, [clearMobileTimer])

  // Send: text + pending files + pending videos
  const handleSend = useCallback(async () => {
    const text = textInput.trim()
    const files = [...pendingFiles]
    const mobileVideos = [...pendingVideos]
    const hasAttachments = files.length > 0 || mobileVideos.length > 0
    if (!text && !hasAttachments) return

    // Help command
    if (!hasAttachments && text.toLowerCase() === 'help') {
      addLocalMessage({ kind: 'system', text: 'Utilisez le bouton trombone ou glissez-déposez une vidéo dans ce chat. Max 2 vidéos par envoi. Formats : MP4, MOV, AVI, WebM, MKV.' })
      setTextInput('')
      return
    }

    // Text-only message (no files, no mobile videos)
    if (!hasAttachments) {
      const localId = crypto.randomUUID()
      const chatMsg: ChatMsg = {
        id: localId, kind: 'chat', serverMsgId: null, text, videos: [], timestamp: new Date(),
      }
      setMessages(prev => [...prev, chatMsg])
      scrollToBottom()
      setTextInput('')

      try {
        const res = await fetch(`${API_BASE}/chat-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, videoIds: [] }),
        })
        if (res.ok) {
          const saved = await res.json()
          setMessages(prev => prev.map(m =>
            m.id === localId && m.kind === 'chat' ? { ...m, serverMsgId: saved.id } : m
          ))
        }
      } catch { /* still shown locally */ }
      return
    }

    // Build entries: mobile videos (already uploaded) + local files (need upload)
    const mobileEntries: VideoEntry[] = mobileVideos.map(v => ({
      entryId: v.id,
      video: v,
      uploadProgress: 100,
      uploadStatus: v.status === 'ready' ? 'complete' as const : 'processing' as const,
    }))

    const fileEntries: VideoEntry[] = files.map(file => ({
      entryId: crypto.randomUUID(),
      video: {
        id: '', name: file.name, size: file.size, duration: '0:00',
        playbackId: null, status: 'uploading', createdAt: new Date().toISOString(),
      },
      uploadProgress: 0,
      uploadStatus: 'uploading' as const,
    }))

    const allEntries = [...mobileEntries, ...fileEntries]
    const localMsgId = crypto.randomUUID()
    const chatMsg: ChatMsg = {
      id: localMsgId, kind: 'chat', serverMsgId: null,
      text: text || undefined, videos: allEntries, timestamp: new Date(),
    }

    setMessages(prev => [...prev, chatMsg])
    scrollToBottom()
    setTextInput('')
    setPendingFiles([])
    setPendingVideos([])
    clearMobileTimer()

    // Upload local files
    const uploadedIds: (string | null)[] = files.length > 0
      ? await Promise.all(files.map((file, i) => uploadOneFile(file, localMsgId, fileEntries[i].entryId)))
      : []

    // Combine all video IDs
    const allVideoIds = [
      ...mobileVideos.map(v => v.id),
      ...uploadedIds.filter((id): id is string => id !== null),
    ]

    if (allVideoIds.length > 0 || text) {
      try {
        const res = await fetch(`${API_BASE}/chat-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: text || null, videoIds: allVideoIds }),
        })
        if (res.ok) {
          const saved = await res.json()
          setMessages(prev => prev.map(m =>
            m.id === localMsgId && m.kind === 'chat' ? { ...m, serverMsgId: saved.id } : m
          ))
        }
      } catch { /* ignore */ }
    }
  }, [textInput, pendingFiles, pendingVideos, addLocalMessage, uploadOneFile, scrollToBottom, token])

  const deleteVideo = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/videos/${id}`, { method: 'DELETE', headers: authHeaders })
      if (res.ok) {
        setMessages(prev => {
          return prev
            .map(m => {
              if (m.kind !== 'chat') return m
              const filtered = m.videos.filter(v => v.video.id !== id)
              if (filtered.length === 0 && !m.text) return null
              return { ...m, videos: filtered }
            })
            .filter(Boolean) as AnyMessage[]
        })
        if (playingVideo?.id === id) setPlayingVideo(null)
      }
    } catch { /* ignore */ }
  }, [playingVideo, token])

  const handleNewMobileUpload = useCallback(async () => {
    if (mobileCheckingRef.current) return
    mobileCheckingRef.current = true
    try {
      const res = await fetch(`${API_BASE}/videos`, { headers: authHeaders })
      if (!res.ok) return
      const videos: VideoItem[] = await res.json()

      const newVideos = videos.filter(v => !knownVideoIdsRef.current.has(v.id))
      if (newVideos.length === 0) return

      // Mark as known immediately — this is synchronous so no race
      newVideos.forEach(v => knownVideoIdsRef.current.add(v.id))

      // Stage as pending
      setPendingVideos(prev => {
        const totalPending = prev.length + pendingFilesRef.current.length
        const spaceLeft = Math.max(0, 2 - totalPending)
        const toAdd = newVideos.slice(0, spaceLeft)
        if (toAdd.length === 0) return prev
        return [...prev, ...toAdd]
      })

      addLocalMessage({
        kind: 'system',
        text: `${newVideos.length} vidéo${newVideos.length > 1 ? 's' : ''} reçue(s) du téléphone — envoyez dans 1 min`,
      })
      startMobileTimer()
      scrollToBottom()
    } catch { /* ignore */ } finally {
      mobileCheckingRef.current = false
    }
  }, [token, addLocalMessage, scrollToBottom])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) addPendingFile(file)
  }, [addPendingFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) addPendingFile(file)
    e.target.value = ''
  }, [addPendingFile])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingVideo(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Cleanup mobile timer on unmount
  useEffect(() => {
    return () => clearMobileTimer()
  }, [clearMobileTimer])

  // Render a single video card
  const renderVideoCard = (
    video: VideoItem,
    uploadStatus: string | undefined,
    uploadProgress: number | undefined,
    uploadError: string | undefined,
  ) => (
    <div className="chat-video-card">
      <div className="chat-video-thumb">
        {uploadStatus === 'complete' && video.playbackId ? (
          <>
            <MuxPlayer
              playbackId={video.playbackId}
              metadata={{ video_title: video.name }}
              thumbnailTime={1}
              style={{ width: '100%', height: '100%' }}
              paused
            />
            <div
              className="chat-video-play-overlay"
              onClick={() => setPlayingVideo(video)}
            >
              <div className="chat-play-btn">
                <Play size={20} fill="currentColor" />
              </div>
            </div>
            {video.duration && (
              <span className="chat-video-duration">{video.duration}</span>
            )}
          </>
        ) : (
          <div className="chat-video-thumb-placeholder">
            {uploadStatus === 'error' ? (
              <AlertCircle size={28} />
            ) : (
              <Loader2 size={28} className="spinner" />
            )}
          </div>
        )}
      </div>

      <div className="chat-video-info">
        {uploadStatus === 'uploading' ? (
          <div className="chat-upload-progress">
            <div className="chat-progress-bar-bg">
              <div
                className="chat-progress-bar"
                style={{ width: `${uploadProgress || 0}%` }}
              />
            </div>
            <span className="chat-progress-text">
              Envoi {Math.round(uploadProgress || 0)}%
            </span>
          </div>
        ) : (
          <>
            <div className="chat-video-name">{video.name}</div>
            <div className="chat-video-meta">
              <span><HardDrive size={12} /> {formatFileSize(video.size)}</span>
              {video.duration !== '0:00' && (
                <span><Clock size={12} /> {video.duration}</span>
              )}
            </div>
            {uploadStatus === 'processing' && (
              <div className="chat-status chat-status-processing">
                <Loader2 size={12} className="spinner" />
                Traitement
              </div>
            )}
            {uploadStatus === 'complete' && (
              <div className="chat-status chat-status-ready">
                <CheckCircle2 size={12} />
                Prêt
              </div>
            )}
            {uploadStatus === 'error' && (
              <div className="chat-status chat-status-error">
                <AlertCircle size={12} />
                {uploadError || 'Error'}
              </div>
            )}
          </>
        )}
      </div>

      {video.id && (
        <button
          className="chat-video-delete"
          onClick={() => deleteVideo(video.id)}
          title="Supprimer la vidéo"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )

  const totalPending = pendingFiles.length + pendingVideos.length
  const canSend = textInput.trim() || totalPending > 0

  return (
    <div
      className={`chat-page${dragging ? ' chat-dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={handleDrop}
    >
      {/* Navigation */}
      <nav className="chat-nav">
        <div className="chat-nav-content">
          <div className="chat-nav-brand">
            <Video size={24} />
            <span>Plateforme Vidéo</span>
          </div>
          <div className="chat-nav-tabs">
            <button className="chat-nav-tab" onClick={() => navigate('/')}>
              <Upload size={16} />
              <span>Envoi</span>
            </button>
            <button className="chat-nav-tab active">
              <MessageSquare size={16} />
              <span>Envoi Chat</span>
            </button>
            <button className="chat-nav-tab" onClick={() => navigate('/transcription')}>
              <FileText size={16} />
              <span>Transcription</span>
            </button>
            <button className="chat-nav-tab" onClick={() => navigate('/clarity')}>
              <Mic size={16} />
              <span>Copilote Client</span>
            </button>
          </div>
          <div className="chat-nav-right">
            <div className="chat-nav-user">
              <User size={16} />
              <span>{user.displayName}</span>
            </div>
            <button className="chat-logout-btn" onClick={onLogout} title="Déconnexion">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      {/* Chat Area */}
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-msg chat-msg-${msg.kind}`}>
              {msg.kind === 'system' && (
                <div className={`chat-system-bubble${msg.isError ? ' chat-system-error' : ''}`}>
                  <AlertCircle size={14} />
                  <span>{msg.text}</span>
                </div>
              )}

              {msg.kind === 'chat' && msg.videos.length === 0 && msg.text && (
                <div className="chat-user-row">
                  <div className="chat-user-bubble">
                    <span>{msg.text}</span>
                    <span className="chat-bubble-time">{formatTime(msg.timestamp)}</span>
                  </div>
                </div>
              )}

              {msg.kind === 'chat' && msg.videos.length > 0 && (
                <div className="chat-video-group-row">
                  {msg.text && (
                    <div className="chat-user-bubble chat-group-text">
                      <span>{msg.text}</span>
                    </div>
                  )}
                  <div className={`chat-video-group${msg.videos.length > 1 ? ' chat-video-group-double' : ''}`}>
                    {msg.videos.map(entry => (
                      <div key={entry.entryId} className="chat-video-group-item">
                        {renderVideoCard(entry.video, entry.uploadStatus, entry.uploadProgress, entry.uploadError)}
                      </div>
                    ))}
                  </div>
                  <span className="chat-bubble-time-outside">{formatTime(msg.timestamp)}</span>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Drag overlay */}
        {dragging && (
          <div className="chat-drop-overlay">
            <div className="chat-drop-content">
              <Film size={40} />
              <span>Déposez votre vidéo ici</span>
            </div>
          </div>
        )}
      </div>

      {/* QR Panel */}
      {showQR && (
        <div className="chat-qr-panel">
          <div className="chat-qr-panel-inner">
            <QRUploadSection onNewUpload={handleNewMobileUpload} token={token} />
            <button className="chat-qr-close" onClick={() => setShowQR(false)} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="chat-input-bar">
        <div className="chat-compose-layout">
          {/* Left action buttons */}
          <div className="chat-compose-actions">
            <button
              className={`chat-action-btn${totalPending >= 2 ? ' disabled' : ''}`}
              onClick={() => totalPending < 2 && fileInputRef.current?.click()}
              title={totalPending >= 2 ? 'Max 2 vidéos' : 'Joindre une vidéo'}
            >
              <Paperclip size={20} />
            </button>
            <button
              className={`chat-action-btn${showQR ? ' active' : ''}`}
              onClick={() => setShowQR(s => !s)}
              title="Envoyer depuis le téléphone"
            >
              <Smartphone size={20} />
            </button>
          </div>

          {/* Center: input + attachments */}
          <div className={`chat-compose-box${totalPending > 0 ? ' has-files' : ''}`}>
            <input
              className="chat-text-input"
              type="text"
              placeholder={totalPending > 0 ? 'Ajouter un message (optionnel)...' : 'Tapez un message ou joignez une vidéo...'}
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {totalPending > 0 && (
              <div className="chat-compose-files">
                {pendingVideos.map(v => (
                  <div key={v.id} className="chat-compose-file chat-compose-file-mobile">
                    <Smartphone size={12} className="chat-compose-file-icon" />
                    <span className="chat-compose-file-name">{v.name}</span>
                    <span className="chat-compose-file-size">{formatFileSize(v.size)}</span>
                    <button className="chat-compose-file-remove" onClick={() => removePendingVideo(v.id)}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {pendingFiles.map((file, i) => (
                  <div key={`${file.name}-${file.size}`} className="chat-compose-file">
                    <Film size={12} className="chat-compose-file-icon" />
                    <span className="chat-compose-file-name">{file.name}</span>
                    <span className="chat-compose-file-size">{formatFileSize(file.size)}</span>
                    <button className="chat-compose-file-remove" onClick={() => removePendingFile(i)}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: send */}
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!canSend}
          >
            <Send size={18} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            hidden
          />
        </div>
        {mobileCountdown !== null && pendingVideos.length > 0 ? (
          <div className={`chat-mobile-timer-banner${mobileCountdown <= 15 ? ' urgent' : ''}`}>
            <Clock size={12} />
            <span>Les pièces jointes seront supprimées dans <strong>{mobileCountdown}s</strong> si non envoyées</span>
          </div>
        ) : (
          <div className="chat-input-hint">
            MP4, MOV, AVI, WebM, MKV — Max {limits.maxFileSizeBytes / (1024 * 1024)} Mo, {limits.maxDurationSeconds}s — Jusqu'à 2 vidéos par envoi
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      {playingVideo && playingVideo.playbackId && (
        <div className="chat-modal-overlay" onClick={() => setPlayingVideo(null)}>
          <div className="chat-modal-content" onClick={e => e.stopPropagation()}>
            <div className="chat-modal-header">
              <span className="chat-modal-title">{playingVideo.name}</span>
              <button className="chat-modal-close" onClick={() => setPlayingVideo(null)}>
                <X size={16} />
              </button>
            </div>
            <MuxPlayer
              playbackId={playingVideo.playbackId}
              metadata={{ video_title: playingVideo.name }}
              autoPlay
              style={{ width: '100%', aspectRatio: '16/9' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatUploadPage
