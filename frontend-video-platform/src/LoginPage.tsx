import { useState } from 'react'
import { Video, LogIn, Loader2 } from 'lucide-react'
import './LoginPage.css'

interface LoginPageProps {
  onLogin: (token: string, user: { userId: string; username: string; displayName: string }) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message || 'Nom d\'utilisateur ou mot de passe incorrect')
        return
      }

      const data = await res.json()
      onLogin(data.token, {
        userId: data.userId,
        username: data.username,
        displayName: data.displayName,
      })
    } catch {
      setError('Erreur de connexion. Le serveur est-il en marche ?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Video size={32} />
        </div>
        <h1>Plateforme Vidéo</h1>
        <p className="login-subtitle">Connectez-vous pour gérer vos vidéos</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Nom d'utilisateur</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Entrez votre nom d'utilisateur"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Entrez votre mot de passe"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? (
              <Loader2 size={18} className="spinner" />
            ) : (
              <LogIn size={18} />
            )}
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

      </div>
    </div>
  )
}
