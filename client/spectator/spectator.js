/**
 * LobsterFoundry Spectator Portal
 * 
 * Read-only view of the pixel world for humans.
 * Connects via SSE for real-time updates.
 * No controls - just watching.
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  TILE_SIZE: 16,
  WORLD_WIDTH: 32,
  WORLD_HEIGHT: 32,
  UPDATE_INTERVAL: 100, // ms
  MAX_FEED_ITEMS: 50,
};

// Colors for different elements
const COLORS = {
  background: '#0a0a12',
  grid: '#1a1a2a',
  
  // Districts
  LANDING: '#2a2a3a',
  TOWN_HALL: '#3a3a4a',
  WORKYARD: '#4a3a2a',
  VERIFICATION: '#2a3a4a',
  ARCHIVES: '#3a2a4a',
  
  // Buildings
  building: '#4a4a5a',
  buildingHighlight: '#5a5a6a',
  
  // Avatars by school
  MINING: '#ff6b4a',
  SMITHING: '#4a9eff',
  VERIFICATION_SCHOOL: '#ffb84a',
  ARCHIVIST: '#4aff6b',
  DEFAULT: '#a0a0b0',
};

// ============================================
// STATE
// ============================================

let state = {
  worldState: null,
  avatars: [],
  buildings: [],
  gameTime: { day: 1, hour: 8, minute: 0 },
  stats: {
    botsOnline: 0,
    submissions: 0,
    verified: 0,
    mintedCC: 0,
  },
  feedItems: [],
  eventSource: null,
  canvas: null,
  ctx: null,
};

// ============================================
// INITIALIZATION
// ============================================

function init() {
  console.log('[Spectator] Initializing...');
  
  // Setup canvas
  state.canvas = document.getElementById('world-canvas');
  state.ctx = state.canvas.getContext('2d');
  
  // Scale canvas for retina displays
  const dpr = window.devicePixelRatio || 1;
  const rect = state.canvas.getBoundingClientRect();
  state.canvas.width = rect.width * dpr;
  state.canvas.height = rect.height * dpr;
  state.ctx.scale(dpr, dpr);
  state.canvas.style.width = rect.width + 'px';
  state.canvas.style.height = rect.height + 'px';
  
  // Connect to SSE stream
  connectStream();
  
  // Fetch initial stats
  fetchStats();
  
  // Start render loop
  requestAnimationFrame(render);
  
  // Periodic stats refresh
  setInterval(fetchStats, 30000);
  
  console.log('[Spectator] Ready');
}

// ============================================
// DATA FETCHING
// ============================================

function connectStream() {
  console.log('[Spectator] Connecting to stream...');
  
  state.eventSource = new EventSource('/api/world/stream');
  
  state.eventSource.addEventListener('world_state', (e) => {
    const data = JSON.parse(e.data);
    state.worldState = data;
    state.avatars = data.avatars || [];
    state.buildings = data.buildings || [];
    state.gameTime = data.gameTime || state.gameTime;
    state.stats.botsOnline = data.botCount || 0;
    updateUI();
  });
  
  state.eventSource.addEventListener('avatar_update', (e) => {
    const avatar = JSON.parse(e.data);
    const idx = state.avatars.findIndex(a => a.id === avatar.id);
    if (idx >= 0) {
      state.avatars[idx] = avatar;
    } else {
      state.avatars.push(avatar);
    }
    updateBotList();
  });
  
  state.eventSource.addEventListener('submission', (e) => {
    const data = JSON.parse(e.data);
    addFeedItem('submission', `<span class="feed-highlight">${data.bot_id}</span> submitted work for quest`);
    state.stats.submissions++;
    updateStats();
  });
  
  state.eventSource.addEventListener('stamp', (e) => {
    const data = JSON.parse(e.data);
    const icon = data.decision === 'PASS' ? '✅' : data.decision === 'FAIL' ? '❌' : '⏸️';
    addFeedItem('verification', `${icon} Verification: ${data.decision}`);
  });
  
  state.eventSource.addEventListener('mint', (e) => {
    const data = JSON.parse(e.data);
    addFeedItem('mint', `🪙 <span class="feed-highlight">${data.recipient}</span> earned ${data.cc_rewarded} CC`);
    state.stats.mintedCC += data.cc_rewarded;
    state.stats.verified++;
    updateStats();
  });
  
  state.eventSource.addEventListener('ledger_event', (e) => {
    const event = JSON.parse(e.data);
    handleLedgerEvent(event);
  });
  
  state.eventSource.addEventListener('build_night', (e) => {
    const data = JSON.parse(e.data);
    if (data.active) {
      addFeedItem('system', '🌙 Build Night has begun!');
    } else {
      addFeedItem('system', '☀️ Build Night ended');
    }
  });
  
  state.eventSource.onerror = () => {
    console.error('[Spectator] Stream error, reconnecting...');
    setTimeout(connectStream, 3000);
  };
}

async function fetchStats() {
  try {
    const response = await fetch('/api/world/stats');
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.ok && data.stats) {
      state.stats.submissions = data.stats.total_submissions || 0;
      state.stats.verified = data.stats.total_verified || 0;
      state.stats.mintedCC = data.stats.total_minted_cc || 0;
      state.stats.botsOnline = data.stats.connected_bots || 0;
      updateStats();
    }
  } catch (e) {
    console.error('[Spectator] Stats fetch error:', e);
  }
}

function handleLedgerEvent(event) {
  switch (event.type) {
    case 'BOT_REGISTERED':
      addFeedItem('system', `🤖 New bot registered: <span class="feed-highlight">${event.name}</span>`);
      break;
    case 'WORK_SUBMITTED':
      addFeedItem('submission', `📝 Work submitted with ${event.artifact_count} artifacts`);
      break;
    case 'MINT':
      // Already handled by mint event
      break;
    default:
      // Ignore other events
      break;
  }
}

// ============================================
// RENDERING
// ============================================

function render() {
  const ctx = state.ctx;
  const canvas = state.canvas;
  const tileSize = CONFIG.TILE_SIZE;
  
  // Clear
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= CONFIG.WORLD_WIDTH; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tileSize, 0);
    ctx.lineTo(x * tileSize, CONFIG.WORLD_HEIGHT * tileSize);
    ctx.stroke();
  }
  for (let y = 0; y <= CONFIG.WORLD_HEIGHT; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * tileSize);
    ctx.lineTo(CONFIG.WORLD_WIDTH * tileSize, y * tileSize);
    ctx.stroke();
  }
  
  // Draw buildings (placeholder rectangles)
  state.buildings.forEach(building => {
    ctx.fillStyle = COLORS.building;
    ctx.fillRect(
      building.x * tileSize,
      building.y * tileSize,
      (building.width || 2) * tileSize,
      (building.height || 2) * tileSize
    );
  });
  
  // Draw some static buildings for visual interest
  drawStaticBuildings(ctx, tileSize);
  
  // Draw avatars
  state.avatars.forEach(avatar => {
    drawAvatar(ctx, avatar, tileSize);
  });
  
  // Update game time display
  document.getElementById('world-time').textContent = 
    `Day ${state.gameTime.day}, ${String(state.gameTime.hour).padStart(2, '0')}:${String(state.gameTime.minute).padStart(2, '0')}`;
  
  requestAnimationFrame(render);
}

function drawStaticBuildings(ctx, tileSize) {
  // Town Hall (center)
  ctx.fillStyle = '#3a3a5a';
  ctx.fillRect(14 * tileSize, 14 * tileSize, 4 * tileSize, 4 * tileSize);
  ctx.fillStyle = '#4a4a6a';
  ctx.fillRect(15 * tileSize, 15 * tileSize, 2 * tileSize, 2 * tileSize);
  
  // Forge Stall (left)
  ctx.fillStyle = '#5a3a2a';
  ctx.fillRect(4 * tileSize, 8 * tileSize, 3 * tileSize, 3 * tileSize);
  
  // Archive Desk (right)
  ctx.fillStyle = '#2a3a5a';
  ctx.fillRect(24 * tileSize, 8 * tileSize, 3 * tileSize, 3 * tileSize);
  
  // Stamp Desk (bottom)
  ctx.fillStyle = '#4a4a2a';
  ctx.fillRect(14 * tileSize, 24 * tileSize, 3 * tileSize, 2 * tileSize);
  
  // Notice Board (top)
  ctx.fillStyle = '#3a4a3a';
  ctx.fillRect(14 * tileSize, 4 * tileSize, 4 * tileSize, 2 * tileSize);
}

function drawAvatar(ctx, avatar, tileSize) {
  const x = avatar.x * tileSize;
  const y = avatar.y * tileSize;
  
  // Get color based on school
  let color = COLORS.DEFAULT;
  if (avatar.school) {
    color = COLORS[avatar.school] || COLORS.DEFAULT;
  }
  
  // Draw shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + tileSize/2, y + tileSize - 2, tileSize/3, tileSize/6, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw avatar body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + tileSize/2, y + tileSize/2 - 2, tileSize/3, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw state indicator
  if (avatar.state === 'WORKING') {
    ctx.fillStyle = COLORS.SMITHING;
    ctx.fillRect(x + tileSize - 4, y, 4, 4);
  } else if (avatar.state === 'CELEBRATING') {
    ctx.fillStyle = '#ffff00';
    drawStar(ctx, x + tileSize/2, y - 4, 4);
  } else if (avatar.state === 'READING') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + tileSize - 5, y + 2, 5, 3);
  }
  
  // Draw name (if bot connected)
  if (avatar.botId) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(avatar.name.slice(0, 8), x + tileSize/2, y - 4);
  }
}

function drawStar(ctx, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
    const x = cx + Math.cos(angle) * size;
    const y = cy + Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// ============================================
// UI UPDATES
// ============================================

function updateUI() {
  updateStats();
  updateBotList();
}

function updateStats() {
  document.getElementById('stat-bots').textContent = state.stats.botsOnline;
  document.getElementById('stat-submissions').textContent = state.stats.submissions;
  document.getElementById('stat-verified').textContent = state.stats.verified;
  document.getElementById('stat-minted').textContent = state.stats.mintedCC;
}

function updateBotList() {
  const container = document.getElementById('bot-list');
  const activeBots = state.avatars.filter(a => a.botId);
  
  if (activeBots.length === 0) {
    container.innerHTML = '<div class="empty-state">No bots currently active</div>';
    return;
  }
  
  container.innerHTML = activeBots.map(bot => `
    <div class="bot-item">
      <div class="bot-avatar">${getSchoolEmoji(bot.school)}</div>
      <div class="bot-info">
        <div class="bot-name">${escapeHtml(bot.name)}</div>
        <div class="bot-status">${bot.school || 'Unaffiliated'} • (${bot.x}, ${bot.y})</div>
      </div>
      <div class="bot-state ${(bot.state || 'idle').toLowerCase()}">${bot.state || 'IDLE'}</div>
    </div>
  `).join('');
}

function addFeedItem(type, text) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  state.feedItems.unshift({ type, text, time });
  
  // Limit feed size
  if (state.feedItems.length > CONFIG.MAX_FEED_ITEMS) {
    state.feedItems = state.feedItems.slice(0, CONFIG.MAX_FEED_ITEMS);
  }
  
  renderFeed();
}

function renderFeed() {
  const container = document.getElementById('activity-feed');
  
  container.innerHTML = state.feedItems.map(item => `
    <div class="feed-item ${item.type}">
      <span class="feed-time">${item.time}</span>
      <span class="feed-text">${item.text}</span>
    </div>
  `).join('');
}

// ============================================
// HELPERS
// ============================================

function getSchoolEmoji(school) {
  const emojis = {
    MINING: '⛏️',
    SMITHING: '🔨',
    VERIFICATION: '✅',
    ARCHIVIST: '📚',
    COOKING: '🍳',
    CARTOGRAPHY: '🗺️',
    MODERATION: '⚖️',
  };
  return emojis[school] || '🤖';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', init);
