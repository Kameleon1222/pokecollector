import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { User } from 'lucide-react'
import toast from 'react-hot-toast'
import AuthStartupScreen from '../components/AuthStartupScreen'
import { getApiErrorMessage, login, register } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'

export default function Login() {
  const [lastUser] = useState(() => localStorage.getItem('lastUser') || '')
  const [lastUserAvatar] = useState(() => localStorage.getItem('lastUserAvatar') || '')
  const [showSwitchUser, setShowSwitchUser] = useState(() => !localStorage.getItem('lastUser'))
  const [username, setUsername] = useState(() => localStorage.getItem('lastUser') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const { user, loading: authLoading, connectionError, loginUser, multiUser, retryConnection } = useAuth()
  const { t } = useSettings()
  const navigate = useNavigate()

  if (authLoading) {
    return <AuthStartupScreen connectionError={connectionError} onRetry={retryConnection} />
  }

  if (user || !multiUser) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    const submittedUsername = isRegistering ? username.trim() : username

    if (isRegistering) {
      const usernameLength = Array.from(submittedUsername).length
      if (usernameLength < 2 || usernameLength > 32 || /[\u0000-\u001f\u007f-\u009f]/u.test(submittedUsername)) {
        setFormError(t('auth.invalidUsername'))
        return
      }
      if (Array.from(password).length < 8) {
        setFormError(t('auth.invalidPassword'))
        return
      }
      if (new TextEncoder().encode(password).length > 72) {
        setFormError(t('auth.passwordTooLong'))
        return
      }
      if (password !== confirmPassword) {
        setFormError(t('auth.passwordsDoNotMatch'))
        return
      }
    }
    setLoading(true)

    try {
      const data = isRegistering
        ? await register(submittedUsername, password)
        : await login(submittedUsername, password)
      localStorage.setItem('lastUser', data.user.username)
      localStorage.setItem('lastUserAvatar', data.user.avatar_id || '')
      loginUser(data.access_token, data.user)
      if (isRegistering) toast.success(t('auth.accountCreated'))
      navigate('/')
    } catch (err) {
      if (isRegistering) {
        const code = err.response?.data?.detail?.code
        if (err.response?.status === 429) setFormError(t('auth.registrationRateLimited'))
        else if (code === 'username_taken') setFormError(t('auth.usernameTaken'))
        else if (code === 'invalid_username') setFormError(t('auth.invalidUsername'))
        else if (code === 'invalid_password') setFormError(t('auth.passwordTooLong'))
        else if (code === 'registration_unavailable') setFormError(t('auth.registrationUnavailable'))
        else setFormError(getApiErrorMessage(err, t('auth.registrationFailed')))
      } else {
        toast.error(getApiErrorMessage(err, t('auth.loginFailed')))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(227,0,11,0.18),_transparent_28%)]" />
      <div className="absolute inset-0 backdrop-blur-[2px]" />

      <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-md rounded-[2rem] border border-border bg-bg-card p-6 shadow-2xl backdrop-blur-xl sm:p-8"
          style={{ backgroundColor: 'rgba(26, 26, 46, 0.78)' }}
        >
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-muted">PokéCollector</p>
            <h1 className="mt-4 text-3xl font-semibold text-text-primary">
              {isRegistering ? t('auth.registerTitle') : lastUser && !showSwitchUser ? t('auth.welcomeBack') : t('auth.login')}
            </h1>
            <p className="mt-2 text-sm text-text-muted">
              {isRegistering ? t('auth.registerDescription') : t('auth.signInToCollection')}
            </p>
          </div>

          {isRegistering ? (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="register-username" className="mb-1 block text-xs text-text-secondary">{t('auth.username')}</label>
                <input
                  id="register-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby="register-username-hint"
                  disabled={loading}
                  autoFocus
                  required
                />
                <p id="register-username-hint" className="mt-1 text-xs text-text-muted">{t('auth.usernameHint')}</p>
              </div>

              <div>
                <label htmlFor="register-password" className="mb-1 block text-xs text-text-secondary">{t('auth.password')}</label>
                <input
                  id="register-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  autoComplete="new-password"
                  aria-describedby="register-password-hint"
                  disabled={loading}
                  required
                />
                <p id="register-password-hint" className="mt-1 text-xs text-text-muted">{t('auth.passwordHint')}</p>
              </div>

              <div>
                <label htmlFor="register-confirm-password" className="mb-1 block text-xs text-text-secondary">{t('auth.confirmPassword')}</label>
                <input
                  id="register-confirm-password"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input w-full"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
              </div>

              {formError && (
                <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">{formError}</p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('auth.registering') : t('auth.register')}
              </button>
            </form>
          ) : lastUser && !showSwitchUser ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex flex-col items-center text-center">
                <div
                  className={`flex items-center justify-center rounded-full border border-white/10 bg-bg-primary shadow-[0_20px_50px_rgba(0,0,0,0.35)] ${
                    lastUserAvatar ? 'h-28 w-28' : 'h-24 w-24'
                  }`}
                  style={{ backgroundColor: 'rgba(10, 10, 15, 0.82)' }}
                >
                  {lastUserAvatar ? (
                    <img
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${lastUserAvatar}.gif`}
                      alt={`${lastUser} avatar`}
                      className="w-16 h-16 pixelated"
                    />
                  ) : (
                    <User size={40} className="text-text-primary" />
                  )}
                </div>
                <p className="mt-4 text-xl font-semibold text-text-primary">{lastUser}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs text-text-secondary">{t('auth.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  autoFocus
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className="btn-primary w-full"
              >
                {loading ? t('auth.signingIn') : t('auth.login')}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setShowSwitchUser(true)
                  setUsername('')
                  setPassword('')
                }}
                className="mx-auto block text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                {t('auth.switchUser')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">{t('auth.username')}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-text-secondary">{t('auth.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="btn-primary w-full"
              >
                {loading ? t('auth.signingIn') : t('auth.login')}
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-border pt-5 text-center text-sm text-text-muted">
            <p>{isRegistering ? t('auth.alreadyHaveAccount') : t('auth.noAccount')}</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setIsRegistering(!isRegistering)
                setUsername(isRegistering ? lastUser : '')
                setPassword('')
                setConfirmPassword('')
                setFormError('')
              }}
              className="mt-2 font-semibold text-text-primary underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white disabled:opacity-50"
            >
              {isRegistering ? t('auth.login') : t('auth.register')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
