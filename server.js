/**
 * Custom Next.js server with Socket.IO attached.
 *
 * Next's own server can't host a WebSocket layer, so this file owns the HTTP
 * server and hands normal requests to Next. Start it with `node server.js` —
 * `next start` bypasses this file and you lose realtime entirely.
 */
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')
const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

// Default to production. If a host launches `node server.js` without setting
// NODE_ENV, booting Next in dev mode would try to compile on the fly against a
// production install and fail — so dev must be opted into explicitly.
const dev = process.env.NODE_ENV === 'development'
const port = process.env.PORT || 3000
const hostname = process.env.HOSTNAME || '0.0.0.0'

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// ── Environment ──────────────────────────────────────────────────────────────
// The socket layer needs DB credentials before Next boots. Read them into a
// LOCAL object — never write to process.env. Next has its own env precedence
// (.env.local outranks .env.production) and skips vars that are already set,
// so pre-populating process.env here would silently change which
// NEXTAUTH_SECRET Next uses and invalidate every existing session.
function readEnvFiles() {
  const isProd = process.env.NODE_ENV !== 'development'
  // Match Next's own precedence: earlier files win.
  const files = isProd
    ? ['.env.production.local', '.env.local', '.env.production', '.env']
    : ['.env.development.local', '.env.local', '.env.development', '.env']

  const values = {}
  for (const file of files) {
    try {
      const full = path.resolve(process.cwd(), file)
      if (!fs.existsSync(full)) continue
      for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
        const eq = trimmed.indexOf('=')
        const key = trimmed.slice(0, eq).trim()
        let val = trimmed.slice(eq + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        if (!(key in values)) values[key] = val
      }
    } catch {}
  }
  // A real environment variable always beats a file.
  return new Proxy(values, {
    get: (target, key) => process.env[key] ?? target[key],
  })
}

const ENV = readEnvFiles()

function dbConfig() {
  const url = ENV.DATABASE_URL
  if (url && /^mysql2?:\/\//.test(url)) {
    const rest = url.replace(/^mysql2?:\/\//, '')
    const at = rest.lastIndexOf('@')
    const creds = rest.slice(0, at)
    const hostPart = rest.slice(at + 1)
    const colon = creds.indexOf(':')
    const [hostPort, dbAndParams] = hostPart.split('/')
    const [host, portStr] = hostPort.split(':')
    return {
      host: host || 'localhost',
      port: portStr ? parseInt(portStr, 10) : 3306,
      user: colon !== -1 ? creds.slice(0, colon) : creds,
      password: colon !== -1 ? decodeURIComponent(creds.slice(colon + 1)) : '',
      database: (dbAndParams || '').split('?')[0] || 'ateon_one',
      connectTimeout: 5000,
    }
  }
  return {
    host: ENV.DB_HOST || 'localhost',
    port: Number(ENV.DB_PORT || 3306),
    user: ENV.DB_USER || 'root',
    password: ENV.DB_PASSWORD || '',
    database: ENV.DB_NAME || 'ateon_one',
    connectTimeout: 5000,
  }
}

const pool = mysql.createPool({ ...dbConfig(), waitForConnections: true, connectionLimit: 5 })

/** Read the session cookie out of a raw Cookie header. */
function readSessionCookie(header) {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === 'ateon_session') return decodeURIComponent(v.join('='))
  }
  return null
}

/**
 * Resolve a socket connection to a user by validating the session token
 * against the database — including expiry. Never trust a client-supplied id.
 */
async function authenticate(socket) {
  const token = readSessionCookie(socket.handshake.headers.cookie)
  if (!token) return null
  try {
    const [rows] = await pool.query(
      `SELECT s.userId, s.expiresAt, u.name, u.role, u.email
       FROM Session s JOIN User u ON u.id = s.userId
       WHERE s.token = ? LIMIT 1`,
      [token]
    )
    const row = rows[0]
    if (!row) return null
    if (new Date(row.expiresAt) < new Date()) return null
    return { id: row.userId, name: row.name, role: row.role, email: row.email }
  } catch (err) {
    console.error('[socket] auth failed', err.message)
    return null
  }
}

/** userId -> Set of socket ids, so presence survives multiple tabs. */
const online = new Map()

function presenceList() {
  return Array.from(online.keys())
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url, true))
    } catch (err) {
      console.error('Error handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  const io = new Server(server, {
    path: '/api/socket',
    // Hostinger's web server 308-redirects `/api/socket/` -> `/api/socket`,
    // stripping the slash before the request reaches Node. Serving without the
    // trailing slash keeps the handshake intact behind that redirect.
    addTrailingSlash: false,
    cors: { origin: ENV.NEXTAUTH_URL || true, credentials: true },
  })

  // Server Actions run in this same process, so they can emit through here.
  globalThis.__ateonIO = io

  io.use(async (socket, next2) => {
    const user = await authenticate(socket)
    if (!user) return next2(new Error('unauthorized'))
    socket.data.user = user
    next2()
  })

  io.on('connection', (socket) => {
    const user = socket.data.user

    // Private room for direct pushes (notifications, task assignment).
    socket.join(`user:${user.id}`)
    socket.join('org')

    const sockets = online.get(user.id) || new Set()
    sockets.add(socket.id)
    online.set(user.id, sockets)
    if (sockets.size === 1) io.to('org').emit('presence:online', { userId: user.id })
    socket.emit('presence:list', presenceList())

    // Chat rooms are joined explicitly, and only if you're a member.
    socket.on('chat:join', async (groupId) => {
      if (typeof groupId !== 'string') return
      try {
        const [rows] = await pool.query(
          'SELECT id FROM ChatMember WHERE groupId = ? AND userId = ? LIMIT 1',
          [groupId, user.id]
        )
        if (rows.length === 0) return // not a member — silently ignore
        socket.join(`group:${groupId}`)
      } catch (err) {
        console.error('[socket] chat:join', err.message)
      }
    })

    socket.on('chat:leave', (groupId) => {
      if (typeof groupId === 'string') socket.leave(`group:${groupId}`)
    })

    socket.on('chat:typing', (groupId) => {
      if (typeof groupId !== 'string') return
      if (!socket.rooms.has(`group:${groupId}`)) return
      socket.to(`group:${groupId}`).emit('chat:typing', { groupId, userId: user.id, name: user.name })
    })

    // ── WebRTC signalling ────────────────────────────────────────────────
    // The server only relays SDP/ICE between authorised peers; media itself is
    // peer-to-peer and never touches this process.

    /** Rooms this socket is currently in a call for. */
    const callRooms = new Set()

    socket.on('rtc:join', async (roomId) => {
      if (typeof roomId !== 'string' || !roomId.startsWith('chat:')) return
      const groupId = roomId.slice('chat:'.length)

      try {
        const [rows] = await pool.query(
          'SELECT id FROM ChatMember WHERE groupId = ? AND userId = ? LIMIT 1',
          [groupId, user.id]
        )
        if (rows.length === 0) {
          socket.emit('rtc:error', { message: 'You are not a member of this conversation' })
          return
        }
      } catch (err) {
        console.error('[rtc] join check failed', err.message)
        return
      }

      const room = `call:${groupId}`

      // Tell the joiner who is already here so it can create the offers.
      const existing = []
      for (const id of io.sockets.adapter.rooms.get(room) || []) {
        const peer = io.sockets.sockets.get(id)
        if (peer && id !== socket.id) {
          existing.push({ socketId: id, userId: peer.data.user.id, name: peer.data.user.name })
        }
      }

      socket.join(room)
      callRooms.add(room)

      socket.emit('rtc:peers', { roomId, peers: existing })
      socket.to(room).emit('rtc:peer-joined', {
        roomId,
        socketId: socket.id,
        userId: user.id,
        name: user.name,
      })

      // Ring every other member who isn't already in the call.
      socket.to(`group:${groupId}`).emit('rtc:incoming', {
        roomId,
        groupId,
        from: { userId: user.id, name: user.name },
      })
    })

    /** Relay an SDP offer/answer or ICE candidate to one specific peer. */
    const relay = (event) => (payload) => {
      if (!payload || typeof payload.to !== 'string') return
      const target = io.sockets.sockets.get(payload.to)
      // Only relay to a socket that shares a call room with the sender.
      if (!target) return
      const shared = [...callRooms].some((r) => target.rooms.has(r))
      if (!shared) return

      target.emit(event, {
        ...payload,
        from: socket.id,
        fromUser: { id: user.id, name: user.name },
      })
    }

    socket.on('rtc:offer', relay('rtc:offer'))
    socket.on('rtc:answer', relay('rtc:answer'))
    socket.on('rtc:ice', relay('rtc:ice'))

    socket.on('rtc:leave', (roomId) => {
      if (typeof roomId !== 'string') return
      const room = `call:${roomId.replace(/^chat:/, '')}`
      if (!callRooms.has(room)) return
      socket.leave(room)
      callRooms.delete(room)
      socket.to(room).emit('rtc:peer-left', { socketId: socket.id, userId: user.id })
    })

    socket.on('disconnect', () => {
      // Drop out of any calls cleanly so peers tear down their connections.
      for (const room of callRooms) {
        socket.to(room).emit('rtc:peer-left', { socketId: socket.id, userId: user.id })
      }
      callRooms.clear()

      const set = online.get(user.id)
      if (!set) return
      set.delete(socket.id)
      if (set.size === 0) {
        online.delete(user.id)
        io.to('org').emit('presence:offline', { userId: user.id })
      }
    })
  })

  server
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port} (realtime enabled)`)
    })
})
