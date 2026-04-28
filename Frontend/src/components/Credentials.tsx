import { useState, type FormEvent } from 'react'
import { addAlert } from './alertSystem'
import { generalFetch } from './fetch'

type Credentials = {
  username: string
  password: string
}

export default function Credentials({ onClose, onSaved, firstTime }: { onClose: () => void, onSaved: () => void, firstTime: boolean }) {
  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!credentials.username.trim() || !credentials.password.trim()) {
      addAlert('Please enter both username and password.', 'W')
      return
    }
    setIsSubmitting(true)
    const response = await generalFetch<{ message?: string }>('/api/credentials', credentials)
    setIsSubmitting(false)
    if (!response) return
    addAlert(response.message ?? 'Credentials saved.', 'G')
    onSaved()
    onClose()
  }

  return <div
    aria-label="Credentials"
    className="modal-overlay"
    role="dialog"
  >
    <form className="modal-card" onSubmit={handleSubmit}>
      <div className="modal-header">
        <h2>Credentials</h2>
        {!firstTime && <button
          className="modal-close"
          onClick={onClose}
          type="button"
        >
          Close
        </button>}
      </div>
      <label className="modal-field">
        <span>Username</span>
        <input
          autoComplete="username"
          onInput={event => setCredentials(currentCredentials => ({
            ...currentCredentials,
            username: event.currentTarget.value,
          }))}
          type="text"
          value={credentials.username}
        />
      </label>
      <label className="modal-field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          onInput={event => setCredentials(currentCredentials => ({
            ...currentCredentials,
            password: event.currentTarget.value,
          }))}
          type="password"
          value={credentials.password}
        />
      </label>
      <div className="modal-actions">
        <button
          className="menu-button"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  </div>
}
