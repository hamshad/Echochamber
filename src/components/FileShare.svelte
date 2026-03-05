<script>
  import { listFileShares, addFileShare } from '../stores/shares'

  let fileInput = null
  const files = listFileShares()

  function pick() {
    if (fileInput) fileInput.click()
  }

  async function onFile(ev) {
    const input = ev.target
    if (!input.files || input.files.length === 0) return
    const f = input.files[0]
    addFileShare(f.name, f.size)
    // send to all connected peers (mesh). If mesh empty, nothing happens.
    try {
      await import('../lib/webrtc').then(m => m.sendFileToAll(f))
    } catch (err) {
      console.error('send failed', err)
    }
    input.value = ''
  }
</script>

<div>
  <h2>File Share</h2>
  <input type="file" bind:this={fileInput} on:change={onFile} style="display:none" />
  <div>
    <button on:click={pick}>Choose file</button>
  </div>

  <ul style="margin-top:12px">
    {#each $files as f}
      <li>{f.name} — {f.size} bytes — {new Date(f.createdAt).toLocaleTimeString()}</li>
    {/each}
  </ul>
</div>
