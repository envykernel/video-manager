import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, CheckCircle, AlertCircle, Film, Loader2, Clock, User, Plus } from 'lucide-react'
import './MobileUploadPage.css'

const API_BASE = '/api'

interface UploadedVideo {
  id: string
  name: string
  size: number
}

interface ActiveUpload {
  slotIndex: number
  file: File
  progress: number
  status: 'uploading' | 'complete' | 'error'
  error?: string
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(1) + ' GB'
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB'
  return (bytes / 1_000).toFixed(1) + ' KB'
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

export default function MobileUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [valid, setValid] = useState<boolean | null>(null)
  const [activeUpload, setActiveUpload] = useState<ActiveUpload | null>(null)
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  const [maxVideos, setMaxVideos] = useState(2)
  const [limits, setLimits] = useState({ maxFileSizeBytes: 5 * 1024 * 1024, maxDurationSeconds: 60 })
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [timeLeft, setTimeLeft] = useState('')
  const [sessionPercent, setSessionPercent] = useState(100)
  const [totalSessionMs, setTotalSessionMs] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${API_BASE}/mobile-upload/token/${token}/validate`)
      .then(async res => {
        if (res.ok) {
          const data = await res.json()
          setExpiresAt(data.expiresAt)
          setDisplayName(data.displayName || 'User')
          setValid(true)
        } else {
          setValid(false)
        }
      })
      .catch(() => setValid(false))

    fetch(`${API_BASE}/settings/upload-limits`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setLimits({ maxFileSizeBytes: data.maxFileSizeBytes, maxDurationSeconds: data.maxDurationSeconds })
          if (data.maxVideosPerSession) setMaxVideos(data.maxVideosPerSession)
          if (data.qrExpirationMinutes) setTotalSessionMs(data.qrExpirationMinutes * 60 * 1000)
        }
      })
      .catch(() => {})
  }, [token])

  // Load already uploaded videos for this token
  useEffect(() => {
    if (!valid) return
    fetch(`${API_BASE}/mobile-upload/token/${token}/videos`)
      .then(res => res.ok ? res.json() : [])
      .then((data: Array<{ id: string; name: string; size: number }>) => {
        setUploadedVideos(data.map(v => ({ id: v.id, name: v.name, size: v.size })))
      })
      .catch(() => {})
  }, [token, valid])

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now()
      if (remaining <= 0) {
        setTimeLeft('Expired')
        setSessionPercent(0)
        setValid(false)
      } else {
        const mins = Math.floor(remaining / 60000)
        const secs = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`)
        if (totalSessionMs > 0) {
          setSessionPercent(Math.max(0, Math.min(100, (remaining / totalSessionMs) * 100)))
        }
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt, totalSessionMs])

  const processFile = useCallback(async (file: File, slotIndex: number) => {
    if (!file.type.startsWith('video/')) return

    if (file.size > limits.maxFileSizeBytes) {
      setActiveUpload({ slotIndex, file, progress: 0, status: 'error', error: `Dépasse la limite de ${limits.maxFileSizeBytes / (1024 * 1024)} Mo` })
      return
    }

    setActiveUpload({ slotIndex, file, progress: 0, status: 'uploading' })

    try {
      const { formatted: duration, totalSeconds } = await getVideoDuration(file)

      if (totalSeconds > limits.maxDurationSeconds) {
        setActiveUpload(prev => prev ? { ...prev, status: 'error', error: `Dépasse la limite de ${limits.maxDurationSeconds}s` } : null)
        return
      }

      const createRes = await fetch(`${API_BASE}/mobile-upload/token/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, duration }),
      })

      if (!createRes.ok) {
        let msg = 'Envoi rejeté'
        try { const errJson = await createRes.json(); if (errJson.message) msg = errJson.message } catch { /* */ }
        throw new Error(msg)
      }

      const { videoId, uploadUrl } = await createRes.json()

      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setActiveUpload(prev => prev ? { ...prev, progress: (e.loaded / e.total) * 100 } : null)
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setActiveUpload(prev => prev ? { ...prev, progress: 100, status: 'complete' } : null)
          setUploadedVideos(prev => [...prev, { id: videoId, name: file.name, size: file.size }])
          setTimeout(() => setActiveUpload(null), 1200)
        } else {
          setActiveUpload(prev => prev ? { ...prev, status: 'error', error: `Failed (${xhr.status})` } : null)
        }
      }

      xhr.onerror = () => {
        setActiveUpload(prev => prev ? { ...prev, status: 'error', error: 'Erreur réseau' } : null)
      }

      xhr.send(file)
    } catch (err) {
      setActiveUpload(prev => prev ? {
        ...prev, status: 'error',
        error: err instanceof Error ? err.message : 'Échec de l\'envoi',
      } : null)
    }
  }, [token, limits])

  const handleSlotClick = useCallback((slotIndex: number) => {
    if (activeUpload) return
    // Store which slot was clicked so processFile knows
    fileInputRef.current?.click()
    // Save slot index for when file is selected
    fileInputRef.current!.dataset.slot = String(slotIndex)
  }, [activeUpload])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const slotIndex = parseInt(e.target.dataset.slot || '0')
    if (file) processFile(file, slotIndex)
    e.target.value = ''
  }, [processFile])

  if (valid === null) {
    return (
      <div className="m-page">
        <div className="m-center">
          <Loader2 size={28} className="spinner" />
          <p className="m-center-text">Vérification du lien...</p>
        </div>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="m-page">
        <div className="m-center">
          <div className="m-expired-icon">
            <AlertCircle size={28} />
          </div>
          <h2 className="m-center-title">Lien expiré</h2>
          <p className="m-center-text">Scannez un nouveau QR code depuis votre ordinateur pour envoyer.</p>
        </div>
      </div>
    )
  }

  // All done — show confirmation screen
  if (uploadedVideos.length >= maxVideos && !activeUpload) {
    return (
      <div className="m-page">
        <div className="m-nav">
          <div className="m-nav-left">
            <Film size={16} />
            <span>Plateforme Vidéo</span>
          </div>
          <div className="m-nav-user">
            <User size={12} />
            <span>{displayName}</span>
          </div>
        </div>

        <div className="m-center">
          <div className="m-done-icon">
            <CheckCircle size={36} />
          </div>
          <h2 className="m-center-title">Toutes les vidéos envoyées !</h2>
          <p className="m-center-text">
            {uploadedVideos.length} vidéo{uploadedVideos.length > 1 ? 's' : ''} envoyée{uploadedVideos.length > 1 ? 's' : ''} dans la bibliothèque de {displayName}.
          </p>
          <p className="m-center-text m-center-text-hint">
            Vous pouvez retourner sur votre ordinateur pour les consulter et les envoyer dans le chat.
          </p>
          <div className="m-done-badge">
            <Film size={13} />
            {uploadedVideos.length} / {maxVideos} vidéos
          </div>
        </div>

        {timeLeft && timeLeft !== 'Expired' && (
          <div className="m-footer">
            <Clock size={12} />
            <span>La session expire dans {timeLeft}</span>
          </div>
        )}
      </div>
    )
  }

  // Build slot cards
  const slots = []
  for (let i = 0; i < maxVideos; i++) {
    const uploaded = uploadedVideos[i]
    const isActiveSlot = activeUpload && activeUpload.slotIndex === i
    const isUploading = isActiveSlot && activeUpload

    if (uploaded) {
      // Filled slot — completed video
      slots.push(
        <div key={`slot-${i}`} className="m-slot m-slot-done">
          <div className="m-slot-icon m-slot-icon-done">
            <CheckCircle size={18} />
          </div>
          <div className="m-slot-name">{uploaded.name}</div>
          <div className="m-slot-size">{formatFileSize(uploaded.size)}</div>
        </div>
      )
    } else if (isUploading) {
      // Active upload in this slot
      slots.push(
        <div key={`slot-${i}`} className="m-slot m-slot-uploading">
          <div className="m-slot-icon m-slot-icon-uploading">
            {activeUpload!.status === 'error' ? (
              <AlertCircle size={18} />
            ) : activeUpload!.status === 'complete' ? (
              <CheckCircle size={18} />
            ) : (
              <Loader2 size={18} className="spinner" />
            )}
          </div>
          <div className="m-slot-name">{activeUpload!.file.name}</div>
          {activeUpload!.status === 'uploading' && (
            <div className="m-slot-progress">
              <div className="m-slot-bar-bg">
                <div className="m-slot-bar" style={{ width: `${activeUpload!.progress}%` }} />
              </div>
              <span className="m-slot-percent">{Math.round(activeUpload!.progress)}%</span>
            </div>
          )}
          {activeUpload!.status === 'complete' && (
            <div className="m-slot-size">{formatFileSize(activeUpload!.file.size)}</div>
          )}
          {activeUpload!.status === 'error' && (
            <>
              <div className="m-slot-error">{activeUpload!.error}</div>
              <button className="m-slot-retry" onClick={() => setActiveUpload(null)}>Réessayer</button>
            </>
          )}
        </div>
      )
    } else {
      // Empty slot — add video button
      slots.push(
        <button
          key={`slot-${i}`}
          className="m-slot m-slot-empty"
          onClick={() => handleSlotClick(i)}
          disabled={!!activeUpload}
        >
          <div className="m-slot-icon m-slot-icon-add">
            <Plus size={22} />
          </div>
          <div className="m-slot-add-label">Ajouter une vidéo</div>
          <div className="m-slot-add-hint">Emplacement {i + 1}</div>
        </button>
      )
    }
  }

  return (
    <div className="m-page">
      <div className="m-nav">
        <div className="m-nav-left">
          <Film size={16} />
          <span>Plateforme Vidéo</span>
        </div>
        <div className="m-nav-user">
          <User size={12} />
          <span>{displayName}</span>
        </div>
      </div>

      <div className="m-body">
        <div className="m-content">
          <div className="m-hero-icon">
            <Upload size={20} />
          </div>
          <h1 className="m-title">Envoyer des vidéos</h1>
          <p className="m-hint">
            {maxVideos} vidéo{maxVideos > 1 ? 's' : ''} max — {limits.maxFileSizeBytes / (1024 * 1024)} Mo, {limits.maxDurationSeconds}s chacune
          </p>

          {/* Session timer progress */}
          <div className="m-session">
            <div className="m-session-header">
              <span className="m-session-label">
                <Clock size={11} />
                Session — {timeLeft || '—'}
              </span>
              <span className="m-session-count">{uploadedVideos.length} / {maxVideos} vidéos</span>
            </div>
            <div className="m-session-bar-bg">
              <div
                className={`m-session-bar${sessionPercent < 20 ? ' m-session-bar-low' : ''}`}
                style={{ width: `${sessionPercent}%` }}
              />
            </div>
          </div>

          {/* Slot grid */}
          <div className="m-grid">
            {slots}
          </div>

          {uploadedVideos.length >= maxVideos && (
            <div className="m-max-reached">
              <CheckCircle size={14} />
              Toutes les vidéos envoyées
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            hidden
          />
        </div>
      </div>

      {timeLeft && timeLeft !== 'Expired' && (
        <div className="m-footer">
          <Clock size={12} />
          <span>La session expire dans {timeLeft}</span>
        </div>
      )}
    </div>
  )
}
