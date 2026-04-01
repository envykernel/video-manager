import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, Play, X, Film, Clock, HardDrive, CloudUpload, Video,
  Trash2, RefreshCw, AlertCircle, Loader2, LogOut, User, Settings,
  ShieldAlert, CheckCircle2,
} from 'lucide-react'
import MuxPlayer from '@mux/mux-player-react'
import QRUploadSection from './QRUploadSection'
import './App.css'

const API_BASE = '/api'

interface UserInfo {
  userId: string
  username: string
  displayName: string
}

interface AppProps {
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

interface UploadState {
  file: File
  progress: number
  status: 'uploading' | 'processing' | 'complete' | 'error'
  videoId?: string
  error?: string
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(1) + ' GB'
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB'
  return (bytes / 1_000).toFixed(1) + ' KB'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
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

function statusLabel(status: string) {
  switch (status) {
    case 'waiting_for_upload': return 'Waiting'
    case 'processing': return 'Processing'
    case 'ready': return 'Ready'
    case 'errored': return 'Error'
    default: return status
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'ready': return 'status-ready'
    case 'processing':
    case 'waiting_for_upload': return 'status-processing'
    case 'errored': return 'status-error'
    default: return ''
  }
}

interface UploadLimits {
  maxFileSizeBytes: number
  maxDurationSeconds: number
  qrExpirationMinutes: number
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface FileRejection {
  fileName: string
  fileSize: number
  reason: string
}

function App({ token, user, onLogout }: AppProps) {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [limits, setLimits] = useState<UploadLimits>({ maxFileSizeBytes: 5 * 1024 * 1024, maxDurationSeconds: 60, qrExpirationMinutes: 30 })
  const [showSettings, setShowSettings] = useState(false)
  const [editSizeMB, setEditSizeMB] = useState('5')
  const [editDurationSec, setEditDurationSec] = useState('60')
  const [editQrExpMin, setEditQrExpMin] = useState('30')
  const [savingSettings, setSavingSettings] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [rejection, setRejection] = useState<FileRejection | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  }

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/videos`, { headers: authHeaders })
      if (res.status === 401) { onLogout(); return }
      if (res.ok) {
        const data = await res.json()
        setVideos(data)
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  const fetchLimits = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/upload-limits`)
      if (res.ok) {
        const data: UploadLimits = await res.json()
        setLimits(data)
        setEditSizeMB(String(data.maxFileSizeBytes / (1024 * 1024)))
        setEditDurationSec(String(data.maxDurationSeconds))
        setEditQrExpMin(String(data.qrExpirationMinutes))
      }
    } catch (err) {
      console.error('Failed to fetch upload limits:', err)
    }
  }, [])

  const saveLimits = useCallback(async () => {
    const sizeMB = parseFloat(editSizeMB)
    const durationSec = parseInt(editDurationSec)
    const qrExpMin = parseInt(editQrExpMin)
    if (isNaN(sizeMB) || sizeMB <= 0 || isNaN(durationSec) || durationSec <= 0 || isNaN(qrExpMin) || qrExpMin <= 0) return

    setSavingSettings(true)
    try {
      const res = await fetch(`${API_BASE}/settings/upload-limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          maxFileSizeBytes: Math.round(sizeMB * 1024 * 1024),
          maxDurationSeconds: durationSec,
          qrExpirationMinutes: qrExpMin,
        }),
      })
      if (res.ok) {
        const data: UploadLimits = await res.json()
        setLimits(data)
        setEditSizeMB(String(data.maxFileSizeBytes / (1024 * 1024)))
        setEditDurationSec(String(data.maxDurationSeconds))
        setEditQrExpMin(String(data.qrExpirationMinutes))
        addToast('success', `Limits updated — ${data.maxFileSizeBytes / (1024 * 1024)} MB, ${data.maxDurationSeconds}s, QR ${data.qrExpirationMinutes}min`)
      } else {
        addToast('error', 'Failed to save settings')
      }
    } catch (err) {
      console.error('Failed to save upload limits:', err)
      addToast('error', 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }, [editSizeMB, editDurationSec, editQrExpMin, token])

  useEffect(() => {
    fetchVideos()
    fetchLimits()
  }, [fetchVideos, fetchLimits])

  useEffect(() => {
    const hasProcessing = videos.some(
      v => v.status === 'processing' || v.status === 'waiting_for_upload'
    )
    if (hasProcessing) {
      pollRef.current = setInterval(fetchVideos, 5000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [videos, fetchVideos])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) return
    setRejection(null)

    if (file.size > limits.maxFileSizeBytes) {
      setRejection({
        fileName: file.name,
        fileSize: file.size,
        reason: `File is ${formatFileSize(file.size)} — exceeds the ${limits.maxFileSizeBytes / (1024 * 1024)} MB limit`,
      })
      return
    }

    setUpload({ file, progress: 0, status: 'uploading' })

    try {
      const { formatted: duration, totalSeconds } = await getVideoDuration(file)

      if (totalSeconds > limits.maxDurationSeconds) {
        setUpload(null)
        setRejection({
          fileName: file.name,
          fileSize: file.size,
          reason: `Video is ${totalSeconds}s long — exceeds the ${limits.maxDurationSeconds} second limit`,
        })
        return
      }

      const createRes = await fetch(`${API_BASE}/videos/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          duration,
        }),
      })

      if (!createRes.ok) {
        if (createRes.status === 401) { onLogout(); return }
        let msg = 'Upload rejected by server'
        try {
          const errJson = await createRes.json()
          if (errJson.message) msg = errJson.message
        } catch { /* non-JSON response */ }
        throw new Error(msg)
      }

      const { videoId, uploadUrl } = await createRes.json()

      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100
          setUpload(prev => prev ? { ...prev, progress } : null)
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUpload(prev => prev ? {
            ...prev, progress: 100, status: 'processing', videoId,
          } : null)
          fetchVideos()
          setTimeout(() => setUpload(null), 3000)
        } else {
          setUpload(prev => prev ? {
            ...prev, status: 'error', error: `Upload failed (${xhr.status})`,
          } : null)
        }
      }

      xhr.onerror = () => {
        setUpload(prev => prev ? {
          ...prev, status: 'error', error: 'Network error during upload',
        } : null)
      }

      xhr.send(file)

    } catch (err) {
      setUpload(prev => prev ? {
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      } : null)
    }
  }, [fetchVideos, token, limits])

  const deleteVideo = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/videos/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      if (res.ok) {
        setVideos(prev => prev.filter(v => v.id !== id))
        if (playingVideo?.id === id) setPlayingVideo(null)
      }
    } catch (err) {
      console.error('Failed to delete video:', err)
    }
  }, [playingVideo, token])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }, [processFile])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingVideo(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-content">
          <div className="nav-brand">
            <Video size={24} />
            <span>Video Platform</span>
          </div>
          <div className="nav-right">
            <div className="nav-user">
              <User size={16} />
              <span>{user.displayName}</span>
            </div>
            <button className="refresh-btn" onClick={fetchVideos} title="Refresh">
              <RefreshCw size={18} />
            </button>
            <button
              className={`refresh-btn${showSettings ? ' active' : ''}`}
              onClick={() => setShowSettings(s => !s)}
              title="Upload limits"
            >
              <Settings size={18} />
            </button>
            <button className="logout-btn" onClick={onLogout} title="Sign out">
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">
        {/* Upload Section */}
        <section className="upload-section">
          <h1 className="section-title">Upload Video</h1>
          <p className="section-subtitle">
            Drag and drop a file or scan the QR code to upload from your phone
          </p>

          {showSettings && (
            <div className="settings-bar">
              <Settings size={15} className="settings-bar-icon" />
              <span className="settings-bar-label">Limits</span>
              <div className="settings-bar-group">
                <span className="settings-bar-hint">Size</span>
                <div className="settings-input-wrap">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editSizeMB}
                    onChange={e => setEditSizeMB(e.target.value)}
                  />
                  <span className="settings-input-unit">MB</span>
                </div>
              </div>
              <div className="settings-bar-divider" />
              <div className="settings-bar-group">
                <span className="settings-bar-hint">Duration</span>
                <div className="settings-input-wrap">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editDurationSec}
                    onChange={e => setEditDurationSec(e.target.value)}
                  />
                  <span className="settings-input-unit">sec</span>
                </div>
              </div>
              <div className="settings-bar-divider" />
              <div className="settings-bar-group">
                <span className="settings-bar-hint">QR link</span>
                <div className="settings-input-wrap">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editQrExpMin}
                    onChange={e => setEditQrExpMin(e.target.value)}
                  />
                  <span className="settings-input-unit">min</span>
                </div>
              </div>
              <button
                className="settings-bar-save"
                onClick={saveLimits}
                disabled={savingSettings}
              >
                {savingSettings ? 'Saving...' : 'Apply'}
              </button>
            </div>
          )}

          <div className="upload-row">
            <div
              className={`upload-zone${dragging ? ' dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon">
                <CloudUpload size={24} />
              </div>
              <h3>Drop your video here</h3>
              <p>or click to browse</p>
              <button
                className="upload-btn"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              >
                <Upload size={16} />
                Choose File
              </button>
              <div className="upload-formats">
                MP4, MOV, AVI, WebM, MKV — Max {limits.maxFileSizeBytes / (1024 * 1024)} MB, {limits.maxDurationSeconds}s
              </div>
            </div>

            <QRUploadSection onNewUpload={fetchVideos} token={token} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            hidden
          />

          {/* File Rejection Banner */}
          {rejection && (
            <div className="rejection-card">
              <div className="rejection-icon-wrap">
                <ShieldAlert size={22} />
              </div>
              <div className="rejection-body">
                <div className="rejection-title">Upload blocked</div>
                <div className="rejection-reason">{rejection.reason}</div>
                <div className="rejection-file">
                  <Film size={13} />
                  <span>{rejection.fileName}</span>
                  <span className="rejection-dot" />
                  <span>{formatFileSize(rejection.fileSize)}</span>
                </div>
              </div>
              <button className="rejection-dismiss" onClick={() => setRejection(null)}>
                <X size={16} />
              </button>
            </div>
          )}

          {/* Upload Progress */}
          {upload && (
            <div className="upload-progress-card">
              <div className="upload-progress-header">
                <div className="upload-file-info">
                  <div className="upload-file-icon">
                    <Film size={20} />
                  </div>
                  <div>
                    <div className="upload-file-name">{upload.file.name}</div>
                    <div className="upload-file-size">
                      {formatFileSize(upload.file.size)}
                      {upload.status === 'processing' && ' — Processing on Mux...'}
                      {upload.status === 'error' && ` — ${upload.error}`}
                    </div>
                  </div>
                </div>
                <button
                  className="upload-cancel-btn"
                  onClick={() => setUpload(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="upload-progress-bar-bg">
                <div
                  className={`upload-progress-bar${
                    upload.status === 'processing' ? ' complete' : ''
                  }${upload.status === 'error' ? ' error' : ''}`}
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
              <div className="upload-progress-text">
                <span>
                  {upload.status === 'uploading' && 'Uploading to Mux...'}
                  {upload.status === 'processing' && 'Upload complete — Mux is processing'}
                  {upload.status === 'error' && 'Upload failed'}
                </span>
                <span>{Math.round(upload.progress)}%</span>
              </div>
            </div>
          )}
        </section>

        {/* Video Library */}
        <section className="video-section">
          <div className="video-section-header">
            <h1 className="section-title">Library</h1>
            <span className="video-count">
              {videos.length} video{videos.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="empty-state">
              <Loader2 size={32} className="spinner" />
              <h3>Loading videos...</h3>
            </div>
          ) : videos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Film size={32} />
              </div>
              <h3>No videos yet</h3>
              <p>Upload your first video to get started</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map((video) => (
                <div key={video.id} className="video-card">
                  <div className="video-thumbnail">
                    {video.status === 'ready' && video.playbackId ? (
                      <MuxPlayer
                        playbackId={video.playbackId}
                        metadata={{ video_title: video.name }}
                        thumbnailTime={1}
                        style={{ width: '100%', height: '100%' }}
                        paused
                      />
                    ) : (
                      <div className="video-thumbnail-placeholder">
                        {video.status === 'processing' || video.status === 'waiting_for_upload' ? (
                          <Loader2 size={32} className="spinner" />
                        ) : (
                          <AlertCircle size={32} />
                        )}
                      </div>
                    )}
                    {video.status === 'ready' && video.playbackId && (
                      <>
                        <span className="video-duration">{video.duration}</span>
                        <div
                          className="video-play-overlay"
                          onClick={() => setPlayingVideo(video)}
                        >
                          <div className="play-button">
                            <Play size={24} fill="currentColor" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="video-info">
                    <div className="video-title" title={video.name}>
                      {video.name}
                    </div>
                    <div className="video-meta">
                      <span className={`video-status ${statusClass(video.status)}`}>
                        {statusLabel(video.status)}
                      </span>
                      <span className="video-meta-item">
                        <HardDrive size={13} />
                        {formatFileSize(video.size)}
                      </span>
                      <span className="video-meta-item">
                        <Clock size={13} />
                        {formatDate(video.createdAt)}
                      </span>
                    </div>
                    <button
                      className="delete-btn"
                      onClick={() => deleteVideo(video.id)}
                      title="Delete video"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Video Player Modal */}
      {playingVideo && playingVideo.playbackId && (
        <div className="modal-overlay" onClick={() => setPlayingVideo(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{playingVideo.name}</span>
              <button
                className="modal-close-btn"
                onClick={() => setPlayingVideo(null)}
              >
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

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
