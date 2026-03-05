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
      const { sendShare } = await import('../lib/webrtc')
      sendShare({ type: 'share-text', text: txt })
    } catch (e) {
      console.debug('[TextShare] send: failed', e)
    }
  }

  // Listen for incoming remote text events (dispatched by webrtc on receive)
  if (typeof window !== 'undefined') {
    window.addEventListener('lan-share-text', (ev) => {
      // Incoming text is already added to store by webrtc, this is just for awareness
      console.debug('[TextShare] received text', ev.detail.text)
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
