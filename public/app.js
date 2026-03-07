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
  
  // Show loading state while waiting for the first value
  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  itemsGrid.classList.add('hidden');
  
  const itemsRef = ref(db, 'items');
  onValue(itemsRef, (snapshot) => {
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
  try{
    const res = await fetch('/api/text', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content})
    });
    if(res.ok) {
        textInput.value = '';
        const newItem = await res.json();
        // If we didn't have myIp yet, set it now
        if (!myIp) myIp = newItem.roomId;
    }
  }catch(err){
    console.error('Failed to share text:', err);
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
  if(newItems !== undefined) items = newItems;
  itemCount.textContent = items.length ? `(${items.length})` : '';
  emptyState.classList.toggle('hidden', items.length > 0);
  itemsGrid.innerHTML = items.map(item => {
    if(item.type === 'text') return renderTextCard(item);
    if(item.type === 'file') return renderFileCard(item);
    return '';
  }).join('');
}

function renderTextCard(item){
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

function renderFileCard(item){
  const timeLeft = getTimeLeft(item.expiresAt);
  const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
  const optimisticNote = item.optimistic ? '<div class="optimistic">Uploading...</div>' : '';
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
  try{ await fetch(`/api/items/${id}`,{method:'DELETE'}); }catch(err){ console.error('Delete failed:',err); }
};

window.downloadFile = function(id){ window.open(`/api/download/${id}`,'_blank'); };

function escapeHtml(str){ const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

function formatFileSize(bytes){ if(!bytes) return '0 B'; const units=['B','KB','MB','GB']; const i=Math.floor(Math.log(bytes)/Math.log(1024)); return (bytes/Math.pow(1024,i)).toFixed(i===0?0:1)+' '+units[i]; }

function getTimeLeft(expiresAt){ const ms = expiresAt - Date.now(); if(ms<=0) return 'Expired'; const mins = Math.floor(ms/60000); if(mins>=60) return `${Math.floor(mins/60)}h ${mins%60}m left`; return `${mins}m left`; }

function formatSize(chars){ return typeof chars === 'number' ? chars.toLocaleString() : chars; }

setInterval(()=>{ try{ renderItems(); }catch(e){} },30000);
