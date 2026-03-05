<script>
  import { onMount } from 'svelte'
  import TextShare from './components/TextShare.svelte'
  import FileShare from './components/FileShare.svelte'
  import { startAutoMesh } from './lib/webrtc'

  onMount(() => {
    // Best-effort automatic mesh discovery so users don't need to pair manually
    startAutoMesh().catch(() => {
      // discovery is best-effort; ignore failures silently
      console.warn('auto mesh start failed (best-effort)')
    })
  })
</script>

<main>
  <h1>LAN Share</h1>
  <section data-test="text-share">
    <TextShare />
  </section>
  <section data-test="file-share">
    <FileShare />
  </section>
</main>

<style>
  main {
    max-width: 900px;
    margin: 2rem auto;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
  }
  section { margin-top: 1.5rem; padding: 1rem; border: 1px solid #eee; border-radius: 8px }
</style>
