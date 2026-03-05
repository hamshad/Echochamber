---
phase: 01-core-app
plan: 02
type: execute
wave: 2
depends_on: ["01-core-app-01"]
files_modified:
  - public/index.html
  - public/style.css
  - public/app.js
autonomous: true
requirements: [RT-01, UI-01, UI-02]

must_haves:
  truths:
    - "User sees a clean dark-themed single-page interface with text input and drag-drop zone"
    - "User can paste text and share it with one click"
    - "User can drag files anywhere on the page and they upload automatically"
    - "Drag-drop zone shows visual feedback (border highlight, overlay) when dragging"
    - "Shared items appear as cards in a responsive grid layout"
    - "New items from other users appear instantly without page refresh"
    - "File items show filename, size, and a download button"
    - "Text items show the content (truncated if long) with a copy button"
    - "Each item shows time remaining before auto-expiry (countdown)"
    - "User can delete individual items with a delete button"
  artifacts:
    - path: "public/index.html"
      provides: "Main HTML page with semantic structure"
      min_lines: 50
    - path: "public/style.css"
      provides: "Complete dark theme styling with drag-drop states and responsive grid"
      min_lines: 200
    - path: "public/app.js"
      provides: "Client-side Socket.IO integration, file upload, text sharing, real-time rendering"
      min_lines: 200
  key_links:
    - from: "public/index.html"
      to: "public/style.css"
      via: "stylesheet link"
      pattern: "style\\.css"
    - from: "public/index.html"
      to: "public/app.js"
      via: "script module"
      pattern: "app\\.js"
    - from: "public/index.html"
      to: "socket.io client"
      via: "script tag loading /socket.io/socket.io.js (served by Socket.IO server)"
      pattern: "socket\\.io\\.js"
    - from: "public/app.js"
      to: "server.js Socket.IO"
      via: "io() client connection"
      pattern: "io\\(\\)"
    - from: "public/app.js"
      to: "/api/text"
      via: "fetch POST for text sharing"
      pattern: "fetch.*api/text"
    - from: "public/app.js"
      to: "/api/upload"
      via: "fetch POST with FormData for file upload"
      pattern: "fetch.*api/upload"
    - from: "public/app.js"
      to: "/api/download"
      via: "window.location or anchor href for file download"
      pattern: "api/download"
    - from: "public/app.js"
      to: "/api/items"
      via: "DELETE fetch for item removal"
      pattern: "fetch.*api/items"
---

<objective>
Build the complete frontend for Echochamber — a beautiful, responsive single-page UI with drag-drop file upload, text sharing, and real-time updates.

Purpose: Provide the user-facing interface that connects to the backend server (Plan 01). Users should feel this is a polished, modern app despite being vanilla HTML/CSS/JS with zero build step.

Output: Three files in `public/` — index.html, style.css, app.js — that together create a fully functional sharing interface.
</objective>

<execution_context>
@/Users/moksha/.config/opencode/get-shit-done/workflows/execute-plan.md
@/Users/moksha/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-core-app/01-core-app-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: HTML structure + CSS dark theme with drag-drop states and responsive grid</name>
  <files>public/index.html, public/style.css</files>
  <action>
  **Create public/index.html:**

  Document structure:
  - `<!DOCTYPE html>`, lang="en", UTF-8, viewport meta
  - Title: "Echochamber"
  - Link to style.css
  - Script tag: `<script src="/socket.io/socket.io.js"></script>` (Socket.IO client served by server)
  - Script tag: `<script src="/app.js" type="module"></script>`

  Body structure (use semantic HTML, minimal nesting):

  ```
  <div id="app">
    <!-- Header -->
    <header>
      <h1>Echochamber</h1>
      <p class="subtitle">Drop files or paste text — shared with everyone on your network</p>
      <div class="status" id="status">
        <span class="status-dot"></span>
        <span id="status-text">Connecting...</span>
      </div>
    </header>

    <!-- Input Section -->
    <section class="input-section">
      <!-- Text Input -->
      <div class="text-input-wrapper">
        <textarea id="text-input" placeholder="Paste text, keys, code snippets..." rows="4"></textarea>
        <button id="share-text-btn" class="btn btn-primary">Share Text</button>
      </div>

      <!-- File Upload (explicit button, but drag-drop also works) -->
      <div class="file-upload-wrapper">
        <label class="file-upload-label" for="file-input">
          <span class="upload-icon">📁</span>
          <span>Choose files or drag & drop anywhere</span>
        </label>
        <input type="file" id="file-input" multiple hidden>
      </div>
    </section>

    <!-- Upload Progress (hidden by default) -->
    <div id="upload-progress" class="upload-progress hidden">
      <div class="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
      <span id="progress-text">Uploading...</span>
    </div>

    <!-- Shared Items Grid -->
    <section class="items-section">
      <h2>Shared Items <span id="item-count" class="item-count"></span></h2>
      <div id="items-grid" class="items-grid">
        <!-- Items rendered by app.js -->
      </div>
      <div id="empty-state" class="empty-state">
        <p>Nothing shared yet</p>
        <p class="hint">Drop a file or paste some text to get started</p>
      </div>
    </section>

    <!-- Full-screen drag overlay -->
    <div id="drag-overlay" class="drag-overlay hidden">
      <div class="drag-overlay-content">
        <span class="drag-icon">📥</span>
        <p>Drop files to share</p>
      </div>
    </div>
  </div>
  ```

  **Create public/style.css:**

  Design language: Dark theme, clean, minimal, modern. Inspired by tools like Linear/Raycast.

  CSS Custom Properties (root):
  ```
  --bg-primary: #0a0a0b;
  --bg-secondary: #141416;
  --bg-tertiary: #1c1c1f;
  --bg-hover: #252529;
  --border: #2a2a2e;
  --border-hover: #3a3a3e;
  --text-primary: #ececef;
  --text-secondary: #8e8e93;
  --text-tertiary: #636366;
  --accent: #6366f1;       /* indigo */
  --accent-hover: #818cf8;
  --success: #22c55e;
  --danger: #ef4444;
  --danger-hover: #f87171;
  --file-bg: #1a1a2e;      /* subtle blue tint for file cards */
  --text-bg: #1a2e1a;      /* subtle green tint for text cards */
  --radius: 12px;
  --radius-sm: 8px;
  ```

  Global reset:
  - `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`
  - `body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg-primary); color: var(--text-primary); min-height: 100vh; }`

  Layout:
  - `#app`: max-width: 900px, margin: 0 auto, padding: 2rem 1.5rem
  - `header`: text-align center, margin-bottom: 2rem
  - `h1`: font-size: 2rem, font-weight: 700, letter-spacing: -0.03em
  - `.subtitle`: color: var(--text-secondary), margin-top: 0.5rem

  Status indicator:
  - `.status`: display: flex, align-items: center, justify-content: center, gap: 0.5rem, margin-top: 1rem, font-size: 0.85rem
  - `.status-dot`: width: 8px, height: 8px, border-radius: 50%, background: var(--text-tertiary)
  - `.status.connected .status-dot`: background: var(--success), box-shadow: 0 0 8px rgba(34,197,94,0.5)

  Input section:
  - `.input-section`: display: flex, flex-direction: column, gap: 1rem, margin-bottom: 2rem
  - `textarea`: width: 100%, background: var(--bg-secondary), border: 1px solid var(--border), border-radius: var(--radius), padding: 1rem, color: var(--text-primary), font-family: 'SF Mono', 'Fira Code', monospace, font-size: 0.9rem, resize: vertical, min-height: 100px, transition: border-color 0.2s. On focus: border-color: var(--accent), outline: none.
  - `.text-input-wrapper`: position: relative
  - `.btn`: padding: 0.75rem 1.5rem, border-radius: var(--radius-sm), border: none, cursor: pointer, font-weight: 600, font-size: 0.9rem, transition: all 0.2s
  - `.btn-primary`: background: var(--accent), color: white. Hover: background: var(--accent-hover), transform: translateY(-1px)
  - `.share-text-btn` (the button): margin-top: 0.5rem, align-self: flex-end

  File upload label:
  - `.file-upload-label`: display: flex, flex-direction: column, align-items: center, gap: 0.5rem, padding: 1.5rem, border: 2px dashed var(--border), border-radius: var(--radius), cursor: pointer, color: var(--text-secondary), transition: all 0.2s. Hover: border-color: var(--accent), color: var(--text-primary), background: var(--bg-secondary)

  Upload progress:
  - `.upload-progress`: margin-bottom: 1.5rem
  - `.progress-bar`: height: 4px, background: var(--bg-tertiary), border-radius: 2px, overflow: hidden
  - `.progress-fill`: height: 100%, background: var(--accent), border-radius: 2px, transition: width 0.3s ease, width: 0%

  Items grid:
  - `.items-grid`: display: grid, grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)), gap: 1rem
  - `.items-section h2`: font-size: 1.1rem, font-weight: 600, margin-bottom: 1rem, color: var(--text-secondary)
  - `.item-count`: font-weight: 400, color: var(--text-tertiary), font-size: 0.9rem

  Item card (base):
  - `.item-card`: background: var(--bg-secondary), border: 1px solid var(--border), border-radius: var(--radius), padding: 1rem, position: relative, transition: all 0.2s. Hover: border-color: var(--border-hover), transform: translateY(-1px), box-shadow: 0 4px 12px rgba(0,0,0,0.3)
  - `.item-card.file`: border-left: 3px solid var(--accent)
  - `.item-card.text`: border-left: 3px solid var(--success)

  Item card internals:
  - `.item-header`: display: flex, justify-content: space-between, align-items: flex-start, margin-bottom: 0.75rem
  - `.item-type`: font-size: 0.75rem, text-transform: uppercase, letter-spacing: 0.05em, font-weight: 600, color: var(--text-tertiary)
  - `.item-type.file`: color: var(--accent)
  - `.item-type.text`: color: var(--success)
  - `.item-actions`: display: flex, gap: 0.5rem
  - `.btn-icon`: background: transparent, border: none, color: var(--text-tertiary), cursor: pointer, padding: 4px, border-radius: 4px, font-size: 1.1rem, transition: all 0.15s. Hover: color: var(--text-primary), background: var(--bg-hover)
  - `.btn-icon.delete:hover`: color: var(--danger)

  File card content:
  - `.file-name`: font-weight: 500, word-break: break-all, margin-bottom: 0.25rem
  - `.file-size`: font-size: 0.8rem, color: var(--text-secondary)
  - `.btn-download`: display: inline-flex, align-items: center, gap: 0.5rem, margin-top: 0.75rem, padding: 0.5rem 1rem, background: var(--accent), color: white, border: none, border-radius: var(--radius-sm), cursor: pointer, font-size: 0.85rem, font-weight: 500, transition: background 0.2s. Hover: background: var(--accent-hover)

  Text card content:
  - `.text-content`: font-family: 'SF Mono', 'Fira Code', monospace, font-size: 0.85rem, line-height: 1.5, white-space: pre-wrap, word-break: break-all, max-height: 200px, overflow-y: auto, background: var(--bg-tertiary), padding: 0.75rem, border-radius: var(--radius-sm), margin-top: 0.5rem

  Item footer:
  - `.item-footer`: display: flex, justify-content: space-between, align-items: center, margin-top: 0.75rem, padding-top: 0.5rem, border-top: 1px solid var(--border)
  - `.item-time`: font-size: 0.75rem, color: var(--text-tertiary)
  - `.expires-soon` (when < 10 min left): color: var(--danger)

  Drag overlay (full screen):
  - `.drag-overlay`: position: fixed, inset: 0, background: rgba(99,102,241,0.15), backdrop-filter: blur(4px), display: flex, align-items: center, justify-content: center, z-index: 1000, border: 3px dashed var(--accent), transition: opacity 0.2s
  - `.drag-overlay.hidden`: display: none
  - `.drag-overlay-content`: text-align: center
  - `.drag-icon`: font-size: 4rem, display: block, margin-bottom: 1rem
  - `.drag-overlay-content p`: font-size: 1.5rem, font-weight: 600, color: var(--accent)

  Empty state:
  - `.empty-state`: text-align: center, padding: 3rem 1rem, color: var(--text-tertiary)
  - `.empty-state .hint`: font-size: 0.85rem, margin-top: 0.5rem
  - `.empty-state.hidden`: display: none

  Hidden utility:
  - `.hidden`: display: none !important

  Responsive:
  - @media (max-width: 640px): `#app` padding: 1rem, `.items-grid` grid-template-columns: 1fr, `h1` font-size: 1.5rem

  Scrollbar styling (webkit):
  - `::-webkit-scrollbar` width: 6px
  - `::-webkit-scrollbar-track` background: transparent
  - `::-webkit-scrollbar-thumb` background: var(--border), border-radius: 3px
  </action>
  <verify>
    <automated>test -f public/index.html && test -f public/style.css && echo "Files exist" && grep -q "socket.io.js" public/index.html && grep -q "app.js" public/index.html && grep -q "items-grid" public/style.css && echo "Key patterns found"</automated>
    <manual>Run `npm start` and open http://localhost:3000 — should see dark-themed page with input area and empty state</manual>
  </verify>
  <done>HTML page loads with dark theme, textarea for text input, file upload label, empty items grid, all styled with CSS custom properties, responsive on mobile</done>
</task>

<task type="auto">
  <name>Task 2: JavaScript client — Socket.IO, drag-drop upload, text sharing, real-time rendering</name>
  <files>public/app.js</files>
  <action>
  Create public/app.js (ES module — no imports needed, Socket.IO loaded via script tag):

  **Socket.IO Connection:**
  ```
  const socket = io();
  ```
  - On 'connect': update status to "Connected" with green dot (add 'connected' class to .status element), update #status-text
  - On 'disconnect': update status to "Disconnected" (remove 'connected' class), update #status-text
  - On 'items:sync': receive full items array, call renderItems(items)
  - On 'item:added': receive single item, prepend to local items array, call renderItems()
  - On 'item:removed': receive { id }, remove from local items array, call renderItems()

  **Local state:**
  ```
  let items = [];
  ```

  **DOM References (get once at top):**
  ```
  const textInput = document.getElementById('text-input');
  const shareTextBtn = document.getElementById('share-text-btn');
  const fileInput = document.getElementById('file-input');
  const itemsGrid = document.getElementById('items-grid');
  const emptyState = document.getElementById('empty-state');
  const dragOverlay = document.getElementById('drag-overlay');
  const uploadProgress = document.getElementById('upload-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const itemCount = document.getElementById('item-count');
  ```

  **Text Sharing:**
  ```
  shareTextBtn.addEventListener('click', shareText);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) shareText();
  });

  async function shareText() {
    const content = textInput.value.trim();
    if (!content) return;
    shareTextBtn.disabled = true;
    try {
      const res = await fetch('/api/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) textInput.value = '';
    } catch (err) {
      console.error('Failed to share text:', err);
    } finally {
      shareTextBtn.disabled = false;
    }
  }
  ```

  **File Upload (via button):**
  ```
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) uploadFiles(fileInput.files);
    fileInput.value = ''; // reset
  });
  ```

  **File Upload function (shared by button and drag-drop):**
  ```
  async function uploadFiles(files) {
    for (const file of files) {
      showProgress(`Uploading ${file.name}...`);
      const formData = new FormData();
      formData.append('file', file);

      try {
        // Use XMLHttpRequest for upload progress
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              progressFill.style.width = pct + '%';
              progressText.textContent = `Uploading ${file.name}... ${pct}%`;
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.send(formData);
        });
      } catch (err) {
        console.error('Upload error:', err);
      }
    }
    hideProgress();
  }

  function showProgress(text) {
    uploadProgress.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = text;
  }

  function hideProgress() {
    setTimeout(() => {
      uploadProgress.classList.add('hidden');
      progressFill.style.width = '0%';
    }, 500);
  }
  ```

  **Drag and Drop (full page):**
  ```
  let dragCounter = 0; // track nested drag events

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dragOverlay.classList.remove('hidden');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dragOverlay.classList.add('hidden');
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault(); // required to allow drop
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.add('hidden');
    if (e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files);
    }
  });
  ```

  **Render Items:**
  ```
  function renderItems(newItems) {
    if (newItems !== undefined) items = newItems;

    // Update count
    itemCount.textContent = items.length ? `(${items.length})` : '';

    // Toggle empty state
    emptyState.classList.toggle('hidden', items.length > 0);

    // Render grid
    itemsGrid.innerHTML = items.map(item => {
      if (item.type === 'text') return renderTextCard(item);
      if (item.type === 'file') return renderFileCard(item);
      return '';
    }).join('');
  }

  function renderTextCard(item) {
    const timeLeft = getTimeLeft(item.expiresAt);
    const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
    return `
      <div class="item-card text" data-id="${item.id}">
        <div class="item-header">
          <span class="item-type text">📝 Text</span>
          <div class="item-actions">
            <button class="btn-icon" onclick="copyText('${item.id}')" title="Copy">📋</button>
            <button class="btn-icon delete" onclick="deleteItem('${item.id}')" title="Delete">✕</button>
          </div>
        </div>
        <div class="text-content">${escapeHtml(item.content)}</div>
        <div class="item-footer">
          <span class="item-time ${expiresSoon ? 'expires-soon' : ''}">⏱ ${timeLeft}</span>
          <span class="item-time">${formatSize(item.size || item.content.length)} chars</span>
        </div>
      </div>
    `;
  }

  function renderFileCard(item) {
    const timeLeft = getTimeLeft(item.expiresAt);
    const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
    return `
      <div class="item-card file" data-id="${item.id}">
        <div class="item-header">
          <span class="item-type file">📎 File</span>
          <div class="item-actions">
            <button class="btn-icon delete" onclick="deleteItem('${item.id}')" title="Delete">✕</button>
          </div>
        </div>
        <div class="file-name">${escapeHtml(item.originalName)}</div>
        <div class="file-size">${formatFileSize(item.size)}</div>
        <button class="btn-download" onclick="downloadFile('${item.id}', '${escapeHtml(item.originalName)}')">⬇ Download</button>
        <div class="item-footer">
          <span class="item-time ${expiresSoon ? 'expires-soon' : ''}">⏱ ${timeLeft}</span>
        </div>
      </div>
    `;
  }
  ```

  **Action functions (must be on window for onclick):**
  ```
  window.copyText = async function(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.content);
      // Brief visual feedback: change button text
      const btn = document.querySelector(`[data-id="${id}"] .btn-icon[title="Copy"]`);
      if (btn) { btn.textContent = '✓'; setTimeout(() => btn.textContent = '📋', 1500); }
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  window.deleteItem = async function(id) {
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  window.downloadFile = function(id) {
    window.open(`/api/download/${id}`, '_blank');
  };
  ```

  **Utility functions:**
  ```
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function getTimeLeft(expiresAt) {
    const ms = expiresAt - Date.now();
    if (ms <= 0) return 'Expired';
    const mins = Math.floor(ms / 60000);
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
    return `${mins}m left`;
  }
  ```

  **Countdown timer (update every 30 seconds):**
  ```
  setInterval(() => {
    document.querySelectorAll('.item-time').forEach(el => {
      // Re-render to update times
    });
    renderItems(); // simple: just re-render all
  }, 30000);
  ```

  **Format for text size display:**
  ```
  function formatSize(chars) {
    return typeof chars === 'number' ? chars.toLocaleString() : chars;
  }
  ```
  </action>
  <verify>
    <automated>test -f public/app.js && grep -q "io()" public/app.js && grep -q "dragenter" public/app.js && grep -q "renderItems" public/app.js && grep -q "fetch.*api/text" public/app.js && echo "All key patterns found in app.js"</automated>
    <manual>Run `npm start`, open http://localhost:3000 on two browser tabs. In tab 1: paste text and click Share. Tab 2 should show the text instantly. Drag a file onto tab 1 — tab 2 should show the file card instantly. Download the file from tab 2. Delete an item — disappears from both tabs.</manual>
  </verify>
  <done>Complete working frontend: text sharing with Cmd+Enter shortcut, drag-drop file upload with progress bar, real-time item sync across all connected clients, copy-to-clipboard for text items, file download, item deletion, countdown timers showing time until expiry</done>
</task>

</tasks>

<verification>
1. Open http://localhost:3000 — see dark-themed page with text input and empty state
2. Type text in textarea, click "Share Text" (or Cmd+Enter) — text card appears in grid
3. Drag a file onto the page — overlay appears, file uploads with progress, file card appears
4. Open a second browser/tab to same URL — both items visible immediately
5. Click copy on text card — text copied to clipboard
6. Click download on file card — file downloads with original name
7. Click delete on any card — removed from all connected clients
8. Each card shows countdown timer (e.g. "59m left")
9. Page works on mobile (responsive grid collapses to single column)
</verification>

<success_criteria>
- Single-page dark-themed UI loads with zero build step
- Text sharing works (paste, share, copy)
- File drag-drop works anywhere on the page with visual overlay feedback
- Upload progress bar shows during file uploads
- Real-time: items appear/disappear on all connected clients without refresh
- File download works with original filename
- Item deletion works and syncs across clients
- Countdown timer shows remaining time on each item
- Responsive layout works on mobile
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-app/01-core-app-02-SUMMARY.md`
</output>
