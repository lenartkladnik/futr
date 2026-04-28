import { createServer } from 'node:http'

const port = Number(process.env.MOCK_API_PORT ?? 3001)
const host = process.env.MOCK_API_HOST ?? '127.0.0.1'

const store = {
  meals: [
    'Spaghetti Bolognese',
    'Chicken Curry',
    'Veggie Burrito Bowl',
    'Salmon Rice Plate',
  ],
  unordered: [
    'Margherita Pizza',
    'Beef Stir Fry',
    'Mushroom Risotto',
  ],
  history: {
    '2026-04-15': 'Thai Green Curry, Pulled Pork Sandwich, Grilled Chicken Caesar',
    '2026-04-12': 'Chicken Curry, Veggie Burrito Bowl',
    '2026-04-08': 'Salmon Rice Plate'
  },
  credentials: {
    username: '',
    password: '',
  },
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  response.end(JSON.stringify(data))
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', chunk => {
      body += chunk
    })
    request.on('end', () => {
      if (!body) {
        resolve(null)
        return
      }
      try { resolve(JSON.parse(body)) }
      catch (error) { reject(error) }
    })

    request.on('error', reject)
  })
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, null)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/meals') {
    sendJson(response, 200, store.meals)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/unordered') {
    sendJson(response, 200, store.unordered)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/history') {
    sendJson(response, 200, store.history)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/credentials') {
    sendJson(response, 200, Boolean(
      store.credentials.username.trim() &&
      store.credentials.password.trim()
    ))
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/meals') {
    try {
      const body = await readJsonBody(request)
      console.log('POST /api/meals', body)
      const meals = body?.meals
      const unordered = body?.unordered

      if (
        !Array.isArray(meals) || !meals.every(item => typeof item === 'string') ||
        !Array.isArray(unordered) || !unordered.every(item => typeof item === 'string')
      ) {
        sendJson(response, 400, { message: 'Payload must be { meals: string[], unordered: string[] }.' })
        return
      }

      store.meals = meals
      store.unordered = unordered
      const today = new Date().toISOString().slice(0, 10)
      store.history = Object.fromEntries([
        [today, meals.join(', ') || 'No meals saved'],
        ...Object.entries(store.history).filter(([date]) => date !== today),
      ].slice(0, 10))

      sendJson(response, 200, {
        message: 'Lists saved.',
        meals: store.meals,
        unordered: store.unordered,
      })
      return
    }
    catch (error) {
      console.error('POST /api/meals invalid JSON', error)
      sendJson(response, 400, { message: 'Request body must be valid JSON.' })
      return
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/credentials') {
    try {
      const body = await readJsonBody(request)
      console.log('POST /api/credentials', body)

      if (
        typeof body?.username !== 'string' || body.username.trim() === '' ||
        typeof body?.password !== 'string' || body.password.trim() === ''
      ) {
        sendJson(response, 400, { message: 'Payload must be { username: string, password: string }.' })
        return
      }

      store.credentials = {
        username: body.username,
        password: body.password,
      }

      sendJson(response, 200, {
        message: 'Credentials saved.',
      })
      return
    }
    catch (error) {
      console.error('POST /api/credentials invalid JSON', error)
      sendJson(response, 400, { message: 'Request body must be valid JSON.' })
      return
    }
  }

  sendJson(response, 404, { message: `No route for ${request.method} ${url.pathname}` })
})

server.listen(port, host, () => {
  console.log(`Mock API server listening on http://${host}:${port}`)
})
