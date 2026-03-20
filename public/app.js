// public/app.js — main client script for Echochamber
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js';

let db;
let items = [];
let myIp = null; // Will be set from server

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
    const allItems = Object.values(data);
    const now = Date.now();
    
    // ROOM SCOPING: Match roomId exactly with what server detected
    items = allItems
      .filter(i => i.expiresAt > now && (i.roomId === myIp))
      .sort((a, b) => b.createdAt - a.createdAt);
    
    renderItems();
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

shareTextBtn.addEventListener('click', shareText);
textInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) shareText();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) uploadFiles(fileInput.files);
  fileInput.value = '';
});

async function shareText(){
  const content = textInput.value.trim();
  if(!content) return;
  shareTextBtn.disabled = true;
  
  // "Eating" animation: collapse the textarea
  textInput.style.transition = 'all 0.4s cubic-bezier(0.64, 0, 0.78, 0)';
  textInput.style.transform = 'scaleY(0.1) translateY(-20px)';
  textInput.style.opacity = '0';
  textInput.style.filter = 'blur(10px)';
  
  try{
    const res = await fetch('/api/text', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content})
    });
    if(res.ok) {
        // Wait for animation to finish before clearing
        setTimeout(() => {
          textInput.value = '';
          textInput.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          textInput.style.transform = 'scaleY(1) translateY(0)';
          textInput.style.opacity = '1';
          textInput.style.filter = 'none';
        }, 400);
        
        const newItem = await res.json();
        if (!myIp) myIp = newItem.roomId;
    } else {
      // Reset if failed
      textInput.style.transform = 'none';
      textInput.style.opacity = '1';
      textInput.style.filter = 'none';
    }
  }catch(err){
    console.error('Failed to share text:', err);
    textInput.style.transform = 'none';
    textInput.style.opacity = '1';
    textInput.style.filter = 'none';
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
document.addEventListener('dragenter',(e)=>{ e.preventDefault(); dragCounter++; dragOverlay.classList.remove('hidden'); });
document.addEventListener('dragleave',(e)=>{ e.preventDefault(); dragCounter--; if(dragCounter===0) dragOverlay.classList.add('hidden'); });
document.addEventListener('dragover',(e)=>{ e.preventDefault(); });
document.addEventListener('drop',(e)=>{ e.preventDefault(); dragCounter=0; dragOverlay.classList.add('hidden'); if(e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); });

function renderItems(newItems){
  const oldItems = [...items];
  if(newItems !== undefined) items = newItems;
  itemCount.textContent = items.length ? `(${items.length})` : '';
  
  const hasItems = items.length > 0;
  emptyState.classList.toggle('hidden', hasItems);
  
  // Use View Transitions API if available for smooth layout morphing
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      syncDom(oldItems, items);
    });
  } else {
    syncDom(oldItems, items);
  }
}

function syncDom(oldItems, newItems) {
  const oldIds = new Set(oldItems.map(i => i.id));
  const newIds = new Set(newItems.map(i => i.id));
  
  // Remove items that are no longer present
  Array.from(itemsGrid.children).forEach(child => {
    const id = child.getAttribute('data-id');
    if (!newIds.has(id)) {
      // If it's already marked as deleting, we let that animation handle it
      if (child.classList.contains('deleting')) return;

      child.style.transform = 'scale(0.8) translateY(20px)';
      child.style.opacity = '0';
      setTimeout(() => child.remove(), 300);
    }
  });

  // Update or Add items
  newItems.forEach((item, index) => {
    let existing = itemsGrid.querySelector(`[data-id="${item.id}"]`);
    const cardHtml = item.type === 'text' ? renderTextCard(item) : renderFileCard(item);
    
    if (existing) {
      // Update existing content if needed (e.g. time left)
      // We do a lightweight update to avoid flickering
      const footer = existing.querySelector('.item-footer');
      if (footer) {
        const timeLeft = getTimeLeft(item.expiresAt);
        const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
        footer.innerHTML = `
          <span class="item-time ${expiresSoon ? 'expires-soon' : ''}">⏱ ${timeLeft}</span>
          ${item.type === 'text' ? `<span class="item-time">${formatSize(item.size || item.content.length)} chars</span>` : ''}
        `;
      }
    } else {
      // Create new element
      const temp = document.createElement('div');
      temp.innerHTML = cardHtml.trim();
      const newElem = temp.firstChild;
      
      // Set view-transition-name for the browser to track this specific card
      newElem.style.viewTransitionName = `card-${item.id}`;
      
      // If it's the very first render or we are adding to the top
      if (index === 0) {
        itemsGrid.prepend(newElem);
      } else {
        const children = itemsGrid.children;
        if (children[index]) {
          itemsGrid.insertBefore(newElem, children[index]);
        } else {
          itemsGrid.appendChild(newElem);
        }
      }
      
      // Trigger entrance animation for new element
      newElem.style.animation = 'bounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
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
      urlButtons += `<button class="url-btn" onclick="window.open('${urls[0]}', '_blank')" title="Open Link">🔗</button>`;
    }
    
    // Add YouTube play button for first YouTube URL (if any)
    if (youtubeUrls.length > 0) {
      urlButtons += `<button class="youtube-btn" onclick="openYouTubePopup('${youtubeUrls[0].videoId}')" title="Play YouTube Video">▶️</button>`;
    }
    
    urlButtons += '</div>';
  }
  
  return `
    <div class="item-card text" data-id="${item.id}" style="view-transition-name: card-${item.id}">
      <div class="item-header">
        <span class="item-type text">📝 Text</span>
        <div class="item-actions">
          <button class="btn-icon" onclick="copyText('${item.id}')" title="Copy">📋</button>
          <button class="btn-icon" onclick="openTextModal('${item.id}')" title="View">👁</button>
          ${urlButtons}
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

function renderFileCard(item){
  const timeLeft = getTimeLeft(item.expiresAt);
  const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
  const optimisticNote = item.optimistic ? '<div class="optimistic">Uploading...</div>' : '';
  return `
    <div class="item-card file" data-id="${item.id}" style="view-transition-name: card-${item.id}">
      <div class="item-header">
        <span class="item-type file">📎 File</span>
        <div class="item-actions">
          <button class="btn-icon delete" onclick="deleteItem('${item.id}')" title="Delete">✕</button>
        </div>
      </div>
      <div class="file-name">${escapeHtml(item.originalName)}</div>
      <div class="file-size">${formatFileSize(item.size)}</div>
      <button class="btn-download" onclick="downloadFile('${item.id}','${escapeHtml(item.originalName)}')">⬇ Download</button>
      ${optimisticNote}
      <div class="item-footer">
        <span class="item-time ${expiresSoon ? 'expires-soon' : ''}">⏱ ${timeLeft}</span>
      </div>
    </div>
  `;
}

window.copyText = async function(id){
  const item = items.find(i => i.id === id);
  if(!item) return;
  try{ await navigator.clipboard.writeText(item.content); const btn = document.querySelector(`[data-id="${id}"] .btn-icon[title="Copy"]`); if(btn){ btn.textContent = '✓'; setTimeout(()=>btn.textContent='📋',1500); } }catch(err){ console.error('Copy failed:',err); }
};

window.deleteItem = async function(id){
  const card = document.querySelector(`[data-id="${id}"]`);
  if (!card) return;

  // 1. Mark as deleting - make it transparent and unclickable
  card.classList.add('deleting');
  card.style.opacity = '0.5';
  card.style.pointerEvents = 'none';
  card.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

  try {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    
    // 2. Once API responds, do the "vanish" animation
    // Note: The Firebase listener will soon call syncDom which will see 'deleting' class
    // and wait for this animation to finish or let us handle it here.
    card.style.transform = 'scale(0.1) rotate(-10deg) translateY(40px)';
    card.style.opacity = '0';
    card.style.filter = 'blur(10px)';
    
    // We let the syncDom handle the actual removal, or we can clean up here
    setTimeout(() => {
      if (card.parentNode) card.remove();
    }, 450);
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Unable to delete item. Please try again.');
    
    // Rollback
    card.classList.remove('deleting');
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
    card.style.transform = 'none';
    card.style.filter = 'none';
  }
};

window.downloadFile = function(id){ window.open(`/api/download/${id}`,'_blank'); };

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
  // Ensure the textarea exists but hide it; we'll show preview by default
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
  }
}

function closeTextModal(){
  // Reset modal content to default textarea placeholder so next open is consistent
  const body = document.querySelector('.text-modal-body');
  if (body) body.innerHTML = '<textarea id="modal-textarea" rows="12"></textarea>';
  // reset buttons and state
  if (modalCopyBtn) modalCopyBtn.textContent = '📋';
  if (modalSaveBtn) modalSaveBtn.disabled = true;
  textModal.classList.add('hidden');
  modalEditingId = null;
}

modalCloseBtn.addEventListener('click', closeTextModal);

modalCopyBtn.addEventListener('click', async ()=>{
  try{
    const preview = document.getElementById('modal-preview');
    const text = preview ? preview.textContent : (modalTextarea ? modalTextarea.value : '');
    await navigator.clipboard.writeText(text);
    modalCopyBtn.textContent = '✓'; setTimeout(()=>modalCopyBtn.textContent='📋',1200);
  } catch(e){ console.error(e); }
});

async function saveModalText(){
  if(!modalEditingId) return;
  const ta = document.getElementById('modal-textarea');
  const updated = ta ? ta.value : '';
  try{
    const res = await fetch('/api/text', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content: updated }) });
    if(res.ok){
      await fetch(`/api/items/${modalEditingId}`, { method: 'DELETE' }).catch(()=>{});
      closeTextModal();
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
  if (textModal.classList.contains('hidden')) return;
  if (e.key === 'Escape') { closeTextModal(); }
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

setInterval(()=>{ try{ renderItems(); }catch(e){} },30000);
