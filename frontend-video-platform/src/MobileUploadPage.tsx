import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, CheckCircle, AlertCircle, Film, Loader2, Clock, User } from 'lucide-react'
import './MobileUploadPage.css'

const API_BASE = '/api'

interface UploadState {
  file: File
  progress: number
  status: 'uploading' | 'processing' | 'complete' | 'error'
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
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [uploadCount, setUploadCount] = useState(0)
  const [limits, setLimits] = useState({ maxFileSizeBytes: 5 * 1024 * 1024, maxDurationSeconds: 60 })
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [timeLeft, setTimeLeft] = useState('')
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
      .then(data => { if (data) setLimits(data) })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now()
      if (remaining <= 0) {
        setTimeLeft('Expired')
        setValid(false)
      } else {
        const mins = Math.floor(remaining / 60000)
        const secs = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) return

    if (file.size > limits.maxFileSizeBytes) {
      setUpload({ file, progress: 0, status: 'error', error: `File size exceeds the ${limits.maxFileSizeBytes / (1024 * 1024)} MB limit.` })
      return
    }

    setUpload({ file, progress: 0, status: 'uploading' })

    try {
      const { formatted: duration, totalSeconds } = await getVideoDuration(file)

      if (totalSeconds > limits.maxDurationSeconds) {
        setUpload(prev => prev ? { ...prev, status: 'error', error: `Video duration exceeds the ${limits.maxDurationSeconds} second limit.` } : null)
        return
      }

      const createRes = await fetch(`${API_BASE}/mobile-upload/token/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, duration }),
      })

      if (!createRes.ok) {
        let msg = 'Upload rejected by server'
        try {
          const errJson = await createRes.json()
          if (errJson.message) msg = errJson.message
        } catch { /* non-JSON response */ }
        throw new Error(msg)
      }

      const { uploadUrl } = await createRes.json()

      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUpload(prev => prev ? { ...prev, progress: (e.loaded / e.total) * 100 } : null)
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUpload(prev => prev ? { ...prev, progress: 100, status: 'complete' } : null)
          setUploadCount(c => c + 1)
        } else {
          setUpload(prev => prev ? { ...prev, status: 'error', error: `Upload failed (${xhr.status})` } : null)
        }
      }

      xhr.onerror = () => {
        setUpload(prev => prev ? { ...prev, status: 'error', error: 'Network error' } : null)
      }

      xhr.send(file)
    } catch (err) {
      setUpload(prev => prev ? {
        ...prev, status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      } : null)
    }
  }, [token, limits])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }, [processFile])

  if (valid === null) {
    return (
      <div className="m-page">
        <div className="m-center">
          <Loader2 size={28} className="spinner" />
          <p className="m-center-text">Verifying link...</p>
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
          <h2 className="m-center-title">Link Expired</h2>
          <p className="m-center-text">Scan a new QR code from your computer to upload.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="m-page">
      <div className="m-nav">
        <div className="m-nav-left">
          <Film size={16} />
          <span>Video Platform</span>
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
          <h1 className="m-title">Upload Video</h1>
          <p className="m-hint">
            Max {limits.maxFileSizeBytes / (1024 * 1024)} MB, {limits.maxDurationSeconds}s
          </p>

          {uploadCount > 0 && !upload && (
            <div className="m-success">
              <CheckCircle size={13} />
              {uploadCount} video{uploadCount > 1 ? 's' : ''} uploaded
            </div>
          )}

          {!upload && (
            <>
              <button className="m-upload-btn" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} />
                Choose Video
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                hidden
              />
            </>
          )}

          {upload && (
            <div className="m-card">
              <div className="m-card-top">
                <div className="m-card-file-icon">
                  <Film size={14} />
                </div>
                <div className="m-card-info">
                  <div className="m-card-name">{upload.file.name}</div>
                  <div className="m-card-size">{formatFileSize(upload.file.size)}</div>
                </div>
              </div>

              <div className="m-progress-bg">
                <div
                  className={`m-progress-bar ${upload.status === 'complete' ? 'complete' : ''} ${upload.status === 'error' ? 'error' : ''}`}
                  style={{ width: `${upload.progress}%` }}
                />
              </div>

              <div className="m-progress-label">
                {upload.status === 'uploading' && `${Math.round(upload.progress)}%`}
                {upload.status === 'complete' && 'Done'}
                {upload.status === 'error' && upload.error}
              </div>

              {upload.status === 'complete' && (
                <div className="m-complete">
                  <CheckCircle size={32} className="m-complete-icon" />
                  <p>Sent to {displayName}'s library</p>
                  <button className="m-btn-secondary" onClick={() => setUpload(null)}>
                    Upload Another
                  </button>
                </div>
              )}

              {upload.status === 'error' && (
                <div style={{ textAlign: 'center' }}>
                  <button className="m-btn-secondary" onClick={() => setUpload(null)}>
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {timeLeft && timeLeft !== 'Expired' && (
        <div className="m-footer">
          <Clock size={12} />
          <span>Session expires in {timeLeft}</span>
        </div>
      )}
    </div>
  )
}
