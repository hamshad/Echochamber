#!/usr/bin/env node
import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 3001

const server = http.createServer()
const wss = new WebSocketServer({ server })

// room -> Set of ws
const rooms = new Map()

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)) } catch (e) { }
}

wss.on('connection', (ws) => {
  console.log('[signaling] new connection')
  ws.on('message', raw => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch (e) { return }
    const { type, room, payload, from, id } = msg
    
    if (type === 'join') {
      console.log(`[signaling] join room: ${room}`)
      if (!rooms.has(room)) rooms.set(room, new Set())
      rooms.get(room).add(ws)
      ws.room = room
      return
    }

    if (type === 'announce') {
      console.log(`[signaling] announce in ${room}: ${id}`)
      const set = rooms.get(room)
      if (!set) return
      for (const client of set) {
        if (client !== ws) send(client, { type: 'announce', id, room })
      }
      return
    }

    if (type === 'signal') {
      const set = rooms.get(room)
      if (!set) return
      // payload usually contains { to, type, desc/candidate }
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
