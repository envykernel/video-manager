import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Video, FileText, LogOut, User, Upload, MessageSquare,
  Mic, CloudUpload, Loader2, AlertCircle, CheckCircle2,
  RotateCcw, Copy, Square,
} from 'lucide-react'
import './ClarityPage.css'

const API_BASE = '/api'

interface UserInfo { userId: string; username: string; displayName: string }
interface ClarityPageProps { token: string; user: UserInfo; onLogout: () => void }

interface ClarityQuestion { index: number; question: string }
interface ClarityAnswer { index: number; answer: string }

type Phase = 'record' | 'transcribing' | 'questions' | 'reformulating' | 'result'

export default function ClarityPage({ token, user, onLogout }: ClarityPageProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('record')
  const [file, setFile] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const [sessionId, setSessionId] = useState('')
  const [transcription, setTranscription] = useState('')
  const [questions, setQuestions] = useState<ClarityQuestion[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [reformulated, setReformulated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [, setDragging] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const submittingRef = useRef(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const auth = { Authorization: `Bearer ${token}` }

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const f = new File([blob], 'recording.webm', { type: 'audio/webm' })
        setFile(f)
        setRecording(false)
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setRecordTime(0)
      timerRef.current = setInterval(() => setRecordTime(t => {
        if (t + 1 >= 60) {
          if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
          return 60
        }
        return t + 1
      }), 1000)
    } catch {
      setError('Accès au microphone refusé.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }

  const handleFileSelect = (f: File) => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    const allowed = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.mp4', '.flac']
    if (!allowed.includes(ext)) { setError(`"${ext}" non supporté.`); return }
    if (f.size > 25 * 1024 * 1024) { setError('Max 25 Mo.'); return }
    setFile(f); setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0])
  }

  const handleTranscribe = async (audioFile: File) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setPhase('transcribing'); setError(null); setProgressMsg('Envoi de l\'audio...')
    const fd = new FormData(); fd.append('file', audioFile)
    try {
      setProgressMsg('Transcription de votre voix...')
      const res = await fetch(`${API_BASE}/clarity/transcribe`, { method: 'POST', headers: auth, body: fd })
      setProgressMsg('Analyse de votre problème...')
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Failed'); setPhase('record'); return }
      setSessionId(data.sessionId)
      setTranscription(data.transcription)
      setQuestions(data.questions)
      setAnswers({})
      setPhase('questions')
    } catch {
      setError('Serveur inaccessible.'); setPhase('record')
    } finally {
      submittingRef.current = false
    }
  }

  // Auto-start transcription when file is ready
  useEffect(() => {
    if (file && phase === 'record' && !recording) {
      handleTranscribe(file)
    }
  }, [file])

  const handleReformulate = async () => {
    setPhase('reformulating'); setError(null)
    const answerList: ClarityAnswer[] = questions.map(q => ({
      index: q.index,
      answer: answers[q.index] || "Je ne sais pas"
    }))
    try {
      const res = await fetch(`${API_BASE}/clarity/reformulate`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, answers: answerList })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Failed'); setPhase('questions'); return }
      setReformulated(data.reformulatedMessage)
      setPhase('result')
    } catch {
      setError('Serveur inaccessible.'); setPhase('questions')
    }
  }

  const handleReset = () => {
    setPhase('record'); setFile(null); setSessionId(''); setTranscription('')
    setQuestions([]); setAnswers({}); setReformulated(''); setError(null); setCopied(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const allAnswered = questions.length > 0 && questions.every(q => answers[q.index])

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-content">
          <div className="nav-brand"><Video size={24} /><span>Plateforme Vidéo</span><span className="app-version">v{__APP_VERSION__}</span></div>
          <div className="nav-tabs">
            <button className="nav-tab" onClick={() => navigate('/')}><Upload size={16} /><span>Envoi</span></button>
            <button className="nav-tab" onClick={() => navigate('/chat')}><MessageSquare size={16} /><span>Envoi Chat</span></button>
            <button className="nav-tab" onClick={() => navigate('/transcription')}><FileText size={16} /><span>Transcription</span></button>
            <button className="nav-tab active"><Mic size={16} /><span>Copilote Client</span></button>
          </div>
          <div className="nav-right">
            <div className="nav-user"><User size={16} /><span>{user.displayName}</span></div>
            <button className="logout-btn" onClick={onLogout} title="Déconnexion"><LogOut size={18} /><span>Déconnexion</span></button>
          </div>
        </div>
      </nav>

      <main className="cl-main">
        <div className="cl-container">
          {/* Header */}
          <div className="cl-header">
            <h1 className="cl-title">Copilote Client</h1>
            <p className="cl-subtitle">Décrivez votre problème à la voix — l'IA vous aidera à rédiger un message clair et complet</p>
          </div>

          {/* Step indicator */}
          <div className="cl-steps">
            {['Enregistrer', 'Clarifier', 'Résultat'].map((label, i) => {
              const phaseIdx = phase === 'record' || phase === 'transcribing' ? 0 : phase === 'questions' || phase === 'reformulating' ? 1 : 2
              return (
                <div key={label} className={`cl-step-dot${i < phaseIdx ? ' done' : ''}${i === phaseIdx ? ' active' : ''}`}>
                  <div className="cl-dot">{i < phaseIdx ? <CheckCircle2 size={14} /> : i + 1}</div>
                  <span>{label}</span>
                </div>
              )
            })}
          </div>

          {/* ── Phase 1: Record / Upload ── */}
          {(phase === 'record' || phase === 'transcribing') && (
            <div className="cl-input-section">
              <div className="cl-input-card">
                <div className="cl-input-tabs">
                  <button className={`cl-input-tab${!file || recording ? ' active' : ''}`}
                    onClick={() => { if (!recording && !file) { /* already on record */ } else if (file && !recording) setFile(null) }}>
                    <Mic size={15} /> Enregistrer
                  </button>
                  <button className={`cl-input-tab${file && !recording ? ' active' : ''}`}
                    onClick={() => { if (recording) stopRecording(); if (!file) fileInputRef.current?.click() }}>
                    <CloudUpload size={15} /> Importer un fichier
                  </button>
                </div>

                <div className="cl-input-body">
                  {phase === 'transcribing' ? (
                    <div className="cl-progress">
                      <div className="cl-progress-visual">
                        <div className="cl-progress-orbit">
                          <div className="cl-progress-dot" />
                        </div>
                        <Mic size={20} className="cl-progress-icon" />
                      </div>
                      <div className="cl-progress-info">
                        <span className="cl-progress-msg">{progressMsg}</span>
                        <span className="cl-progress-file">{file?.name}</span>
                      </div>
                    </div>
                  ) : recording ? (
                    <div className="cl-rec-active">
                      <div className="cl-rec-indicator">
                        <div className="cl-rec-ring" />
                        <Mic size={20} />
                      </div>
                      <div className="cl-rec-info">
                        <div className="cl-rec-top">
                          <span className="cl-rec-time">{fmtTime(recordTime)}</span>
                          <span className="cl-rec-remaining">{fmtTime(60 - recordTime)}</span>
                        </div>
                        <div className="cl-rec-bar-bg">
                          <div className="cl-rec-bar" style={{ width: `${(recordTime / 60) * 100}%` }} />
                        </div>
                        <span className="cl-rec-status">Enregistrement... {recordTime >= 50 ? `${60 - recordTime}s restantes` : ''}</span>
                      </div>
                      <button className="cl-rec-stop" onClick={stopRecording}>
                        <Square size={14} fill="currentColor" /> Stop
                      </button>
                    </div>
                  ) : (
                    <div className="cl-input-empty"
                      onDragOver={e => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                    >
                      <button className="cl-mic-btn" onClick={startRecording} disabled={phase !== 'record'}>
                        <Mic size={22} />
                      </button>
                      <span className="cl-input-hint">Appuyez pour enregistrer ou déposez un fichier audio ici</span>
                      <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.webm,.mp4,.flac"
                        onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} hidden />
                    </div>
                  )}
                </div>
              </div>

              {error && <div className="cl-error"><AlertCircle size={14} /> {error}</div>}
            </div>
          )}

          {/* ── Phase 2: Questions ── */}
          {(phase === 'questions' || phase === 'reformulating') && (
            <div className="cl-questions-section">
              <div className="cl-transcript-box">
                <span className="cl-transcript-label">Description de votre problème</span>
                <p className="cl-transcript-text">"{transcription}"</p>
              </div>

              <div className="cl-qa">
                {questions.map(q => (
                  <div key={q.index} className="cl-question-card">
                    <p className="cl-q-text">{q.question}</p>
                    <div className="cl-q-options">
                      {['Oui', 'Non', "Je ne sais pas"].map(opt => (
                        <button
                          key={opt}
                          className={`cl-q-btn${answers[q.index] === opt ? ' selected' : ''}`}
                          onClick={() => setAnswers(prev => ({ ...prev, [q.index]: opt }))}
                          disabled={phase === 'reformulating'}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button className="cl-submit" onClick={handleReformulate}
                disabled={!allAnswered || phase === 'reformulating'}>
                {phase === 'reformulating' ? (
                  <><Loader2 size={16} className="spinner" /> Reformulation...</>
                ) : (
                  <><CheckCircle2 size={16} /> Générer mon message</>
                )}
              </button>

              {error && <div className="cl-error"><AlertCircle size={14} /> {error}</div>}
            </div>
          )}

          {/* ── Phase 3: Result ── */}
          {phase === 'result' && (
            <div className="cl-result-section">
              <div className="cl-result-original">
                <span className="cl-result-label">Message original</span>
                <p>"{transcription}"</p>
              </div>

              <div className="cl-result-box">
                <span className="cl-result-label">Votre message — prêt à envoyer</span>
                <p className="cl-result-text">{reformulated}</p>
                <button className="cl-copy" onClick={() => { navigator.clipboard.writeText(reformulated); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                  {copied ? <><CheckCircle2 size={14} /> Copié</> : <><Copy size={14} /> Copier</>}
                </button>
              </div>

              <button className="cl-restart" onClick={handleReset}>
                <RotateCcw size={16} /> Recommencer
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
