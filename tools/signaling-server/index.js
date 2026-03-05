#!/usr/bin/env node
import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 3001

const server = http.createServer()
const wss = new WebSocketServer({ server })

// room -> Set of ws
const rooms = new Map()
// room -> Array of { type, data, timestamp }
const cache = new Map()
const CACHE_TTL = 3600 * 1000 // 1 hour

function pruneCache(room) {
  const now = Date.now()
  const messages = cache.get(room) || []
  const filtered = messages.filter(m => now - m.timestamp < CACHE_TTL)
  if (filtered.length === 0) cache.delete(room)
  else cache.set(room, filtered)
}

function addToCache(room, msg) {
  if (!cache.has(room)) cache.set(room, [])
  cache.get(room).push({ ...msg, timestamp: Date.now() })
  pruneCache(room)
}

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)) } catch (e) { }
}

wss.on('connection', (ws) => {
  console.log('[signaling] new connection')
  ws.on('message', raw => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch (e) { return }
    const { type, room, payload, from, id, text, name, size } = msg
    
    if (type === 'join') {
      console.log(`[signaling] join room: ${room}`)
      if (!rooms.has(room)) rooms.set(room, new Set())
      rooms.get(room).add(ws)
      ws.room = room
      
      // Send cached history to the new joiner
      const history = cache.get(room) || []
      console.log(`[signaling] sending ${history.length} cached items to joiner`)
      history.forEach(oldMsg => send(ws, oldMsg))
      return
    }

    if (type === 'share-text') {
      console.log(`[signaling] share-text in ${room}: ${text.slice(0, 20)}...`)
      const shareMsg = { type: 'text-received', text, id: id || Math.random().toString(36).slice(2,9) }
      addToCache(room, shareMsg)
      
      // Broadcast to all active clients
      const set = rooms.get(room)
      if (set) {
        for (const client of set) {
          if (client !== ws) send(client, shareMsg)
        }
      }
      return
    }

    if (type === 'share-file') {
      console.log(`[signaling] share-file in ${room}: ${name}`)
      // For files, we only cache the metadata so others know it exists
      const fileMsg = { type: 'file-announced', name, size, id: id || Math.random().toString(36).slice(2,9) }
      addToCache(room, fileMsg)
      
      const set = rooms.get(room)
      if (set) {
        for (const client of set) {
          if (client !== ws) send(client, fileMsg)
        }
      }
      return
    }

    if (type === 'signal') {
      const set = rooms.get(room)
      if (!set) return
      const targetId = payload?.to
      console.log(`[signaling] signal in ${room} from ${from} to ${targetId || 'all'}`)
      for (const client of set) {
        if (client !== ws) send(client, { type: 'signal', from, payload })
      }
    }
  })

  ws.on('close', () => {
    const r = ws.room
    if (!r) return
    const set = rooms.get(r)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) rooms.delete(r)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`signaling server listening on 0.0.0.0:${PORT}`)
})
