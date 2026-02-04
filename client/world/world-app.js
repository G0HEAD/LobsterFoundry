/**
 * LobsterFoundry Pixel World - Main Application
 * Entry point for the pixel world client
 */

class WorldApp {
  constructor() {
    this.initialized = false;
    this.isSpectatorMode = true; // Default to spectator mode for humans
    this.viewerCount = 0;
    
    // DOM elements
    this.elements = {};
  }

  /**
   * Initialize the application
   */
  async init() {
    console.log('[WorldApp] Initializing...');
    
    try {
      // Cache DOM elements
      this.cacheElements();
      console.log('[WorldApp] DOM elements cached');

      // Ensure TV screen aligns to canvas size
      this.syncScreenToCanvas();
      
      // Initialize world terrain first (uses constants)
      worldState.initTerrain();
      console.log('[WorldApp] World terrain initialized');
      
      // Initialize tileset
      await tilesetManager.init();
      console.log('[WorldApp] Tileset initialized, tiles:', tilesetManager.tileCache.size);
      
      // Initialize renderer
      if (!worldRenderer.init()) {
        console.error('[WorldApp] Failed to initialize renderer');
        this.showError('Failed to initialize renderer - canvas not found');
        return;
      }
      console.log('[WorldApp] Renderer initialized');
      
      // Spawn demo avatars (3 for testing)
      this.spawnDemoAvatars();
      console.log('[WorldApp] Demo avatars spawned:', worldState.avatars.size);
      
      // Set up event listeners
      this.setupEventListeners();
      console.log('[WorldApp] Event listeners set up');
      
      // Connect spectator stream (don't wait for it)
      this.connectSpectatorStream();
      
      // Force initial render
      worldRenderer.invalidateTerrain();
      worldRenderer.invalidateBuildings();
      
      // Start game loop
      gameLoop.start();
      console.log('[WorldApp] Game loop started');
      
      // Update UI
      this.updateUI();
      
      this.initialized = true;
      console.log('[WorldApp] Initialized successfully');
      
      // Update ticker
      if (this.elements.eventTicker) {
        this.elements.eventTicker.textContent = 'Broadcast active - watching the Foundry...';
      }
      
    } catch (error) {
      console.error('[WorldApp] Initialization error:', error);
      this.showError('Initialization failed: ' + error.message);
    }
  }
  
  /**
   * Show error message on screen
   */
  showError(message) {
    console.error('[WorldApp] Error:', message);
    
    // Update ticker
    const ticker = document.querySelector('[data-event-ticker]');
    if (ticker) {
      ticker.textContent = 'ERROR: ' + message;
      ticker.style.color = '#ef4444';
    }
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      // Broadcast overlay
      broadcastTitle: document.querySelector('[data-broadcast-title]'),
      viewerCount: document.querySelector('[data-viewer-count]'),
      eventTicker: document.querySelector('[data-event-ticker]'),
      
      // Info panel
      signalStatus: document.querySelector('[data-signal-status]'),
      avatarList: document.querySelector('[data-avatar-list]'),
      eventLog: document.querySelector('[data-event-log]'),
      
      // District list
      districtList: document.querySelector('.district-list'),
      
      // Dev controls
      devControls: document.querySelector('.dev-controls'),
      
      // Bot panel
      botPanel: document.getElementById('bot-panel'),
      botList: document.querySelector('[data-bot-list]'),
      botToken: document.getElementById('bot-token'),
      botConnect: document.getElementById('bot-connect'),

      // Screen + canvas sizing
      tvScreen: document.querySelector('.tv-screen-container'),
      pixelWorldContainer: document.getElementById('pixel-world-container'),
      worldCanvases: document.querySelectorAll('#pixel-world-container canvas')
    };
  }

  /**
   * Ensure TV screen matches canvas size
   */
  syncScreenToCanvas() {
    const targetSize = WORLD_CONFIG.CANVAS_SIZE;
    const { tvScreen, pixelWorldContainer, worldCanvases } = this.elements;

    if (tvScreen) {
      tvScreen.style.width = `${targetSize}px`;
      tvScreen.style.height = `${targetSize}px`;
    }

    if (pixelWorldContainer) {
      pixelWorldContainer.style.inset = '0';
      pixelWorldContainer.style.width = '100%';
      pixelWorldContainer.style.height = '100%';
    }

    if (worldCanvases && worldCanvases.length) {
      worldCanvases.forEach(canvas => {
        canvas.width = targetSize;
        canvas.height = targetSize;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      });
    }
  }

  /**
   * Spawn demo avatars for testing
   */
  spawnDemoAvatars() {
    // Create 3 demo avatars as specified
    for (let i = 0; i < 3; i++) {
      const avatar = AvatarFactory.createDemo(i);
      worldState.addAvatar(avatar);
    }
    
    console.log('[WorldApp] Demo avatars spawned');
    this.updateAvatarList();
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Dev control buttons
    document.querySelectorAll('.dev-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.handleDevAction(action);
      });
    });
    
    // District selection
    document.querySelectorAll('[data-district]').forEach(item => {
      item.addEventListener('click', (e) => {
        const districtId = e.target.dataset.district;
        this.focusDistrict(districtId);
      });
    });
    
    // Bot connection
    if (this.elements.botConnect) {
      this.elements.botConnect.addEventListener('click', () => {
        this.connectBot();
      });
    }
    
    // World state events
    worldState.on(WORLD_EVENTS.AVATAR_SPAWN, (data) => {
      this.updateAvatarList();
    });
    
    worldState.on(WORLD_EVENTS.AVATAR_DESPAWN, (data) => {
      this.updateAvatarList();
    });
    
    worldState.on(WORLD_EVENTS.LEDGER_EVENT, (data) => {
      this.addEventToLog(data.event);
      this.updateEventTicker(data.event);
    });
    
    worldState.on(WORLD_EVENTS.BUILD_NIGHT_START, () => {
      this.updateBroadcastTitle('BUILD NIGHT - Live Construction');
    });
    
    worldState.on(WORLD_EVENTS.BUILD_NIGHT_END, () => {
      this.updateBroadcastTitle('THE FOUNDRY - Build Night Stream');
    });
    
    // Keyboard shortcuts for dev
    document.addEventListener('keydown', (e) => {
      if (e.key === 'b' && e.ctrlKey) {
        e.preventDefault();
        this.toggleBotPanel();
      }
    });
  }

  /**
   * Connect to spectator stream for real-time updates
   */
  connectSpectatorStream() {
    spectatorStream.on('connected', () => {
      this.updateSignalStatus(true);
      console.log('[WorldApp] Connected to spectator stream');
    });
    
    spectatorStream.on('error', (err) => {
      this.updateSignalStatus(false);
      console.log('[WorldApp] Stream connection error (this is normal if server is still starting)');
    });
    
    spectatorStream.on('worldState', (state) => {
      // Sync world state from server
      this.syncWorldState(state);
    });
    
    spectatorStream.on('avatarUpdate', (data) => {
      let avatar = worldState.getAvatar(data.id);
      if (avatar) {
        avatar.deserialize(data);
      } else {
        // Create new avatar if not exists
        avatar = new Avatar({
          id: data.id,
          name: data.name || 'Unknown',
          x: data.x || 5,
          y: data.y || 5,
          school: data.school
        });
        worldState.addAvatar(avatar);
      }
      this.updateAvatarList();
    });
    
    spectatorStream.on('ledgerEvent', (event) => {
      worldState.processLedgerEvent(event);
      
      // Trigger visual effects based on event type
      this.handleLedgerEventVisualization(event);
    });
    
    spectatorStream.on('buildNight', (data) => {
      if (data.active) {
        worldState.startBuildNight();
      } else {
        worldState.endBuildNight();
      }
    });
    
    spectatorStream.connect();
  }

  /**
   * Handle visual effects for ledger events
   */
  handleLedgerEventVisualization(event) {
    const avatars = Array.from(worldState.avatars.values());
    const scale = WORLD_CONFIG.CANVAS_SIZE / 512; // Scale for positions
    
    switch (event.type) {
      case 'MINT': {
        // Find avatar by actor_id or pick random
        let avatar = avatars.find(a => a.name === event.actor_id);
        if (!avatar && avatars.length > 0) {
          avatar = avatars[Math.floor(Math.random() * avatars.length)];
        }
        
        if (avatar) {
          // Trigger celebration
          const offset = WORLD_CONFIG.TILE_SIZE / 2;
          worldState.triggerCelebration(avatar.x + offset, avatar.y - offset, '+1 Token!');
          avatar.performAction(WORLD_ACTIONS.CELEBRATE);
        }
        break;
      }
      
      case 'ESCROW_LOCK': {
        // Show particles at town hall area (proportional to canvas)
        worldState.spawnFloatingText('Escrow Locked', WORLD_CONFIG.CANVAS_SIZE * 0.35, WORLD_CONFIG.CANVAS_SIZE * 0.15, PALETTE.ORANGE);
        break;
      }
      
      case 'STAKE_LOCK': {
        // Verifier starts review - find a verifier avatar
        const verifier = avatars.find(a => a.school === 'VERIFICATION');
        if (verifier) {
          verifier.performAction(WORLD_ACTIONS.SUBMIT_STAMP);
        }
        break;
      }
      
      case 'STAKE_RELEASE': {
        // Verification complete
        worldState.spawnFloatingText('Verified!', WORLD_CONFIG.CANVAS_SIZE * 0.12, WORLD_CONFIG.CANVAS_SIZE * 0.45, PALETTE.GREEN);
        break;
      }
      
      case 'BLUEPRINT_EXEC': {
        // Blueprint executed - small particles at ledger wall
        const particleX = WORLD_CONFIG.CANVAS_SIZE * 0.74;
        const particleY = WORLD_CONFIG.CANVAS_SIZE * 0.82;
        for (let i = 0; i < 5; i++) {
          worldState.spawnParticle(PARTICLE_TYPES.SPARK, particleX, particleY, {
            color: PALETTE.CYAN,
            life: 800
          });
        }
        break;
      }
    }
    
    this.updateViewerCount();
  }

  /**
   * Handle dev panel actions
   */
  handleDevAction(action) {
    switch (action) {
      case 'trigger-build-night':
        if (worldState.isBuildNight) {
          worldState.endBuildNight();
        } else {
          worldState.startBuildNight();
        }
        break;
        
      case 'spawn-avatar':
        const avatarCount = worldState.avatars.size;
        const newAvatar = AvatarFactory.createDemo(avatarCount);
        worldState.addAvatar(newAvatar);
        break;
        
      case 'simulate-mint':
        this.simulateMintEvent();
        break;
        
      case 'reset-world':
        this.resetWorld();
        break;
        
      default:
        console.log('[WorldApp] Unknown dev action:', action);
    }
  }

  /**
   * Simulate a mint event (for testing)
   */
  simulateMintEvent() {
    const avatars = Array.from(worldState.avatars.values());
    if (avatars.length === 0) return;
    
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
    const offset = WORLD_CONFIG.TILE_SIZE / 2;
    
    // Trigger celebration at avatar position
    worldState.triggerCelebration(
      randomAvatar.x + offset,
      randomAvatar.y - offset,
      '+1 IRON'
    );
    
    // Add fake ledger event
    worldState.processLedgerEvent({
      id: `sim_${Date.now()}`,
      type: 'MINT',
      timestamp: new Date().toISOString(),
      actor_id: randomAvatar.name,
      tokens_minted: ['token_1']
    });
  }

  /**
   * Reset the world state
   */
  resetWorld() {
    // Clear avatars
    worldState.avatars.clear();
    
    // Clear events
    worldState.recentEvents = [];
    
    // End build night if active
    if (worldState.isBuildNight) {
      worldState.endBuildNight();
    }
    
    // Respawn demo avatars
    this.spawnDemoAvatars();
    
    // Redraw everything
    worldRenderer.invalidateTerrain();
    worldRenderer.invalidateBuildings();
    
    // Update UI
    this.updateUI();
    
    console.log('[WorldApp] World reset');
  }

  /**
   * Focus camera on a district
   */
  focusDistrict(districtId) {
    // Update UI highlighting
    document.querySelectorAll('[data-district]').forEach(item => {
      item.classList.toggle('active', item.dataset.district === districtId);
    });
    
    const district = DISTRICTS[districtId.toUpperCase()];
    if (district) {
      console.log(`[WorldApp] Focused on district: ${district.name}`);
      // Future: animate camera to district center
    }
  }

  /**
   * Toggle bot panel visibility
   */
  toggleBotPanel() {
    if (this.elements.botPanel) {
      this.elements.botPanel.classList.toggle('hidden');
    }
  }

  /**
   * Connect an OpenClaw bot
   */
  async connectBot() {
    const token = this.elements.botToken?.value;
    if (!token) {
      alert('Please enter a bot token');
      return;
    }
    
    try {
      // Authenticate
      const authResult = await botConnection.authenticate(token);
      console.log('[WorldApp] Bot authenticated:', authResult);
      
      // Connect WebSocket
      await botConnection.connect();
      
      // Create avatar for the bot
      if (authResult.assignedAvatar) {
        const avatar = AvatarFactory.createForBot(authResult.botId, {
          name: authResult.assignedAvatar.name,
          x: authResult.assignedAvatar.x || 5,
          y: authResult.assignedAvatar.y || 5
        });
        worldState.addAvatar(avatar);
      }
      
      this.updateBotList();
      
    } catch (error) {
      console.error('[WorldApp] Bot connection failed:', error);
      alert('Failed to connect bot: ' + error.message);
    }
  }

  /**
   * Sync world state from server
   */
  syncWorldState(state) {
    // Update avatars
    if (state.avatars) {
      state.avatars.forEach(avatarData => {
        let avatar = worldState.getAvatar(avatarData.id);
        if (avatar) {
          avatar.deserialize(avatarData);
        } else {
          avatar = new Avatar(avatarData);
          worldState.addAvatar(avatar);
        }
      });
    }
    
    // Update buildings
    if (state.buildings) {
      state.buildings.forEach(building => {
        worldState.buildings.set(building.id, building);
      });
      worldRenderer.invalidateBuildings();
    }
    
    this.updateUI();
  }

  /**
   * Update all UI elements
   */
  updateUI() {
    this.updateAvatarList();
    this.updateViewerCount();
  }

  /**
   * Update avatar list in sidebar
   */
  updateAvatarList() {
    if (!this.elements.avatarList) return;
    
    const avatars = Array.from(worldState.avatars.values());
    
    if (avatars.length === 0) {
      this.elements.avatarList.innerHTML = '<div class="avatar-placeholder">No avatars active</div>';
      return;
    }
    
    this.elements.avatarList.innerHTML = avatars.map(avatar => `
      <div class="avatar-card">
        <div class="avatar-sprite" style="background: ${avatar.color}"></div>
        <div class="avatar-info">
          <div class="avatar-name">${avatar.name}</div>
          <div class="avatar-school">${avatar.school || 'Visitor'}</div>
        </div>
        <div class="avatar-status">${avatar.state}</div>
      </div>
    `).join('');
  }

  /**
   * Update signal status indicator
   */
  updateSignalStatus(online) {
    if (!this.elements.signalStatus) return;
    
    const dot = this.elements.signalStatus.querySelector('.status-dot');
    const text = this.elements.signalStatus.querySelector('span:last-child');
    
    if (dot) {
      dot.classList.toggle('online', online);
      dot.classList.toggle('offline', !online);
    }
    
    if (text) {
      text.textContent = online ? 'Connected' : 'Disconnected';
    }
  }

  /**
   * Update broadcast title
   */
  updateBroadcastTitle(title) {
    if (this.elements.broadcastTitle) {
      this.elements.broadcastTitle.textContent = title;
    }
  }

  /**
   * Update viewer count
   */
  updateViewerCount() {
    // Simulated viewer count based on activity
    this.viewerCount = Math.max(1, worldState.avatars.size * 10 + worldState.recentEvents.length * 5);
    
    if (this.elements.viewerCount) {
      this.elements.viewerCount.textContent = this.viewerCount;
    }
  }

  /**
   * Update event ticker
   */
  updateEventTicker(event) {
    if (!this.elements.eventTicker) return;
    
    const messages = {
      'MINT': `New proof minted by ${event.actor_id}`,
      'ESCROW_LOCK': 'Escrow locked for new quest',
      'STAKE_LOCK': 'Verifier stake locked',
      'STAKE_RELEASE': 'Verification complete',
      'BLUEPRINT_EXEC': 'Blueprint executed',
      'TRANSFER': 'Token transfer recorded'
    };
    
    const message = messages[event.type] || `${event.type} event`;
    this.elements.eventTicker.textContent = message;
  }

  /**
   * Add event to log
   */
  addEventToLog(event) {
    if (!this.elements.eventLog) return;
    
    // Remove placeholder
    const placeholder = this.elements.eventLog.querySelector('.event-placeholder');
    if (placeholder) {
      placeholder.remove();
    }
    
    // Create event item
    const eventItem = document.createElement('div');
    eventItem.className = `event-item ${event.type.toLowerCase().replace('_', '-')}`;
    
    const time = new Date(event.timestamp).toLocaleTimeString();
    
    eventItem.innerHTML = `
      <div><strong>${event.type}</strong></div>
      <div>${event.actor_id || 'System'}</div>
      <div class="event-time">${time}</div>
    `;
    
    // Add to top
    this.elements.eventLog.prepend(eventItem);
    
    // Limit to 10 events
    while (this.elements.eventLog.children.length > 10) {
      this.elements.eventLog.lastChild.remove();
    }
  }

  /**
   * Update bot list
   */
  updateBotList() {
    if (!this.elements.botList) return;
    
    if (botConnection.isConnected()) {
      this.elements.botList.innerHTML = `
        <div class="bot-card">
          <div class="bot-id">${botConnection.getBotId()}</div>
          <div class="bot-status">Connected</div>
        </div>
      `;
    } else {
      this.elements.botList.innerHTML = '<div class="bot-placeholder">No bots connected</div>';
    }
  }
}

// Create and initialize app when DOM is ready
const worldApp = new WorldApp();

document.addEventListener('DOMContentLoaded', () => {
  worldApp.init().catch(error => {
    console.error('[WorldApp] Initialization failed:', error);
  });
});
