import { addAlert } from './alertSystem'

type ApiUrl = '/api/meals' | '/api/unordered' | '/api/history' | '/api/order' | '/api/gather' | '/api/credentials'
const server = (import.meta.env.VITE_API_SERVER ?? '')

async function parseResponse(response: Response) {
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return response.json()
  return response.text()
}

function getErrorMessage(status: number, data: unknown) {
  const responseMessage = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
    ? data.message
    : null

  if (responseMessage) return responseMessage
  if (status === 400) return 'Bad request.'
  if (status === 404) return 'Resource not found.'
  if (status === 500) return 'Server error. Please try again later.'
  return 'Request failed. Please try again.'
}

async function request<T>(url: ApiUrl, init: RequestInit = {}) {
  try {
    const response = await fetch(`${server}${url}`, init)
    const data = await parseResponse(response)
    if (!response.ok) {
      addAlert(getErrorMessage(response.status, data), 'E')
      return null
    }
    return data as T
  }
  catch (error) {
    console.error('Fetch error:', error)
    addAlert('Network error occurred. Please try again.', 'E')
    return null
  }
}

export const getFetchData = <T>(url: ApiUrl, init: RequestInit = {}) => request<T>(url, init)

export const generalFetch = <T>(url: ApiUrl, data: unknown, init: RequestInit = {}) => (
  request<T>(url, {
    ...init,
    method: init.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    },
    body: JSON.stringify(data)
  })
)
