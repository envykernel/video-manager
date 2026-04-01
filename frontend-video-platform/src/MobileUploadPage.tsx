import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, CheckCircle, AlertCircle, Film, Loader2 } from 'lucide-react'
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

export default function MobileUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [valid, setValid] = useState<boolean | null>(null)
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [uploadCount, setUploadCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${API_BASE}/mobile-upload/token/${token}/validate`)
      .then(res => {
        setValid(res.ok)
      })
      .catch(() => setValid(false))
  }, [token])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) return

    setUpload({ file, progress: 0, status: 'uploading' })

    try {
      const duration = await getVideoDuration(file)

      const createRes = await fetch(`${API_BASE}/mobile-upload/token/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, duration }),
      })

      if (!createRes.ok) throw new Error('Failed to create upload')

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
  }, [token])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }, [processFile])

  if (valid === null) {
    return (
      <div className="mobile-page">
        <div className="mobile-center">
          <Loader2 size={32} className="spinner" />
          <p>Verifying link...</p>
        </div>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="mobile-page">
        <div className="mobile-center">
          <div className="mobile-icon error">
            <AlertCircle size={32} />
          </div>
          <h2>Link Expired</h2>
          <p>This upload link is no longer valid. Please scan a new QR code on your computer.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-page">
      <div className="mobile-header">
        <Film size={20} />
        <span>Video Platform</span>
      </div>

      <div className="mobile-content">
        <h1>Upload from Phone</h1>
        <p className="mobile-subtitle">Choose a video to upload directly from your phone</p>

        {uploadCount > 0 && !upload && (
          <div className="mobile-success-banner">
            <CheckCircle size={16} />
            {uploadCount} video{uploadCount > 1 ? 's' : ''} uploaded successfully
          </div>
        )}

        {!upload && (
          <>
            <button className="mobile-upload-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={22} />
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
          <div className="mobile-upload-card">
            <div className="mobile-file-name">{upload.file.name}</div>
            <div className="mobile-file-size">{formatFileSize(upload.file.size)}</div>

            <div className="mobile-progress-bg">
              <div
                className={`mobile-progress-bar ${upload.status === 'complete' ? 'complete' : ''} ${upload.status === 'error' ? 'error' : ''}`}
                style={{ width: `${upload.progress}%` }}
              />
            </div>

            <div className="mobile-progress-text">
              {upload.status === 'uploading' && `Uploading... ${Math.round(upload.progress)}%`}
              {upload.status === 'complete' && 'Upload complete!'}
              {upload.status === 'error' && upload.error}
            </div>

            {upload.status === 'complete' && (
              <div className="mobile-done">
                <div className="mobile-check">
                  <CheckCircle size={48} />
                </div>
                <p>Video sent to your computer</p>
                <button className="mobile-another-btn" onClick={() => setUpload(null)}>
                  Upload Another
                </button>
              </div>
            )}

            {upload.status === 'error' && (
              <button className="mobile-another-btn" onClick={() => setUpload(null)}>
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
