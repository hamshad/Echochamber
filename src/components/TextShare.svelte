<script>
  import { addTextShare, listShares } from '../stores/shares'

  let text = ''
  const shares = listShares()

  async function send() {
    if (!text.trim()) return
    const txt = text.trim()
    addTextShare(txt)
    text = ''
    try {
      const mod = await import('../lib/webrtc')
      await mod.sendTextToAll(txt)
    } catch (e) {
      console.debug('[TextShare] send: mesh send failed', e)
    }
  }

  // Listen for incoming remote text events (dispatched by webrtc on receive)
  if (typeof window !== 'undefined') {
    window.addEventListener('lan-share-text', (ev) => {
      // Already added by webrtc via addTextShare, this allows for UI notifications if needed
      console.debug('[TextShare] lan-share-text event', ev.detail)
    })
  }
</script>

<div>
  <h2>Text Share</h2>
  <textarea bind:value={text} rows={4} style="width:100%"></textarea>
  <div style="margin-top:8px">
    <button on:click={send}>Send</button>
  </div>

  <ul style="margin-top:12px">
    {#each $shares as item}
      <li><strong>{new Date(item.createdAt).toLocaleTimeString()}:</strong> {item.text}</li>
    {/each}
  </ul>
</div>
