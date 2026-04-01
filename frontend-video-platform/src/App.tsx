import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, Play, X, Film, Clock, HardDrive, CloudUpload, Video,
  Trash2, RefreshCw, AlertCircle, Loader2,
} from 'lucide-react'
import MuxPlayer from '@mux/mux-player-react'
import QRUploadSection from './QRUploadSection'
import './App.css'

const API_BASE = '/api'

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

function getVideoDuration(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      const totalSeconds = Math.floor(video.duration)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      resolve(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }
    video.onerror = () => resolve('0:00')
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

function App() {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch videos from backend
  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/videos`)
      if (res.ok) {
        const data = await res.json()
        setVideos(data)
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  // Poll for video status updates when any video is processing
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

    setUpload({ file, progress: 0, status: 'uploading' })

    try {
      const duration = await getVideoDuration(file)

      // 1. Request a direct upload URL from our backend
      const createRes = await fetch(`${API_BASE}/videos/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          duration,
        }),
      })

      if (!createRes.ok) {
        const errText = await createRes.text()
        throw new Error(`Backend error: ${errText}`)
      }

      const { videoId, uploadUrl } = await createRes.json()

      // 2. Upload the file directly to Mux using PUT
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
          // Refresh video list, then clear upload after a delay
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
  }, [fetchVideos])

  const deleteVideo = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/videos/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setVideos(prev => prev.filter(v => v.id !== id))
        if (playingVideo?.id === id) setPlayingVideo(null)
      }
    } catch (err) {
      console.error('Failed to delete video:', err)
    }
  }, [playingVideo])

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
          <button className="refresh-btn" onClick={fetchVideos} title="Refresh">
            <RefreshCw size={18} />
          </button>
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
                MP4, MOV, AVI, WebM, MKV
              </div>
            </div>

            <QRUploadSection onNewUpload={fetchVideos} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            hidden
          />

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
    </div>
  )
}

export default App
