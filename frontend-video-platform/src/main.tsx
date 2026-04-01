import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'
import MobileUploadPage from './MobileUploadPage'
import LoginPage from './LoginPage'

interface UserInfo {
  userId: string
  username: string
  displayName: string
}

function Root() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'))
  const [user, setUser] = useState<UserInfo | null>(() => {
    const stored = localStorage.getItem('auth_user')
    return stored ? JSON.parse(stored) : null
  })

  // Verify token is still valid on mount
  useEffect(() => {
    if (!token) return
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      if (!res.ok) {
        // Token expired or invalid
        handleLogout()
      }
    }).catch(() => {
      // Server not reachable — keep token, will retry later
    })
  }, [token])

  const handleLogin = (newToken: string, userInfo: UserInfo) => {
    localStorage.setItem('auth_token', newToken)
    localStorage.setItem('auth_user', JSON.stringify(userInfo))
    setToken(newToken)
    setUser(userInfo)
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setToken(null)
    setUser(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            token && user ? (
              <App token={token} user={user} onLogout={handleLogout} />
            ) : (
              <LoginPage onLogin={handleLogin} />
            )
          }
        />
        <Route path="/mobile-upload/:token" element={<MobileUploadPage />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
