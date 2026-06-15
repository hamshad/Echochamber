// public/app.js — main client script for Echochamber
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js';

// Scroll lock for dialogs
function lockBody(){ document.body.classList.add('dialog-open'); }
function unlockBody(){ document.body.classList.remove('dialog-open'); }

// Theme switching
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}
initTheme();

// GSAP entry animations
function initEntryAnimations() {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.fromTo("#brand-title", { y: -20, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.8 })
    .fromTo(".subtitle", { y: 15, opacity: 0, filter: "blur(4px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.6 }, "-=0.5")
    .fromTo(".status", { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5 }, "-=0.35")
    .fromTo(".github-link", { x: 20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, "-=0.35")
    .fromTo(".theme-toggle", { x: 20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, "-=0.45")
    .fromTo(".text-input-wrapper", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, "-=0.3")
    .fromTo(".file-upload-label", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, "-=0.4")
    .fromTo(".items-section h2", { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, "-=0.3")
    .fromTo(".site-footer", { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, "-=0.3");
}
initEntryAnimations();

// Custom cursor
function initCursor() {
  const ring = document.getElementById('cursor-ring');
  const dot = document.getElementById('cursor-dot');
  if (!ring || !dot) return;
  if (window.matchMedia('(hover: none)').matches) return;

  const xRing = gsap.quickTo(ring, 'left', { duration: 0.4, ease: 'power3.out' });
  const yRing = gsap.quickTo(ring, 'top', { duration: 0.4, ease: 'power3.out' });
  const xDot = gsap.quickTo(dot, 'left', { duration: 0.1, ease: 'power2.out' });
  const yDot = gsap.quickTo(dot, 'top', { duration: 0.1, ease: 'power2.out' });

  document.addEventListener('mousemove', (e) => {
    xRing(e.clientX);
    yRing(e.clientY);
    xDot(e.clientX);
    yDot(e.clientY);
  });

  const interactives = 'a, button, label, .item-card, .btn, .btn-icon, .btn-download, textarea, .keypad-key, .theme-toggle, .file-upload-label';

  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(interactives)) {
      ring.classList.add('hovering');
      dot.classList.add('hovering');
      if (e.target.closest('.item-card')) ring.classList.add('card-hover');
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(interactives)) {
      ring.classList.remove('hovering');
      dot.classList.remove('hovering');
      ring.classList.remove('card-hover');
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest(interactives)) {
      gsap.fromTo(ring, { scale: 1.8, opacity: 0.8 }, { scale: 1, opacity: 0.4, duration: 0.4, ease: 'back.out(2)' });
    }
    createClickParticles(e.clientX, e.clientY);
  });
}

function createClickParticles(x, y) {
  const count = 4;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const isEasterEgg = document.body.classList.contains('show-all-active');
  const color = isEasterEgg ? '196,148,10' : isDark ? '232,232,236' : '17,17,17';

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position:fixed;left:${x}px;top:${y}px;
      width:3px;height:3px;border-radius:50%;
      background:rgba(${color},0.6);
      pointer-events:none;z-index:99998;
    `;
    document.body.appendChild(p);

    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
    const dist = 15 + Math.random() * 20;
    gsap.to(p, {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      opacity: 0,
      scale: 0.3,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => p.remove()
    });
  }
}
initCursor();

// Random quote
function loadQuote() {
  const el = document.getElementById('daily-quote');
  if (!el) return;
  const useKanye = Math.random() < 0.2;
  const useDadJoke = !useKanye && Math.random() < 0.15;
  let url, parser;
  if (useKanye) {
    url = 'https://api.kanye.rest/';
    parser = data => ({ text: data.quote, char: 'Kanye West' });
  } else if (useDadJoke) {
    url = 'https://icanhazdadjoke.com/';
    parser = data => ({ text: data.joke, char: 'Dad Joke' });
  } else {
    url = 'https://api.animechan.io/v1/quotes/random';
    parser = data => {
      if (data.status === 'success' && data.data) {
        return { text: data.data.content, char: `${data.data.character.name}, ${data.data.anime.name}` };
      }
      return null;
    };
  }
  fetch(url, { headers: useDadJoke ? { 'Accept': 'application/json' } : {} })
    .then(r => {
      if (r.status === 429) {
        return fetch('https://icanhazdadjoke.com/', { headers: { 'Accept': 'application/json' } })
          .then(r2 => r2.json())
          .then(data => ({ text: data.joke, char: 'Dad Joke' }));
      }
      return r.json().then(parser);
    })
    .then(result => {
      if (result && result.text) {
        el.innerHTML = `"${result.text}" <span class="quote-char">— ${result.char}</span>`;
        el.classList.add('visible');
      }
    })
    .catch(() => {});
}
loadQuote();

let db;
let items = [];
let myIp = null; // Will be set from server
let showAll = false;
let tapCount = 0;
let tapTimer = null;
let cachedAllItems = [];

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
const loadingState = document.getElementById('loading-state');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');

function setStatusConnected(connected){
  if(connected){
    statusEl.classList.add('connected');
    statusText.textContent = 'Connected';
  } else {
    statusEl.classList.remove('connected');
    statusText.textContent = 'Disconnected';
  }
}

// Fetch our IP from our own server (most reliable way to match roomId)
async function getMyIp() {
  try {
    const res = await fetch('/api/items');
    // The server-side getRoomId is used when we call this endpoint.
    // We can also just use the response from /api/text, but this is cleaner for init.
    // However, the /api/items currently returns an array.
    // Let's add a small health/info endpoint to the server for this.
    const res2 = await fetch('/api/whoami');
    if (res2.ok) {
        const data = await res2.json();
        return data.ip;
    }
  } catch (e) {
    console.warn('Could not fetch IP from /api/whoami, falling back to local');
  }
  return 'local';
}

async function initFirebase() {
  const firebaseConfig = {
    databaseURL: "https://rnfirebase-c3268-default-rtdb.firebaseio.com",
    projectId: "rnfirebase-c3268"
  };

  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  
  myIp = await getMyIp();
  console.log('[App] Detected Room IP:', myIp);
  
  const itemsRef = ref(db, 'items');
  onValue(itemsRef, (snapshot) => {
    // Hide loading once we get any value from Firebase
    loadingState.classList.add('hidden');
    itemsGrid.classList.remove('hidden');
    
    const data = snapshot.val() || {};
    cachedAllItems = Object.values(data);
    
    filterAndRender();
    setStatusConnected(true);
  }, (error) => {
    console.error('Firebase DB Error:', error);
    setStatusConnected(false);
  });
}

  initFirebase().catch(err => {
  console.error('Failed to init app:', err);
  setStatusConnected(false);
});

// Trigger lazy cleanup on init
fetch('/api/cleanup').catch(() => {});

function filterAndRender() {
  const now = Date.now();
  items = cachedAllItems
    .filter(i => i.expiresAt > now && (showAll || i.roomId === myIp))
    .sort((a, b) => b.createdAt - a.createdAt);
  renderItems();
}

shareTextBtn.addEventListener('click', shareText);
textInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) shareText();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) uploadFiles(fileInput.files);
  fileInput.value = '';
});

// Easter egg: tap/click "Echochamber" random(7-20) times to show all items across all IPs
const easterEggTaps = Math.floor(Math.random() * 14) + 7;
const brandTitle = document.getElementById('brand-title');
brandTitle.addEventListener('click', () => {
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
  if (tapCount >= easterEggTaps) {
    tapCount = 0;
    clearTimeout(tapTimer);
    if (showAll) {
      toggleShowAll(false);
    } else {
      showKeypad();
    }
  }
});

function toggleShowAll(enable) {
  showAll = enable;
  document.body.classList.toggle('show-all-active', showAll);
  const subtitle = document.querySelector('.subtitle');
  if (showAll) {
    subtitle.textContent = 'Showing all items across all networks';
    subtitle.style.color = 'var(--warning)';
  } else {
    subtitle.textContent = 'Drop files or paste text \u2014 shared with everyone on your network';
    subtitle.style.color = '';
  }
  filterAndRender();
}

function showKeypad() {
  let existing = document.getElementById('keypad-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'keypad-overlay';
  overlay.className = 'keypad-overlay';
  overlay.innerHTML = `
    <div class="keypad-modal">
      <div class="keypad-display" id="keypad-display"></div>
      <div class="keypad-grid">
        ${[1,2,3,4,5,6,7,8,9,'C',0,'\u232B'].map(k => {
          const cls = k === 'C' ? 'keypad-key keypad-key-clear' : k === '\u232B' ? 'keypad-key keypad-key-back' : 'keypad-key';
          return `<button class="${cls}" data-key="${k}">${k}</button>`;
        }).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  lockBody();
  const display = overlay.querySelector('#keypad-display');

  overlay.addEventListener('click', (e) => {
    const key = e.target.closest('.keypad-key');
    if (!key) {
      if (e.target === overlay) { overlay.remove(); unlockBody(); }
      return;
    }

    const val = key.dataset.key;
    if (val === 'C') {
      display.textContent = '';
    } else if (val === '\u232B') {
      display.textContent = display.textContent.slice(0, -1);
    } else {
      if (display.textContent.length < 4) {
        display.textContent += val;
      }
    }

    if (display.textContent.length === 4) {
      const now = new Date();
      const code = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
      if (display.textContent === code) {
        overlay.remove();
        unlockBody();
        toggleShowAll(true);
      } else {
        display.classList.add('keypad-shake');
        setTimeout(() => {
          display.classList.remove('keypad-shake');
          display.textContent = '';
        }, 400);
      }
    }
  });
}

async function shareText(){
  const content = textInput.value.trim();
  if(!content) return;
  shareTextBtn.disabled = true;
  
  gsap.to(textInput, {
    scaleY: 0.1, y: -20, opacity: 0, filter: "blur(10px)",
    duration: 0.4, ease: "power2.in"
  });
  
  try{
    const res = await fetch('/api/text', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content})
    });
    if(res.ok) {
        gsap.to(textInput, {
          scaleY: 1, y: 0, opacity: 1, filter: "blur(0px)",
          duration: 0.4, ease: "back.out(1.7)",
          delay: 0.1,
          onStart: () => { textInput.value = ''; }
        });
        
        const newItem = await res.json();
        if (!myIp) myIp = newItem.roomId;
    } else {
      gsap.set(textInput, { scaleY: 1, y: 0, opacity: 1, filter: "none" });
    }
  }catch(err){
    console.error('Failed to share text:', err);
    gsap.set(textInput, { scaleY: 1, y: 0, opacity: 1, filter: "none" });
  }finally{ shareTextBtn.disabled = false; }
}

function showProgress(text){
  uploadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = text;
}

function hideProgress(){
  setTimeout(()=>{
    uploadProgress.classList.add('hidden');
    progressFill.style.width = '0%';
  },500);
}

async function uploadFiles(files){
  for(const file of files){
    showProgress(`Uploading ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);
    const optimisticId = 'optimistic-' + Math.random().toString(36).slice(2,9);
    items = [{
      id: optimisticId,
      type: 'file',
      originalName: file.name,
      size: file.size,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60*60*1000,
      optimistic: true,
      roomId: myIp // Match current room for optimistic UI
    }, ...items];
    renderItems();
    try{
      await new Promise((resolve,reject)=>{
        const xhr = new XMLHttpRequest();
        xhr.open('POST','/api/upload');
        xhr.upload.onprogress = (e)=>{
          if(e.lengthComputable){
            const pct = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = `Uploading ${file.name}... ${pct}%`;
          }
        };
        xhr.onload = ()=>{
          if(xhr.status>=200 && xhr.status<300) {
              const res = JSON.parse(xhr.responseText);
              if (!myIp) myIp = res.roomId;
              resolve();
          }
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = ()=>reject(new Error('Upload failed'));
        xhr.send(formData);
      });
      }catch(err){ console.error('Upload error:',err); }
  }
  hideProgress();
}

let dragCounter = 0;
document.addEventListener('dragenter',(e)=>{ e.preventDefault(); dragCounter++; dragOverlay.classList.remove('hidden'); lockBody(); });
document.addEventListener('dragleave',(e)=>{ e.preventDefault(); dragCounter--; if(dragCounter===0){ dragOverlay.classList.add('hidden'); unlockBody(); } });
document.addEventListener('dragover',(e)=>{ e.preventDefault(); });
document.addEventListener('drop',(e)=>{ e.preventDefault(); dragCounter=0; dragOverlay.classList.add('hidden'); unlockBody(); if(e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); });

function renderItems(newItems){
  const oldItems = [...items];
  if(newItems !== undefined) items = newItems;
  itemCount.textContent = items.length ? `(${items.length})` : '';
  
  const hasItems = items.length > 0;
  emptyState.classList.toggle('hidden', hasItems);
  
  syncDom(oldItems, items);
}

function syncDom(oldItems, newItems) {
  const oldMap = {};
  const allCards = itemsGrid.querySelectorAll('.item-card');
  allCards.forEach(c => {
    const id = c.getAttribute('data-id');
    if (id) oldMap[id] = c;
  });

  const newIds = new Set(newItems.map(i => i.id));
  const COLS = window.innerWidth <= 640 ? 1 : 2;
  const cols = Array.from(itemsGrid.querySelectorAll('.masonry-col'));

  // Remove deleted cards
  allCards.forEach(c => {
    const id = c.getAttribute('data-id');
    if (!newIds.has(id) && !c.classList.contains('deleting')) {
      c.remove();
    }
  });

  // Build cards array: re-use existing, create new
  const cardElements = newItems.map(item => {
    const existing = oldMap[item.id];
    if (existing) {
      // Update existing card footer
      const isImmortal = item.expiresAt >= 9000000000000000;
      const timeLeft = getTimeLeft(item.expiresAt);
      const expiresSoon = !isImmortal && (item.expiresAt - Date.now()) < 10 * 60 * 1000;
      const footer = existing.querySelector('.item-footer');
      if (footer) {
        const timeHtml = isImmortal
          ? '<svg class="icon-infinite-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path class="infinity-path" d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg> Immortal'
          : '⏱ ' + timeLeft;
        footer.innerHTML = `<span class="item-time${isImmortal ? ' immortal-time' : (expiresSoon ? ' expires-soon' : '')}">${timeHtml}</span>${item.type === 'text' ? `<span class="item-time">${formatSize(item.size || item.content.length)} chars</span>` : ''}`;
      }
      if (isImmortal) existing.classList.add('immortal');
      else existing.classList.remove('immortal');
      return existing;
    } else {
      const cardHtml = item.type === 'text' ? renderTextCard(item) : renderFileCard(item);
      const temp = document.createElement('div');
      temp.innerHTML = cardHtml.trim();
      const newCard = temp.firstChild;
      return newCard;
    }
  });

  // Clear all cards from columns (detach, don't destroy)
  cols.forEach(col => {
    while (col.firstChild) col.removeChild(col.firstChild);
  });

  // Redistribute all cards into columns by shortest height
  const colHeights = [0, 0];
  cardElements.forEach((card, i) => {
    const item = newItems[i];
    if (!item) return;
    const isNew = !oldMap[item.id];
    let shortest = 0;
    for (let c = 1; c < COLS; c++) {
      if (colHeights[c] < colHeights[shortest]) shortest = c;
    }
    cols[shortest].appendChild(card);
    colHeights[shortest] += card.offsetHeight || 200;
    if (isNew) {
      gsap.fromTo(card,
        { opacity: 0, y: 24, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.7)",
          delay: 0.05 * Math.min(i, 5) }
      );
    }
  });
}

function renderTextCard(item){
  const timeLeft = getTimeLeft(item.expiresAt);
  const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
  
  // Extract URLs for button generation
  const urls = extractUrls(item.content);
  const youtubeUrls = extractYouTubeUrls(item.content);
  
  // Generate URL action buttons
  let urlButtons = '';
  if (urls.length > 0 || youtubeUrls.length > 0) {
    urlButtons = '<div class="url-actions">';
    
    // Add redirect button for first URL (if any)
    if (urls.length > 0) {
      urlButtons += `<button class="url-btn" onclick="window.open('${urls[0]}', '_blank')" title="Open Link"><svg class="icon-lucide icon-link" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>`;
    }
    
    // Add YouTube play button for first YouTube URL (if any)
    if (youtubeUrls.length > 0) {
      urlButtons += `<button class="youtube-btn" onclick="openYouTubePopup('${youtubeUrls[0].videoId}')" title="Play YouTube Video"><svg class="icon-lucide icon-play" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>`;
    }
    
    urlButtons += '</div>';
  }
  
  return `
    <div class="item-card text${item.expiresAt >= 9000000000000000 ? ' immortal' : ''}" data-id="${item.id}">
      <div class="item-header">
        <span class="item-type text"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Text</span>
        <div class="item-actions">
          <button class="btn-icon" onclick="copyText('${item.id}')" title="Copy"><svg class="icon-lucide icon-copy" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button class="btn-icon" onclick="openTextModal('${item.id}')" title="View"><svg class="icon-lucide icon-eye" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><rect class="eyelid" x="0" y="0" width="24" height="24" rx="0" fill="var(--surface)" stroke="none"/></svg></button>
          <button class="btn-icon extend-btn" onclick="openExtendDialog('${item.id}', this)" title="Extend Time"><svg class="icon-lucide icon-clock" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line class="clock-hand-hour" x1="12" y1="12" x2="12" y2="8" stroke-width="2.5" stroke-linecap="round"/><line class="clock-hand-minute" x1="12" y1="12" x2="12" y2="6" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>
          ${urlButtons}
          <button class="btn-icon delete" onclick="deleteItem('${item.id}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <button class="btn-icon immortal-btn${item.expiresAt >= 9000000000000000 ? ' active' : ''}"${item.expiresAt >= 9000000000000000 ? '' : ` onclick="immortalItem('${item.id}', this)"`} title="${item.expiresAt >= 9000000000000000 ? 'Immortal' : 'Make Immortal'}"><svg class="icon-lucide icon-infinity" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="infinity-path" d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg></button>
        </div>
      </div>
      <div class="text-content">${escapeHtml(item.content)}</div>
      <div class="item-footer">
        <span class="item-time${item.expiresAt >= 9000000000000000 ? ' immortal-time' : (expiresSoon ? ' expires-soon' : '')}">${item.expiresAt >= 9000000000000000 ? '<svg class="icon-infinite-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path class="infinity-path" d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg> Immortal' : '⏱ ' + timeLeft}</span>
        <span class="item-time">${formatSize(item.size || item.content.length)} chars</span>
      </div>
    </div>
  `;
}

function renderFileCard(item){
  const timeLeft = getTimeLeft(item.expiresAt);
  const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
  const optimisticNote = item.optimistic ? '<div class="optimistic">Uploading...</div>' : '';
  return `
    <div class="item-card file${item.expiresAt >= 9000000000000000 ? ' immortal' : ''}" data-id="${item.id}">
      <div class="item-header">
        <span class="item-type file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> File</span>
        <div class="item-actions">
          <button class="btn-icon extend-btn" onclick="openExtendDialog('${item.id}', this)" title="Extend Time"><svg class="icon-lucide icon-clock" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line class="clock-hand-hour" x1="12" y1="12" x2="12" y2="8" stroke-width="2.5" stroke-linecap="round"/><line class="clock-hand-minute" x1="12" y1="12" x2="12" y2="6" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>
          <button class="btn-icon delete" onclick="deleteItem('${item.id}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <button class="btn-icon immortal-btn${item.expiresAt >= 9000000000000000 ? ' active' : ''}"${item.expiresAt >= 9000000000000000 ? '' : ` onclick="immortalItem('${item.id}', this)"`} title="${item.expiresAt >= 9000000000000000 ? 'Immortal' : 'Make Immortal'}"><svg class="icon-lucide icon-infinity" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="infinity-path" d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg></button>
        </div>
      </div>
      <div class="file-name">${escapeHtml(item.originalName)}</div>
      <div class="file-size">${formatFileSize(item.size)}</div>
      <button class="btn-download" onclick="downloadFile('${item.id}','${escapeHtml(item.originalName)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>
      ${optimisticNote}
      <div class="item-footer">
        <span class="item-time${item.expiresAt >= 9000000000000000 ? ' immortal-time' : (expiresSoon ? ' expires-soon' : '')}">${item.expiresAt >= 9000000000000000 ? '<svg class="icon-infinite-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path class="infinity-path" d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg> Immortal' : '⏱ ' + timeLeft}</span>
      </div>
    </div>
  `;
}

window.copyText = async function(id){
  const item = items.find(i => i.id === id);
  if(!item) return;
  try{ await navigator.clipboard.writeText(item.content); const btn = document.querySelector(`[data-id="${id}"] .btn-icon[title="Copy"]`); if(btn){ const svg = btn.querySelector('svg'); const origHTML = svg.outerHTML; svg.outerHTML = '<svg class="icon-lucide icon-copy copied" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; setTimeout(()=>{ const s = btn.querySelector('svg'); if(s) s.outerHTML = origHTML; },1800); } }catch(err){ console.error('Copy failed:',err); }
};

window.deleteItem = async function(id){
  const card = document.querySelector(`[data-id="${id}"]`);
  if (!card) return;

  card.classList.add('deleting');
  card.style.pointerEvents = 'none';

  try {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    
    createDustEffect(card);
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Unable to delete item. Please try again.');
    
    card.classList.remove('deleting');
    card.style.pointerEvents = 'auto';
    gsap.set(card, { opacity: 1, scale: 1, y: 0, filter: "none" });
  }
};

function createDustEffect(card) {
  const rect = card.getBoundingClientRect();
  const particleCount = 40;
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden`;
  document.body.appendChild(container);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const baseColor = isDark ? [232, 232, 236] : [17, 17, 17];

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('div');
    const size = 2 + Math.random() * 4;
    const startX = rect.left + Math.random() * rect.width;
    const startY = rect.top + Math.random() * rect.height;
    const opacity = 0.4 + Math.random() * 0.6;
    const [r, g, b] = baseColor;
    p.style.cssText = `
      position:absolute;left:${startX}px;top:${startY}px;
      width:${size}px;height:${size}px;border-radius:${Math.random() > 0.5 ? '50%' : '1px'};
      background:rgba(${r},${g},${b},${opacity});
      pointer-events:none;
    `;
    container.appendChild(p);

    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 120;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 30 - Math.random() * 60;

    gsap.to(p, {
      x: dx, y: dy,
      opacity: 0,
      scale: 0.2 + Math.random() * 0.3,
      rotation: Math.random() * 360,
      duration: 0.6 + Math.random() * 0.5,
      ease: "power2.out",
    });
  }

  gsap.to(card, {
    opacity: 0, scale: 0.9, filter: "blur(4px)",
    duration: 0.3, ease: "power2.in",
    onComplete: () => {
      if (card.parentNode) {
        card.remove();
      }
      setTimeout(() => container.remove(), 1200);
    }
  });
}

window.downloadFile = function(id){ window.open(`/api/download/${id}`,'_blank'); };

window.immortalItem = async function(id, btnEl){
  const card = document.querySelector(`[data-id="${id}"]`);
  if (!card) return;
  try {
    const res = await fetch(`/api/items/${id}/immortal`, { method: 'POST' });
    if (!res.ok) throw new Error('Immortal failed');
    const data = await res.json();
    // Update local state
    const item = cachedAllItems.find(i => i.id === id);
    if (item) item.expiresAt = data.expiresAt;
    // Trigger burst animation
    card.classList.add('immortal-burst');
    // Flash overlay
    const flash = document.createElement('div');
    flash.className = 'immortal-flash';
    card.appendChild(flash);
    setTimeout(() => flash.remove(), 800);
    // Multi-layer glow
    const glow = document.createElement('div');
    glow.className = 'immortal-glow';
    card.appendChild(glow);
    setTimeout(() => glow.remove(), 1800);
    // Energy wave rings
    for (let i = 0; i < 4; i++) {
      const wave = document.createElement('div');
      wave.className = 'immortal-wave-ring';
      wave.style.animationDelay = `${60 + i * 120}ms`;
      card.appendChild(wave);
      setTimeout(() => wave.remove(), 1500);
    }
    // Golden spark particles
    const pw = card.offsetWidth;
    const ph = card.offsetHeight;
    const colors = ['#c4940a', '#fff8e1', '#ffe082', '#ffd54f', '#ffffff'];
    for (let i = 0; i < 30; i++) {
      const spark = document.createElement('div');
      spark.className = 'immortal-spark';
      const size = 2 + Math.random() * 5;
      spark.style.width = size + 'px';
      spark.style.height = size + 'px';
      spark.style.background = colors[Math.floor(Math.random() * colors.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 140;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      spark.style.left = (pw / 2) + 'px';
      spark.style.top = (ph / 2) + 'px';
      spark.style.transform = `translate(${dx - size/2}px, ${dy - size/2}px)`;
      spark.style.animationDelay = (Math.random() * 300) + 'ms';
      spark.style.animationDuration = (1500 + Math.random() * 800) + 'ms';
      card.appendChild(spark);
      setTimeout(() => spark.remove(), 3000);
    }
    // Update button to active state
    btnEl.classList.add('active');
    btnEl.removeAttribute('onclick');
    btnEl.title = 'Immortal';
    // Update footer
    const footer = card.querySelector('.item-footer');
    if (footer) {
      const timeSpan = footer.querySelector('.item-time');
      if (timeSpan) {
        timeSpan.className = 'item-time immortal-time';
        timeSpan.innerHTML = '<svg class="icon-infinite-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path class="infinity-path" d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg> Immortal';
      }
    }
    // Add immortal class after burst
    setTimeout(() => { card.classList.add('immortal'); }, 600);
    setTimeout(() => { card.classList.remove('immortal-burst'); }, 1600);
  } catch (err) {
    console.error('Immortal failed:', err);
  }
};

// Modal handling
const textModal = document.getElementById('text-modal');
let modalTextarea = document.getElementById('modal-textarea');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalCopyBtn = document.getElementById('modal-copy-btn');
const modalEditBtn = document.getElementById('modal-edit-btn');
let modalEditingId = null;

window.openTextModal = function(id){
  const item = items.find(i => i.id === id);
  if(!item) return;
  modalEditingId = id;
  modalTextarea = document.getElementById('modal-textarea');
  if (modalTextarea) {
    try { modalTextarea.style.display = 'none'; } catch (e) { /* ignore if removed */ }
  }
  const body = document.querySelector('.text-modal-body');
  body.innerHTML = '';
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.id = 'modal-preview';
  preview.textContent = item.content || '';
  body.appendChild(preview);
  textModal.classList.remove('hidden');
  modalSaveBtn.disabled = true;
  lockBody();
}

window.openYouTubePopup = function(videoId){
  // Create popup container if it doesn't exist
  let popup = document.getElementById('youtube-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'youtube-popup';
    popup.className = 'youtube-popup';
    popup.innerHTML = `
      <div class="youtube-popup-backdrop"></div>
      <div class="youtube-popup-dialog">
        <button class="youtube-popup-close" onclick="closeYouTubePopup()">✕</button>
        <div class="youtube-video-container">
          <iframe 
            src="https://www.youtube.com/embed/${videoId}?autoplay=1"
            title="YouTube video player"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
          </iframe>
        </div>
      </div>
    `;
    document.body.appendChild(popup);
    
    // Add click outside to close (on backdrop)
    popup.addEventListener('click', function(e) {
      if (e.target === popup) {
        closeYouTubePopup();
      }
    });
  }
  
  // Update the video source
  const iframe = popup.querySelector('.youtube-video-container iframe');
  if (iframe) {
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  }
  
  popup.style.display = 'flex';
  lockBody();
}

window.closeYouTubePopup = function(){
  const popup = document.getElementById('youtube-popup');
  if (popup) {
    popup.style.display = 'none';
    // Stop the video by clearing the src
    const iframe = popup.querySelector('iframe');
    if (iframe) {
      iframe.src = '';
    }
    unlockBody();
  }
}

function closeTextModal(){
  const body = document.querySelector('.text-modal-body');
  const panel = document.querySelector('.text-modal-panel');
  if (modalCopyBtn) modalCopyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  if (modalSaveBtn) modalSaveBtn.disabled = true;
  if (panel) {
    gsap.to(panel, {
      opacity: 0, y: 12, scale: 0.99,
      duration: 0.2, ease: 'power2.in',
      onComplete: () => {
        if (body) body.innerHTML = '<textarea id="modal-textarea" rows="12"></textarea>';
        textModal.classList.add('hidden');
        gsap.set(panel, { clearProps: 'all' });
        modalEditingId = null;
        unlockBody();
      }
    });
  } else {
    if (body) body.innerHTML = '<textarea id="modal-textarea" rows="12"></textarea>';
    textModal.classList.add('hidden');
    modalEditingId = null;
    unlockBody();
  }
}

modalCloseBtn.addEventListener('click', closeTextModal);

modalCopyBtn.addEventListener('click', async ()=>{
  try{
    const preview = document.getElementById('modal-preview');
    const text = preview ? preview.textContent : (modalTextarea ? modalTextarea.value : '');
    await navigator.clipboard.writeText(text);
    modalCopyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; setTimeout(()=>modalCopyBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',1200);
  } catch(e){ console.error(e); }
});

async function saveModalText(){
  if(!modalEditingId) return;
  const ta = document.getElementById('modal-textarea');
  const updated = ta ? ta.value : '';

  // Close modal instantly before API calls so Firebase re-renders happen after modal is gone
  const body = document.querySelector('.text-modal-body');
  if (body) body.innerHTML = '<textarea id="modal-textarea" rows="12"></textarea>';
  if (modalCopyBtn) modalCopyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  if (modalSaveBtn) modalSaveBtn.disabled = true;
  const savedId = modalEditingId;
  modalEditingId = null;
  textModal.classList.add('hidden');
  unlockBody();

  try{
    const res = await fetch('/api/text', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content: updated }) });
    if(res.ok){
      await fetch(`/api/items/${savedId}`, { method: 'DELETE' }).catch(()=>{});
    }
  }catch(e){ console.error('Save text failed', e); }
}

modalSaveBtn.addEventListener('click', saveModalText);

function enterEditMode(){
  const preview = document.getElementById('modal-preview');
  const body = document.querySelector('.text-modal-body');
  // Replace preview with textarea but keep same sizing
  body.innerHTML = '<textarea id="modal-textarea" rows="12"></textarea>';
  const ta = document.getElementById('modal-textarea');
  ta.style.height = '100%';
  ta.style.boxSizing = 'border-box';
  ta.value = preview ? preview.textContent : '';
  ta.focus();
  modalSaveBtn.disabled = false;
}

modalEditBtn.addEventListener('click', ()=>{ enterEditMode(); });

// Keyboard shortcuts: Esc to close, Ctrl/Cmd+S to save, Ctrl/Cmd+C to copy
document.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape') {
    const popup = document.getElementById('youtube-popup');
    if (popup && popup.style.display !== 'none') { closeYouTubePopup(); return; }
    const keypad = document.getElementById('keypad-overlay');
    if (keypad) { keypad.remove(); unlockBody(); return; }
    if (extendDialogEl) { closeExtendDialog(); return; }
    if (!textModal.classList.contains('hidden')) { closeTextModal(); }
    return;
  }
  if (textModal.classList.contains('hidden')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveModalText();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    const ta = document.getElementById('modal-textarea');
    if (!ta || document.activeElement !== ta) {
      e.preventDefault();
      modalCopyBtn.click();
    }
  }
});

// URL detection functions
function extractUrls(text) {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  return [...text.matchAll(urlPattern)].map(match => match[0]);
}

function extractYouTubeUrls(text) {
  const youtubePattern = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([^&\s]+)|https?:\/\/youtu\.be\/([^&\s?]+)/g;
  const matches = [...text.matchAll(youtubePattern)];
  return matches.map(match => ({
    fullUrl: match[0],
    videoId: match[1] || match[2]
  }));
}

function renderTextWithLinks(text) {
  // Just escape HTML to prevent XSS, don't modify content
  return escapeHtml(text);
}

function escapeHtml(str){ const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

function formatFileSize(bytes){ if(!bytes) return '0 B'; const units=['B','KB','MB','GB']; const i=Math.floor(Math.log(bytes)/Math.log(1024)); return (bytes/Math.pow(1024,i)).toFixed(i===0?0:1)+' '+units[i]; }

function getTimeLeft(expiresAt){ const ms = expiresAt - Date.now(); if(ms<=0) return 'Expired'; const mins = Math.floor(ms/60000); if(mins>=60) return `${Math.floor(mins/60)}h ${mins%60}m left`; return `${mins}m left`; }

function formatSize(chars){ return typeof chars === 'number' ? chars.toLocaleString() : chars; }

// --- Extend TTL Time Picker ---
let extendDialogEl = null;
let extendItemId = null;

window.openExtendDialog = function(itemId, btnEl) {
  closeExtendDialog();
  extendItemId = itemId;

  const card = btnEl.closest('.item-card');
  const cardRect = card.getBoundingClientRect();

  const dialog = document.createElement('div');
  dialog.className = 'extend-dialog';
  dialog.innerHTML = `
    <div class="extend-dialog-header">Extend Time</div>
    <div class="extend-picker">
      <div class="extend-column" data-type="hours">
        <div class="extend-column-label">Hours</div>
        <div class="extend-scroll-wrap">
          <div class="extend-scroll">
            <div class="extend-scroll-spacer"></div>
            ${Array.from({length: 24}, (_, i) => `<div class="extend-option" data-value="${i}">${String(i).padStart(2,'0')}</div>`).join('')}
            <div class="extend-scroll-spacer"></div>
          </div>
        </div>
      </div>
      <div class="extend-separator">:</div>
      <div class="extend-column" data-type="minutes">
        <div class="extend-column-label">Minutes</div>
        <div class="extend-scroll-wrap">
          <div class="extend-scroll">
            <div class="extend-scroll-spacer"></div>
            ${Array.from({length: 60}, (_, i) => `<div class="extend-option" data-value="${i}">${String(i).padStart(2,'0')}</div>`).join('')}
            <div class="extend-scroll-spacer"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="extend-actions">
      <button class="btn extend-cancel">Cancel</button>
      <button class="btn btn-primary extend-confirm">Extend</button>
    </div>
  `;

  // Position the dialog near the card
  const top = cardRect.bottom + window.scrollY + 8;
  let left = cardRect.left + window.scrollX;
  // Clamp so it doesn't overflow viewport
  const dialogWidth = 240;
  if (left + dialogWidth > window.innerWidth - 16) {
    left = window.innerWidth - dialogWidth - 16;
  }
  if (left < 8) left = 8;
  dialog.style.top = top + 'px';
  dialog.style.left = left + 'px';

  document.body.appendChild(dialog);
  extendDialogEl = dialog;
  lockBody();

  // Setup scroll snapping and mouse drag
  const scrolls = dialog.querySelectorAll('.extend-scroll');
  scrolls.forEach(scroll => {
    // Initial scroll to 0 (first item selected)
    requestAnimationFrame(() => {
      scroll.scrollTop = 0;
      updateSelected(scroll);
    });
    scroll.addEventListener('scroll', () => {
      updateSelected(scroll);
    }, { passive: true });

    // Mouse drag scrolling
    let dragging = false;
    let startY = 0;
    let startScrollTop = 0;

    scroll.addEventListener('mousedown', (e) => {
      dragging = true;
      startY = e.clientY;
      startScrollTop = scroll.scrollTop;
      scroll.style.cursor = 'none';
      scroll.style.scrollSnapType = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', mouseDragHandler);
    document.addEventListener('mouseup', mouseUpHandler);

    function mouseDragHandler(e) {
      if (!dragging || e.target.closest('.extend-scroll') !== scroll && !scroll.contains(e.target)) return;
      const delta = startY - e.clientY;
      scroll.scrollTop = startScrollTop + delta;
    }

    function mouseUpHandler() {
      if (!dragging) return;
      dragging = false;
      scroll.style.cursor = 'none';
      scroll.style.scrollSnapType = '';
      // Re-snap after drag ends
      snapToNearest(scroll);
    }

    // Store cleanup refs
    scroll._cleanupDrag = () => {
      document.removeEventListener('mousemove', mouseDragHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
  });

  // Cancel button
  dialog.querySelector('.extend-cancel').addEventListener('click', closeExtendDialog);

  // Confirm button
  dialog.querySelector('.extend-confirm').addEventListener('click', async () => {
    const hoursScroll = dialog.querySelector('[data-type="hours"] .extend-scroll');
    const minsScroll = dialog.querySelector('[data-type="minutes"] .extend-scroll');
    const hours = getSelectedValue(hoursScroll);
    const mins = getSelectedValue(minsScroll);
    if (hours === 0 && mins === 0) return;

    const confirmBtn = dialog.querySelector('.extend-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '...';

    try {
      const res = await fetch(`/api/items/${extendItemId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, minutes: mins })
      });
      if (!res.ok) throw new Error('Extend failed');
      closeExtendDialog();
    } catch (err) {
      console.error('Extend failed:', err);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Extend';
    }
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
};

function updateSelected(scroll) {
  const options = scroll.querySelectorAll('.extend-option');
  const scrollTop = scroll.scrollTop;
  const itemHeight = options[0] ? options[0].offsetHeight : 36;
  const spacerHeight = scroll.querySelector('.extend-scroll-spacer').offsetHeight;
  const centerOffset = scroll.clientHeight / 2 - itemHeight / 2;
  const selectedIndex = Math.round((scrollTop - spacerHeight + centerOffset) / itemHeight);
  const clamped = Math.max(0, Math.min(selectedIndex, options.length - 1));
  options.forEach((opt, i) => {
    opt.classList.toggle('selected', i === clamped);
  });
}

function snapToNearest(scroll) {
  const options = scroll.querySelectorAll('.extend-option');
  if (!options.length) return;
  const itemHeight = options[0].offsetHeight;
  const spacerHeight = scroll.querySelector('.extend-scroll-spacer').offsetHeight;
  const centerOffset = scroll.clientHeight / 2 - itemHeight / 2;
  const nearestIndex = Math.round((scroll.scrollTop - spacerHeight + centerOffset) / itemHeight);
  const clamped = Math.max(0, Math.min(nearestIndex, options.length - 1));
  const targetScroll = spacerHeight + clamped * itemHeight - centerOffset;
  scroll.scrollTo({ top: targetScroll, behavior: 'smooth' });
}

function getSelectedValue(scroll) {
  const options = scroll.querySelectorAll('.extend-option');
  const scrollTop = scroll.scrollTop;
  const itemHeight = options[0] ? options[0].offsetHeight : 36;
  const spacerHeight = scroll.querySelector('.extend-scroll-spacer').offsetHeight;
  const centerOffset = scroll.clientHeight / 2 - itemHeight / 2;
  const idx = Math.round((scrollTop - spacerHeight + centerOffset) / itemHeight);
  const clamped = Math.max(0, Math.min(idx, options.length - 1));
  return parseInt(options[clamped]?.dataset.value ?? '0', 10);
}

function handleOutsideClick(e) {
  if (extendDialogEl && !extendDialogEl.contains(e.target) && !e.target.closest('.extend-btn')) {
    closeExtendDialog();
  }
}

function closeExtendDialog() {
  document.removeEventListener('click', handleOutsideClick);
  if (extendDialogEl) {
    extendDialogEl.querySelectorAll('.extend-scroll').forEach(s => {
      if (s._cleanupDrag) s._cleanupDrag();
    });
    extendDialogEl.remove();
    extendDialogEl = null;
    extendItemId = null;
    unlockBody();
  }
}

function initParticles() {
  const container = document.getElementById('particles-bg');
  if (!container) return;
  const count = 100;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const size = 2 + Math.random() * 7;
    const duration = 18 + Math.random() * 22;
    el.style.cssText = `
      left:${Math.random() * 100}%;width:${size}px;height:${size}px;
      animation-duration:${duration}s;
      animation-delay:${Math.random() * 10}s;
      --dx:${(Math.random() - 0.5) * 40}vw;
      --dy:${-100 - Math.random() * 40}vh;
      --o:${0.3 + Math.random() * 0.7};
    `;
    container.appendChild(el);
  }
}
initParticles();

setInterval(()=>{ try{ renderItems(); }catch(e){} },30000);
