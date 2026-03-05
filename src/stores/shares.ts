import { readable, writable, derived } from 'svelte/store'

type TextShareItem = { id: string; text: string; createdAt: number }
type FileShareItem = { id: string; name: string; size: number; createdAt: number }

const TTL_MS = 1000 * 3600 // 1 hour

function uid() { return Math.random().toString(36).slice(2, 9) }

const _text = writable<TextShareItem[]>([])
const _files = writable<FileShareItem[]>([])

function prune() {
  const now = Date.now()
  _text.update(arr => arr.filter(i => now - i.createdAt < TTL_MS))
  _files.update(arr => arr.filter(i => now - i.createdAt < TTL_MS))
}

setInterval(prune, 60_000)

export function addTextShare(text: string) {
  _text.update(arr => [{ id: uid(), text, createdAt: Date.now() }, ...arr])
}

export function listShares() {
  return _text
}

export function addFileShare(name: string, size: number) {
  _files.update(arr => [{ id: uid(), name, size, createdAt: Date.now() }, ...arr])
}

export function listFileShares() { return _files }

export { _text as textStore, _files as fileStore }
