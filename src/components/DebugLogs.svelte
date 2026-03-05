<script lang="ts">
  import { logs } from '../stores/logs';
  import { onMount } from 'svelte';

  export let visible = false;

  function copyLogs() {
    const text = $logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    alert('Logs copied to clipboard');
  }

  function clearLogs() {
    logs.clear();
  }
</script>

{#if visible}
  <div class="debug-container">
    <div class="header">
      <h3>Debug Logs</h3>
      <div class="actions">
        <button on:click={copyLogs}>Copy All</button>
        <button on:click={clearLogs}>Clear</button>
      </div>
    </div>
    <div class="log-list">
      {#each $logs as log (log.id)}
        <div class="log-entry {log.level}">
          <span class="time">{new Date(log.timestamp).toLocaleTimeString()}</span>
          <span class="message">{log.message}</span>
        </div>
      {/each}
      {#if $logs.length === 0}
        <div class="empty">No logs yet.</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .debug-container {
    margin-top: 2rem;
    padding: 1rem;
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 8px;
    font-family: 'Cascadia Code', 'Courier New', Courier, monospace;
    font-size: 0.85rem;
    max-height: 400px;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid #333;
    padding-bottom: 0.5rem;
  }

  .header h3 { margin: 0; color: #569cd6; }

  .actions button {
    background: #333;
    color: #ccc;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 8px;
    font-size: 0.75rem;
  }

  .actions button:hover { background: #444; color: #fff; }

  .log-list {
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column-reverse;
  }

  .log-entry {
    padding: 2px 0;
    border-bottom: 1px solid #252525;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .time { color: #858585; margin-right: 8px; }
  
  .debug .message { color: #d4d4d4; }
  .info .message { color: #9cdcfe; }
  .warn .message { color: #ce9178; }
  .error .message { color: #f44747; }

  .empty {
    padding: 1rem;
    text-align: center;
    color: #666;
  }
</style>
