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
  const newIds = new Set(newItems.map(i => i.id));
  
  // 1. Identify and remove cards that are no longer in the data
  // EXCEPT for cards that we just optimistically started removing
  const cards = Array.from(itemsGrid.children);
  cards.forEach(card => {
    const id = card.getAttribute('data-id');
    const isRemoving = card.getAttribute('data-removing') === 'true';
    
    if (id && !newIds.has(id)) {
      if (!isRemoving) {
        // If it's gone from data but we didn't trigger an animation yet, just remove it
        card.remove();
      } else {
        // If it's already "removing", we let the 400ms timeout handle its removal
        // or wait for the next sync cycle.
        setTimeout(() => {
          if (card.parentNode) card.remove();
        }, 500);
      }
    }
  });

  // 2. Add or Update items
  newItems.forEach((item, index) => {
    let existing = itemsGrid.querySelector(`[data-id="${item.id}"]`);
    
    if (!existing) {
      const cardHtml = item.type === 'text' ? renderTextCard(item) : renderFileCard(item);
      const temp = document.createElement('div');
      temp.innerHTML = cardHtml.trim();
      const newElem = temp.firstChild;
      
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
      
      // Entrance animation
      newElem.style.animation = 'bounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
    } else {
      // Update existing (time left)
      const footer = existing.querySelector('.item-footer');
      if (footer) {
        const timeLeft = getTimeLeft(item.expiresAt);
        const expiresSoon = (item.expiresAt - Date.now()) < 10 * 60 * 1000;
        footer.innerHTML = `
          <span class="item-time ${expiresSoon ? 'expires-soon' : ''}">⏱ ${timeLeft}</span>
          ${item.type === 'text' ? `<span class="item-time">${formatSize(item.size || item.content.length)} chars</span>` : ''}
        `;
      }
    }
  });
}

window.deleteItem = async function(id){
  const card = document.querySelector(`[data-id="${id}"]`);
  if (!card || card.getAttribute('data-removing') === 'true') return;

  // 1. Mark as removing so syncDom doesn't interfere
  card.setAttribute('data-removing', 'true');
  card.style.pointerEvents = 'none';

  // 2. Perform animation using View Transitions for the layout shift
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      card.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      card.style.transform = 'scale(0.1) rotate(-10deg) translateY(40px)';
      card.style.opacity = '0';
      card.style.filter = 'blur(10px)';
    });
  } else {
    card.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    card.style.transform = 'scale(0.1) rotate(-10deg) translateY(40px)';
    card.style.opacity = '0';
    card.style.filter = 'blur(10px)';
  }

  try {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    
    // Success: card will eventually be removed by the syncDom cleanup or timeout
    setTimeout(() => {
      if (card.parentNode) card.remove();
    }, 450);
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Unable to delete item. Please try again.');
    
    // Rollback
    card.removeAttribute('data-removing');
    card.style.pointerEvents = 'auto';
    card.style.transform = 'none';
    card.style.opacity = '1';
    card.style.filter = 'none';
  }
};

window.deleteItem = async function(id){
  const card = document.querySelector(`[data-id="${id}"]`);
  if (!card || card.getAttribute('data-removing') === 'true') return;

  // 1. Start Optimistic Removal Animation immediately
  card.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
  card.style.transform = 'scale(0.1) rotate(-10deg) translateY(40px)';
  card.style.opacity = '0';
  card.style.pointerEvents = 'none';
  card.setAttribute('data-removing', 'true');

  // Trigger a layout shift for other items immediately using View Transitions if available
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      // We don't remove from global 'items' array yet, but we want the DOM to shift
      // For now, the CSS scale/opacity is enough to make it look "gone"
    });
  }

  try {
    // 2. Call the API in the background
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    
    if (!res.ok) {
      throw new Error('Delete failed');
    }
    // Success: The Firebase onValue listener will eventually trigger renderItems() 
    // and syncDom() which will officially remove the element from the DOM.
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Unable to delete item. Please try again.');
    
    // 3. Rollback: Reappear the item if the API fails
    card.style.transform = 'none';
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
    card.removeAttribute('data-removing');
  }
};

window.downloadFile = function(id){ window.open(`/api/download/${id}`,'_blank'); };

function escapeHtml(str){ const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

function formatFileSize(bytes){ if(!bytes) return '0 B'; const units=['B','KB','MB','GB']; const i=Math.floor(Math.log(bytes)/Math.log(1024)); return (bytes/Math.pow(1024,i)).toFixed(i===0?0:1)+' '+units[i]; }

function getTimeLeft(expiresAt){ const ms = expiresAt - Date.now(); if(ms<=0) return 'Expired'; const mins = Math.floor(ms/60000); if(mins>=60) return `${Math.floor(mins/60)}h ${mins%60}m left`; return `${mins}m left`; }

function formatSize(chars){ return typeof chars === 'number' ? chars.toLocaleString() : chars; }

setInterval(()=>{ try{ renderItems(); }catch(e){} },30000);
