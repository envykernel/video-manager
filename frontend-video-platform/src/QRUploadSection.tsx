import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Smartphone, RefreshCw, CheckCircle, Loader2, ExternalLink, Clock } from 'lucide-react'
import './QRUploadSection.css'

const API_BASE = '/api'

interface TokenData {
  token: string
  mobileUrl: string
  expiresAt: string
}

export default function QRUploadSection({ onNewUpload, token }: { onNewUpload: () => void; token: string }) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expired, setExpired] = useState(false)
  const [uploadCount, setUploadCount] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevCountRef = useRef(0)

  const generateToken = async () => {
    setLoading(true)
    setExpired(false)
    setUploadCount(0)
    prevCountRef.current = 0
    try {
      const res = await fetch(`${API_BASE}/mobile-upload/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTokenData(data)
      }
    } catch (err) {
      console.error('Failed to generate token:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    generateToken()
  }, [])

  useEffect(() => {
    if (!tokenData || expired) return

    const checkUploads = async () => {
      try {
        const res = await fetch(`${API_BASE}/mobile-upload/token/${tokenData.token}/videos`)
        if (res.ok) {
          const videos = await res.json()
          setUploadCount(videos.length)
          if (videos.length > prevCountRef.current) {
            prevCountRef.current = videos.length
            onNewUpload()
          }
        }
      } catch { /* ignore */ }
    }

    pollRef.current = setInterval(checkUploads, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [tokenData, onNewUpload, expired])

  const [timeLeft, setTimeLeft] = useState('')
  useEffect(() => {
    if (!tokenData) return
    const tick = () => {
      const remaining = new Date(tokenData.expiresAt).getTime() - Date.now()
      if (remaining <= 0) {
        setTimeLeft('Expired')
        setExpired(true)
        generateToken()
      } else {
        const mins = Math.floor(remaining / 60000)
        const secs = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tokenData])

  return (
    <div className="qr-section">
      <div className="qr-header">
        <Smartphone size={20} />
        <h3>Envoyer depuis le téléphone</h3>
      </div>

      {loading ? (
        <div className="qr-generate">
          <Loader2 size={24} className="spinner" />
          <p>Génération du QR code...</p>
        </div>
      ) : expired ? (
        <div className="qr-expired">
          <div className="qr-expired-icon">
            <Clock size={28} />
          </div>
          <p className="qr-expired-text">Session QR expirée</p>
          <button className="qr-refresh-btn" onClick={generateToken}>
            <RefreshCw size={14} />
            Nouveau QR Code
          </button>
        </div>
      ) : tokenData ? (
        <div className="qr-active">
          <div className="qr-code-wrapper">
            <QRCodeSVG value={tokenData.mobileUrl} size={150} level="M" />
          </div>
          <p className="qr-instruction">Scannez avec l'appareil photo de votre téléphone</p>
          <div className="qr-timer">Expire dans {timeLeft}</div>

          {uploadCount > 0 && (
            <div className="qr-upload-count">
              <CheckCircle size={14} />
              {uploadCount} vidéo{uploadCount > 1 ? 's' : ''} reçue{uploadCount > 1 ? 's' : ''}
            </div>
          )}

          <div className="qr-buttons">
            <a
              className="qr-test-btn"
              href={`/mobile-upload/${tokenData.token}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} />
              Tester dans le navigateur
            </a>
            <button className="qr-refresh-btn" onClick={generateToken}>
              <RefreshCw size={14} />
              Nouveau QR Code
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
