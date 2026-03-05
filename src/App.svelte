<script>
  import { onMount } from 'svelte'
  import TextShare from './components/TextShare.svelte'
  import FileShare from './components/FileShare.svelte'
  import DebugLogs from './components/DebugLogs.svelte'
  import { startAutoMesh } from './lib/webrtc'

  let showDebug = false;

  function toggleDebug() {
    showDebug = !showDebug;
  }

  onMount(() => {
    // Check for dev flag in URL or localStorage
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev') === 'true' || localStorage.getItem('dev') === 'true') {
      showDebug = true;
    }

    // Best-effort automatic mesh discovery so users don't need to pair manually
    startAutoMesh().catch(() => {
      // discovery is best-effort; ignore failures silently
      console.warn('auto mesh start failed (best-effort)')
    })
  })
</script>

<main>
  <div class="header">
    <h1>Echochamber</h1>
    <button class="dev-toggle" on:click={toggleDebug} title="Toggle Debug Logs">
      {showDebug ? 'Hide Logs' : 'Show Logs'}
    </button>
  </div>

  <section data-test="text-share">
    <TextShare />
  </section>
  <section data-test="file-share">
    <FileShare />
  </section>

  <DebugLogs visible={showDebug} />
</main>

<style>
  main {
    max-width: 900px;
    margin: 2rem auto;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
    padding: 0 1rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #f0f0f0;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
  }

  h1 { margin: 0; color: #333; }

  .dev-toggle {
    background: #f0f0f0;
    border: 1px solid #ccc;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    color: #666;
  }

  .dev-toggle:hover { background: #e0e0e0; color: #333; }

  section { margin-top: 1.5rem; padding: 1rem; border: 1px solid #eee; border-radius: 8px }
</style>
