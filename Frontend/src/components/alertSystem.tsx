import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import '../css/alert.css'

export type AlertType = 'G' | 'I' | 'W' | 'E'

type AlertItem = {
  id: number
  message: string
  type: AlertType
}

type AlertContextValue = {
  addAlert: (message: string, type?: AlertType | string, timeout?: number) => void
}

const typeTimeMap: Record<AlertType, number> = {
  G: 4000,
  I: 6000,
  W: 6000,
  E: 8000,
}

const noopAlert: AlertContextValue['addAlert'] = (message) => {
  console.warn('Alert system is not initialized yet.', message)
}

const AlertContext = createContext<AlertContextValue>({ addAlert: noopAlert })

let globalAddAlert: AlertContextValue['addAlert'] | null = null
let nextAlertId = 0

function normalizeAlertType(type: AlertType | string): AlertType {
  const normalized = type.toUpperCase() as AlertType
  return normalized in typeTimeMap ? normalized : 'I'
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const removeAlert = useCallback((id: number) => { setAlerts(currentAlerts => currentAlerts.filter(alert => alert.id !== id)) }, [])
  const addAlertInternal = useCallback<AlertContextValue['addAlert']>((message, type = 'I', timeout) => {
    const normalizedType = normalizeAlertType(type)
    const id = nextAlertId += 1
    const duration = timeout ?? typeTimeMap[normalizedType]
    setAlerts((currentAlerts) => [
      ...currentAlerts,
      { id, message, type: normalizedType },
    ])
    window.setTimeout(() => { removeAlert(id) }, duration)
  }, [removeAlert])

  useEffect(() => {
    globalAddAlert = addAlertInternal
    return () => { globalAddAlert = null }
  }, [addAlertInternal])

  return <AlertContext.Provider value={{ addAlert: addAlertInternal }}>
    <div className="alert-root" aria-atomic="true" aria-live="polite" role="status">
      {alerts.map(alert => (
        <div
          className="alert-item"
          data-type={alert.type}
          key={alert.id}
        >
          <p>{alert.message}</p>
          <button
            aria-label="Dismiss notification"
            onClick={() => removeAlert(alert.id)}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
    {children}
  </AlertContext.Provider>
}

export const useAlert = () => useContext(AlertContext)

export function addAlert(message: string, type: AlertType | string = 'I', timeout?: number) {
  if (globalAddAlert) {
    globalAddAlert(message, type, timeout)
    return
  }
  console.warn('Alert system is not initialized yet.', message)
}
