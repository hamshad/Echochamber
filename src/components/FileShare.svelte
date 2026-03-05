<script>
  import { onMount } from 'svelte'
  import { listFileShares, addFileShare } from '../stores/shares'

  let fileInput = null
  const files = listFileShares()
  let downloads = []

  function pick() {
    if (fileInput) fileInput.click()
  }

  async function onFile(ev) {
    const input = ev.target
    if (!input.files || input.files.length === 0) return
    const f = input.files[0]
    addFileShare(f.name, f.size)
    try {
      const { sendShare } = await import('../lib/webrtc')
      sendShare({ type: 'share-file', name: f.name, size: f.size })
      // Still attempt direct P2P transfer if peers are connected
      const { sendFileToAll } = await import('../lib/webrtc')
      await sendFileToAll(f)
    } catch (err) {
      console.error('send failed', err)
    }
    input.value = ''
  }

  onMount(() => {
    const handleFile = (ev) => {
      const { name, blob } = ev.detail
      const url = URL.createObjectURL(blob)
      downloads = [{ name, url, size: blob.size, id: Math.random().toString(36).slice(2, 9) }, ...downloads]
    }
    window.addEventListener('lan-share-file', handleFile)
    return () => window.removeEventListener('lan-share-file', handleFile)
  })
</script>

<div>
  <h2>File Share</h2>
  <input type="file" bind:this={fileInput} on:change={onFile} style="display:none" />
  <div style="margin-bottom: 12px">
    <button on:click={pick}>Choose file</button>
  </div>

  {#if downloads.length > 0}
    <div style="margin-bottom: 16px; border-bottom: 1px solid #eee; padding-bottom: 8px">
      <h3>Incoming Downloads</h3>
      <ul style="list-style: none; padding: 0">
        {#each downloads as d (d.id)}
          <li style="margin-bottom: 8px">
            <a href={d.url} download={d.name} style="color: #0066cc; font-weight: bold;">
              Download {d.name} ({d.size} bytes)
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <h3>History</h3>
  <ul style="margin-top:12px">
    {#each $files as f}
      <li>{f.name} — {f.size} bytes — {new Date(f.createdAt).toLocaleTimeString()}</li>
    {/each}
  </ul>
</div>
