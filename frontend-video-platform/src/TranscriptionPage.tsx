import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Video, FileText, Loader2, LogOut, User,
  MessageSquare, AlertCircle, CheckCircle2, CloudUpload,
  Play, Plus, X, ChevronLeft, Mic,
} from 'lucide-react'
import MuxPlayer from '@mux/mux-player-react'
import './TranscriptionPage.css'

const API_BASE = '/api'

interface UserInfo { userId: string; username: string; displayName: string }
interface TranscriptionPageProps { token: string; user: UserInfo; onLogout: () => void }
interface Segment { startTime: number; endTime: number; text: string }

interface VideoData {
  id: string; name: string; size: number; playbackId: string | null; status: string; createdAt: string
  transcriptionStatus: string | null; rawTranscription: string | null; structuredTranscription: string | null
  detectedLanguage: string | null; translatedTo: string | null; segments: Segment[] | null
}

type Step = 'idle' | 'uploading' | 'mux_processing' | 'transcribing' | 'completed' | 'failed'

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(1) + ' GB'
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB'
  return (bytes / 1_000).toFixed(1) + ' KB'
}
function formatDate(d: string): string { return new Date(d).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }) }

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
const MAX_FILE_SIZE = 100 * 1024 * 1024
const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'uploading', label: 'Envoi vers le cloud', icon: '1' },
  { key: 'mux_processing', label: 'Traitement vidéo', icon: '2' },
  { key: 'transcribing', label: 'Transcription IA', icon: '3' },
  { key: 'completed', label: 'Terminé', icon: '4' },
]
function stepIdx(s: Step) { return STEPS.findIndex(x => x.key === s) }

export default function TranscriptionPage({ token, user, onLogout }: TranscriptionPageProps) {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [translateTo, setTranslateTo] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [selected, setSelected] = useState<VideoData | null>(null)
  const [history, setHistory] = useState<VideoData[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [showRaw, setShowRaw] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playerRef = useRef<HTMLElement | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const auth = { Authorization: `Bearer ${token}` }

  // ── data ──
  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/transcription`, { headers: auth })
      if (r.ok) { const d: VideoData[] = await r.json(); setHistory(d.filter(v => v.transcriptionStatus === 'completed')) }
    } catch {} finally { setLoadingHistory(false) }
  }, [token])
  useEffect(() => { fetchHistory() }, [fetchHistory])

  const stopPolling = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }, [])
  useEffect(() => () => stopPolling(), [stopPolling])

  const pollVideo = useCallback((vid: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/transcription/${vid}`, { headers: auth })
        if (!r.ok) return
        const d: VideoData = await r.json()
        if (d.transcriptionStatus === 'completed') {
          setStep('completed'); stopPolling(); fetchHistory()
          // Auto-reset the upload card after a moment
          setTimeout(() => { setStep('idle'); setUploadOpen(false); setFile(null); setError(null) }, 1500)
        }
        else if (d.transcriptionStatus === 'failed') { setStep('failed'); setError('Transcription failed.'); stopPolling() }
        else if (d.transcriptionStatus === 'transcribing') setStep('transcribing')
        else setStep(d.transcriptionStatus === 'pending' ? 'mux_processing' : 'transcribing')
      } catch {}
    }, 3000)
  }, [token, stopPolling, fetchHistory])

  // ── handlers ──
  const handleFileSelect = (f: File) => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) { setError(`"${ext}" non supporté.`); return }
    if (f.size > MAX_FILE_SIZE) { setError(`Max ${formatFileSize(MAX_FILE_SIZE)}`); return }
    setFile(f); setError(null)
  }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]) }

  const handleSubmit = async () => {
    if (!file) return; setStep('uploading'); setError(null)
    const fd = new FormData(); fd.append('file', file)
    const p = new URLSearchParams(); if (translateTo) p.set('translateTo', translateTo)
    try {
      const r = await fetch(`${API_BASE}/transcription/upload${p.toString() ? '?' + p : ''}`, { method: 'POST', headers: auth, body: fd })
      const d = await r.json(); if (!r.ok) { setError(d.message || 'Failed'); setStep('failed'); return }
      setStep('mux_processing'); pollVideo(d.videoId)
    } catch { setError('Server unreachable.'); setStep('failed') }
  }

  const selectVideo = (v: VideoData) => { stopPolling(); setSelected(v); setShowRaw(false); setCurrentTime(0) }
  const backToGallery = () => { stopPolling(); setSelected(null); setCurrentTime(0) }
  const openUploadCard = () => { setUploadOpen(true); setStep('idle'); setFile(null); setError(null); setTranslateTo('') }

  const handleTimeUpdate = () => { const el = playerRef.current as any; if (el?.currentTime != null) setCurrentTime(el.currentTime) }

  // auto-scroll segments
  useEffect(() => {
    if (!transcriptRef.current) return
    const a = transcriptRef.current.querySelector('.tp-seg.active')
    if (a) a.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentTime])

  // subtitles
  useEffect(() => {
    if (!selected?.segments?.length || !selected.playbackId) return
    const el = playerRef.current as any; if (!el) return
    const add = () => {
      const fmt = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sc = Math.floor(s%60), ms = Math.floor((s%1)*1000); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}.${String(ms).padStart(3,'0')}` }
      let vtt = 'WEBVTT\n\n'; selected.segments!.forEach((s, i) => { vtt += `${i+1}\n${fmt(s.startTime)} --> ${fmt(s.endTime)}\n${s.text}\n\n` })
      const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
      const media = el.media?.nativeEl || el.shadowRoot?.querySelector('video') || el.querySelector('video'); if (!media) return
      const ex = media.querySelector('track[data-t]'); if (ex) ex.remove()
      const t = document.createElement('track'); t.kind = 'subtitles'; t.label = selected.translatedTo || selected.detectedLanguage || 'Subtitles'
      t.srclang = selected.translatedTo || selected.detectedLanguage || 'en'; t.src = url; t.default = true; t.setAttribute('data-t','1'); media.appendChild(t)
      setTimeout(() => { for (let i = 0; i < media.textTracks.length; i++) if (media.textTracks[i].label === t.label) { media.textTracks[i].mode = 'showing'; break } }, 100)
    }
    if (el.readyState >= 1) add(); else { el.addEventListener('loadedmetadata', add, { once: true }); return () => el.removeEventListener('loadedmetadata', add) }
  }, [selected?.segments, selected?.playbackId])

  const isProcessing = step === 'uploading' || step === 'mux_processing' || step === 'transcribing'
  const uploadCardVisible = uploadOpen || isProcessing || step === 'failed' || step === 'completed'

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-content">
          <div className="nav-brand"><Video size={24} /><span>Plateforme Vidéo</span><span className="app-version">v{__APP_VERSION__}</span></div>
          <div className="nav-tabs">
            <button className="nav-tab" onClick={() => navigate('/')}><Upload size={16} /><span>Envoi</span></button>
            <button className="nav-tab" onClick={() => navigate('/chat')}><MessageSquare size={16} /><span>Envoi Chat</span></button>
            <button className="nav-tab active"><FileText size={16} /><span>Transcription</span></button>
            <button className="nav-tab" onClick={() => navigate('/clarity')}><Mic size={16} /><span>Copilote Client</span></button>
          </div>
          <div className="nav-right">
            <div className="nav-user"><User size={16} /><span>{user.displayName}</span></div>
            <button className="logout-btn" onClick={onLogout} title="Déconnexion"><LogOut size={18} /><span>Déconnexion</span></button>
          </div>
        </div>
      </nav>

      <main className="tp-main">
        {/* ══ GALLERY VIEW ══ */}
        {!selected && (
          <section className="tp-gallery">
            <h1 className="tp-title">Transcriptions</h1>

            {loadingHistory ? (
              <div className="tp-loading"><Loader2 size={24} className="spinner" /></div>
            ) : (
              <div className="tp-grid">
                {/* The + card / upload card / processing card — always first */}
                {!uploadCardVisible ? (
                  <button className="tp-add-card" onClick={openUploadCard}>
                    <Plus size={28} />
                    <span>Nouvelle transcription</span>
                  </button>
                ) : (
                  <div className={`tp-upload-card${isProcessing ? ' processing' : ''}${step === 'completed' ? ' done' : ''}`}>
                    {/* ─ Processing view ─ */}
                    {isProcessing && (
                      <div className="tp-uc-processing">
                        <div className="tp-uc-steps">
                          {STEPS.map((s, i) => {
                            const cur = stepIdx(step), done = i < cur, active = i === cur
                            return (
                              <div key={s.key} className={`tp-step${done ? ' done' : ''}${active ? ' active' : ''}`}>
                                <div className="tp-step-icon">
                                  {done ? <CheckCircle2 size={16} /> : active ? <Loader2 size={16} className="spinner" /> : <span className="tp-step-num">{s.icon}</span>}
                                </div>
                                <span className="tp-step-label">{s.label}</span>
                              </div>
                            )
                          })}
                        </div>
                        {file && <span className="tp-uc-fname">{file.name}</span>}
                      </div>
                    )}

                    {/* ─ Completed flash ─ */}
                    {step === 'completed' && (
                      <div className="tp-uc-done">
                        <CheckCircle2 size={32} />
                        <span>Done!</span>
                      </div>
                    )}

                    {/* ─ Idle / failed: upload form ─ */}
                    {(step === 'idle' || step === 'failed') && (
                      <div className="tp-uc-form">
                        <button className="tp-uc-close" onClick={() => { setUploadOpen(false); setFile(null); setError(null); setStep('idle') }}>
                          <X size={14} />
                        </button>
                        <div
                          className={`tp-uc-drop${dragging ? ' drag' : ''}${file ? ' has' : ''}`}
                          onDragOver={e => { e.preventDefault(); setDragging(true) }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={handleDrop}
                          onClick={() => !file && fileInputRef.current?.click()}
                        >
                          <input ref={fileInputRef} type="file" accept={ALLOWED_EXTENSIONS.join(',')}
                            onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} hidden />
                          {file ? (
                            <div className="tp-uc-file">
                              <Video size={14} />
                              <span>{file.name}</span>
                              <button onClick={e => { e.stopPropagation(); setFile(null) }}>&times;</button>
                            </div>
                          ) : (
                            <>
                              <CloudUpload size={20} />
                              <span>Déposez ou parcourez</span>
                            </>
                          )}
                        </div>
                        <div className="tp-uc-bottom">
                          <div className="tp-uc-langs">
                            <button className={`tp-ulang${translateTo === 'French' ? ' on' : ''}`}
                              onClick={() => setTranslateTo(translateTo === 'French' ? '' : 'French')}>{'\u{1F1EB}\u{1F1F7}'}</button>
                            <button className={`tp-ulang${translateTo === 'English' ? ' on' : ''}`}
                              onClick={() => setTranslateTo(translateTo === 'English' ? '' : 'English')}>{'\u{1F1EC}\u{1F1E7}'}</button>
                          </div>
                          <button className="tp-uc-go" disabled={!file} onClick={handleSubmit}>Transcrire</button>
                        </div>
                        {error && <span className="tp-uc-err"><AlertCircle size={12} /> {error}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Video cards */}
                {history.map(v => (
                  <button key={v.id} className="tp-card" onClick={() => selectVideo(v)}>
                    <div className="tp-card-thumb">
                      {v.playbackId ? <img src={`https://image.mux.com/${v.playbackId}/thumbnail.jpg?time=1&width=400`} alt="" /> : <Video size={24} />}
                      <div className="tp-card-hover"><Play size={22} fill="currentColor" /></div>
                    </div>
                    <div className="tp-card-body">
                      <span className="tp-card-name">{v.name}</span>
                      <div className="tp-card-meta">
                        <span>{formatDate(v.createdAt)}</span>
                        {v.translatedTo && <span className="tp-card-lang">{v.translatedTo}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ══ PLAYER VIEW ══ */}
        {selected && (
          <section className="tp-player">
            <button className="tp-back" onClick={backToGallery}><ChevronLeft size={18} /> Retour</button>
            <div className="tp-theater">
              <div className="tp-vid">
                {selected.playbackId ? (
                  <MuxPlayer ref={playerRef as any} playbackId={selected.playbackId}
                    metadata={{ video_title: selected.name }} onTimeUpdate={handleTimeUpdate}
                    style={{ width: '100%', aspectRatio: '16/9', borderRadius: '10px' }} />
                ) : (
                  <div className="tp-vid-wait"><Loader2 size={24} className="spinner" /><span>Traitement...</span></div>
                )}
                <div className="tp-vid-bar">
                  <span className="tp-vid-name">{selected.name}</span>
                  <div className="tp-vid-tags">
                    {selected.detectedLanguage && <span className="tp-tag">{selected.detectedLanguage}</span>}
                    {selected.translatedTo && <span className="tp-tag hl">{selected.translatedTo}</span>}
                  </div>
                </div>
              </div>
              <div className="tp-trans">
                <div className="tp-trans-tabs">
                  <button className={`tp-tt${!showRaw ? ' on' : ''}`} onClick={() => setShowRaw(false)}>Segments</button>
                  <button className={`tp-tt${showRaw ? ' on' : ''}`} onClick={() => setShowRaw(true)}>{selected.translatedTo ? 'Traduction' : 'Texte complet'}</button>
                </div>
                {showRaw ? (
                  <div className="tp-trans-full"><pre>{selected.structuredTranscription || selected.rawTranscription}</pre></div>
                ) : (
                  <div className="tp-trans-segs" ref={transcriptRef}>
                    {selected.segments?.length ? selected.segments.map((seg, i) => {
                      const active = currentTime >= seg.startTime && currentTime < seg.endTime
                      const past = currentTime >= seg.endTime
                      return (
                        <div key={i} className={`tp-seg${active ? ' active' : ''}${past ? ' past' : ''}`}
                          onClick={() => { const el = playerRef.current as any; if (el) { el.currentTime = seg.startTime; el.play?.() } }}>
                          <span className="tp-seg-t">{Math.floor(seg.startTime / 60)}:{String(Math.floor(seg.startTime % 60)).padStart(2, '0')}</span>
                          <span className="tp-seg-txt">{seg.text}</span>
                        </div>
                      )
                    }) : <p className="tp-trans-empty">Aucun segment disponible</p>}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
