// Lightweight LAN-wide WebRTC mesh with optional signaling server.
// Implements automatic discovery (tries signaling server) and automatic peer mesh join.

type DataChannelWithId = { id: string, dc: RTCDataChannel }

const peers: Map<string, RTCPeerConnection> = new Map()
const channels: Map<string, RTCDataChannel> = new Map()
let ws: WebSocket | null = null
let clientId = Math.random().toString(36).slice(2,9)

const ROOM = 'lan-share'

function uid() { return Math.random().toString(36).slice(2,9) }

// Chunk framing: [metaLen:uint32][meta:UTF8][chunk bytes]
function frameChunk(metaObj: any, chunk: ArrayBuffer) {
  const metaStr = JSON.stringify(metaObj)
  const enc = new TextEncoder().encode(metaStr)
  const header = new Uint32Array([enc.byteLength]).buffer
  const out = new Uint8Array(4 + enc.byteLength + chunk.byteLength)
  out.set(new Uint8Array(header), 0)
  out.set(enc, 4)
  out.set(new Uint8Array(chunk), 4 + enc.byteLength)
  return out.buffer
}

function parsePacket(buf: ArrayBuffer) {
  const view = new DataView(buf)
  const metaLen = view.getUint32(0, false) // big-endian not necessary but fixed
  const metaBytes = new Uint8Array(buf.slice(4, 4 + metaLen))
  const meta = JSON.parse(new TextDecoder().decode(metaBytes))
  const chunk = buf.slice(4 + metaLen)
  return { meta, chunk }
}

// Signaling helpers
async function connectSignalingByCandidateIp(ip: string) {
  const url = `ws://${ip}:3001`
  console.debug('[webrtc] connectSignalingByCandidateIp: trying', url, { time: Date.now() })
  try {
    const socket = new WebSocket(url)
    return await new Promise<WebSocket>((resolve, reject) => {
      const t = setTimeout(() => { reject(new Error('timeout')) }, 5000)
      socket.onopen = () => { clearTimeout(t); console.debug('[webrtc] connectSignalingByCandidateIp: connected', url, { time: Date.now() }); resolve(socket) }
      socket.onerror = (e) => { clearTimeout(t); console.debug('[webrtc] connectSignalingByCandidateIp: error', url, { time: Date.now(), error: String(e) }); reject(e) }
      })
  } catch (e) {
    console.debug('[webrtc] connectSignalingByCandidateIp: exception', url, { time: Date.now(), error: String(e) })
    return null
  }
}

async function discoverAndConnectSignaling() {
  // Try well-known: same host as page, localhost, and local IPs discovered via RTCPeerConnection
  const attempts: string[] = []
  try { attempts.push(location.hostname) } catch(e){}
  attempts.push('127.0.0.1')

  // discover local IP candidates via RTCPeerConnection gather
  const ips = await discoverLocalIPs()
  console.debug('[webrtc] discoverAndConnectSignaling: discovered local IPs', ips)
  attempts.push(...ips)

  for (const a of attempts) {
    try {
      console.debug('[webrtc] discoverAndConnectSignaling: attempt', a, { time: Date.now() })
      const s = await connectSignalingByCandidateIp(a)
      if (s) {
        ws = s
        setupWs()
        console.debug('[webrtc] discoverAndConnectSignaling: using signaling', a, { time: Date.now() })
        return true
      } else {
        console.debug('[webrtc] discoverAndConnectSignaling: no signaling at', a)
      }
    } catch(e){ console.debug('[webrtc] discoverAndConnectSignaling: attempt exception', a, String(e)) }
  }
  return false
}

function setupWs() {
  if (!ws) return
  ws.onopen = () => {
    console.debug('[webrtc] setupWs: ws.open, announcing room', ROOM, { time: Date.now(), clientId })
    ws!.send(JSON.stringify({ type: 'join', room: ROOM }))
    // announce presence
    ws!.send(JSON.stringify({ type: 'announce', room: ROOM, id: clientId }))
  }
  ws.onclose = (ev) => { console.debug('[webrtc] setupWs: ws.close', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean }) }
  ws.onerror = (e) => { console.debug('[webrtc] setupWs: ws.error', String(e)) }
  ws.onmessage = async (ev) => {
    let msg: any = null
    try {
      msg = JSON.parse(ev.data)
    } catch (e) {
      console.debug('[webrtc] setupWs: invalid JSON message', String(e), ev.data)
      return
    }
    console.debug('[webrtc] setupWs: got message', msg)
    if (msg.type === 'signal') {
      const { from, payload } = msg
      await handleSignal(from, payload)
    }
    if (msg.type === 'announce') {
      const remoteId = msg.id
      if (remoteId === clientId) return
      // To avoid collision, only one side initiates offer: compare ids
      if (remoteId > clientId) {
        await initiateOffer(remoteId)
      }
    }
  }
}

// debug helper
function dbg() { try { console.debug('[webrtc]', ...arguments) } catch(e){} }

async function handleSignal(from: string, payload: any) {
  console.debug('[webrtc] handleSignal: from', from, payload && payload.type)
  if (!peers.has(from)) {
    await createPeerConnection(from, false)
  }
  const pc = peers.get(from)!
  if (payload.type === 'offer') {
    await pc.setRemoteDescription(payload.desc)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    ws!.send(JSON.stringify({ type: 'signal', room: ROOM, from: clientId, payload: { to: from, type: 'answer', desc: pc.localDescription } }))
  } else if (payload.type === 'answer') {
    await pc.setRemoteDescription(payload.desc)
  } else if (payload.type === 'candidate') {
    try { await pc.addIceCandidate(payload.candidate) } catch(e){}
  }
}

async function initiateOffer(remoteId: string) {
  console.debug('[webrtc] initiateOffer: remoteId', remoteId)
  const pc = await createPeerConnection(remoteId, true)
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  ws!.send(JSON.stringify({ type: 'signal', room: ROOM, from: clientId, payload: { to: remoteId, type: 'offer', desc: pc.localDescription } }))
}

async function createPeerConnection(remoteId: string, createChannel: boolean) {
  dbg('createPeerConnection', remoteId, createChannel)
  const pc = new RTCPeerConnection({ iceServers: [] })
  peers.set(remoteId, pc)

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      dbg('onicecandidate', remoteId, ev.candidate)
      ws?.send(JSON.stringify({ type: 'signal', room: ROOM, from: clientId, payload: { to: remoteId, type: 'candidate', candidate: ev.candidate } }))
    }
  }

  pc.ondatachannel = (ev) => {
    const dc = ev.channel
    dbg('ondatachannel', remoteId, dc.label)
    setupDataChannel(remoteId, dc)
  }

  if (createChannel) {
    const dc = pc.createDataChannel('file')
    dbg('createDataChannel', remoteId)
    setupDataChannel(remoteId, dc)
  }

  return pc
}

function setupDataChannel(remoteId: string, dc: RTCDataChannel) {
  channels.set(remoteId, dc)
  dc.binaryType = 'arraybuffer'
  dc.onopen = () => { dbg('dc.open', remoteId); dbg('dc.count', channels.size) }
  dc.onclose = () => { dbg('dc.close', remoteId); dbg('dc.count', channels.size) }
  dc.onerror = (e) => dbg('dc.error', remoteId, String(e))
  dc.onmessage = (ev) => {
    dbg('dc.onmessage', remoteId)
    if (typeof ev.data === 'string') {
      // json control
      try { const msg = JSON.parse(ev.data); dbg('dc.ctrl', msg) } catch(e){ dbg('dc.ctrl.parseErr', e) }
      return
    }
    const { meta, chunk } = parsePacket(ev.data)
    handleIncomingChunk(meta, chunk)
  }
}

// Reassembly map
const reassembly = new Map<string, { name: string, size: number, received: number, chunks: Array<Uint8Array> }>()

function handleIncomingChunk(meta: any, chunkBuf: ArrayBuffer) {
  console.debug('[webrtc] handleIncomingChunk: meta.type=', meta.type)
  if (meta.type === 'chunk') {
    const id = meta.id
    const rec = reassembly.get(id) || { name: meta.name, size: meta.size, received: 0, chunks: [] }
    rec.chunks.push(new Uint8Array(chunkBuf))
    rec.received += chunkBuf.byteLength
    reassembly.set(id, rec)
    if (rec.received >= rec.size) {
      const blob = new Blob(rec.chunks)
      // add to file store via dynamic import to avoid cycle
      import('../stores/shares').then(mod => {
        mod.addFileShare(rec.name, rec.size)
        // create download link dispatch via custom event
        window.dispatchEvent(new CustomEvent('lan-share-file', { detail: { name: rec.name, blob } }))
      })
      reassembly.delete(id)
    }
  } else if (meta.type === 'text') {
    try {
      const txt = meta.text
      dbg('handleIncomingChunk: text', txt)
      import('../stores/shares').then(mod => {
        mod.addTextShare(txt)
        window.dispatchEvent(new CustomEvent('lan-share-text', { detail: { text: txt } }))
      })
    } catch (e) { dbg('handleIncomingChunk:text:error', e) }
  }
}

// Public API
export async function startAutoMesh() {
  dbg('startAutoMesh: starting discovery', { time: Date.now() })
  const start = Date.now()
  const ok = await discoverAndConnectSignaling()
  dbg('startAutoMesh: discovery result=', ok, { durationMs: Date.now() - start })
}

export function getConnectedPeerCount() {
  return channels.size
}

export async function sendFileToAll(file: File) {
  const id = uid()
  const chunkSize = 64 * 1024
  const total = file.size
  const reader = file.stream().getReader()
  let index = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = value.buffer
    const meta = { type: 'chunk', id, index, name: file.name, size: total }
    const framed = frameChunk(meta, chunk)
    for (const dc of channels.values()) {
      try { dc.send(framed) } catch (e) { dbg('sendFileToAll: send error', String(e)) }
    }
    index++
  }
  dbg('sendFileToAll: finished sending', { id, name: file.name, total })
}

// Send short text messages to all peers
export async function sendTextToAll(text: string) {
  try {
    const id = uid()
    const meta = { type: 'text', id, text, ts: Date.now() }
    const framed = frameChunk(meta, new ArrayBuffer(0))
    let sent = 0
    for (const [peerId, dc] of Array.from(channels.entries())) {
      try { dc.send(framed); sent++ } catch (e) { dbg('sendTextToAll: send error to', peerId, String(e)) }
    }
    dbg('sendTextToAll: sent', { id, text, peersAttempted: channels.size, peersSucceeded: sent })
  } catch (e) {
    dbg('sendTextToAll: unexpected error', e)
  }
}

// Local IP discovery via RTCPeerConnection trick
function discoverLocalIPs(): Promise<string[]> {
  return new Promise((resolve) => {
    const ips = new Set<string>()
    const pc = new RTCPeerConnection({ iceServers: [] })
    pc.createDataChannel('')
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        pc.close()
        resolve(Array.from(ips))
        return
      }
      const s = e.candidate.candidate
      const m = s.match(/([0-9]{1,3}(?:\.[0-9]{1,3}){3})/)
      if (m) ips.add(m[1])
    }
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => resolve([]))
  })
}
