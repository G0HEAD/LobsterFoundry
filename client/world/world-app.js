/**
 * LobsterFoundry Pixel World - Main Application
 * Entry point for the pixel world client
 */

class WorldApp {
  constructor() {
    this.initialized = false;
    this.isSpectatorMode = true; // Default to spectator mode for humans
    this.viewerCount = 0;
    this.devMode = false;
    
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
      devToggle: document.querySelector('[data-dev-toggle]'),
      
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

    if (this.elements.devToggle) {
      this.elements.devToggle.addEventListener('click', () => {
        this.toggleDevMode();
      });
    }
    
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
      if (data?.avatar) {
        this.clearAvatarFx(data.avatar);
      }
      this.updateAvatarList();
    });

    worldState.on(WORLD_EVENTS.AVATAR_ACTION, (data) => {
      if (data?.avatar) {
        this.handleAvatarActionFx(data.avatar, data.action);
      }
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

  toggleDevMode() {
    this.devMode = !this.devMode;
    document.body.classList.toggle('dev-mode', this.devMode);
    if (this.elements.devToggle) {
      this.elements.devToggle.classList.toggle('is-active', this.devMode);
      this.elements.devToggle.setAttribute('aria-pressed', this.devMode ? 'true' : 'false');
      this.elements.devToggle.textContent = this.devMode ? 'Dev Mode: On' : 'Dev Mode: Off';
    }
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
        const previousState = avatar.state;
        avatar.deserialize(data);
        if (data.state && data.state !== previousState) {
          this.handleAvatarStateFx(avatar, data.state);
        }
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
        if (data.state) {
          this.handleAvatarStateFx(avatar, data.state);
        }
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
        this.spawnAvatar();
        break;

      case 'despawn-avatar':
        this.despawnRandomAvatar();
        break;

      case 'command-walk':
        this.commandWalk();
        break;

      case 'command-work':
        this.commandWork(4200);
        break;

      case 'command-read':
        this.commandRead(3200);
        break;

      case 'command-celebrate':
        this.commandCelebrate({
          radius: WORLD_CONFIG.TILE_SIZE * 3,
          minNeighbors: 2,
          duration: 1800
        });
        break;

      case 'command-verify':
        this.commandAvatarAction(WORLD_ACTIONS.SUBMIT_STAMP, 2400);
        break;

      case 'command-converse':
        this.commandAvatarAction(WORLD_ACTIONS.CONVERSE, 2400);
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

  spawnAvatar() {
    const avatar = this.createRandomAvatar(worldState.avatars.size);
    worldState.addAvatar(avatar);
    this.animateAvatarSpawn(avatar, false);
    return avatar;
  }

  despawnRandomAvatar() {
    const avatars = Array.from(worldState.avatars.values()).filter(avatar => !avatar.botId);
    if (avatars.length === 0) return;
    const target = avatars[Math.floor(Math.random() * avatars.length)];
    this.clearWorkTask(target);
    this.clearReadTask(target);
    this.clearAvatarTextTimers(target);
    this.animateAvatarDespawn(target);
    worldState.removeAvatar(target.id);
  }

  commandWalk() {
    const avatars = Array.from(worldState.avatars.values());
    avatars.forEach((avatar, index) => {
      this.clearWorkTask(avatar);
      this.clearReadTask(avatar);
      this.clearAvatarTextTimers(avatar);
      const tile = this.getRandomWalkableTile();
      avatar.moveTo(tile.x, tile.y);
      this.animateAvatarCommand('WALK', avatar, index);
    });

    this.updateAvatarList();
  }

  commandAvatarAction(action, duration = 0) {
    if (action === WORLD_ACTIONS.SUBMIT_WORK) {
      this.commandWork(duration || 4200);
      return;
    }

    if (action === WORLD_ACTIONS.READ) {
      this.commandRead(duration || 3200);
      return;
    }

    const avatars = Array.from(worldState.avatars.values());
    if (avatars.length === 0) return;

    avatars.forEach((avatar) => {
      this.clearWorkTask(avatar);
      this.clearReadTask(avatar);
      this.clearAvatarTextTimers(avatar);
      avatar.performAction(action);
    });

    this.updateAvatarList();

    if (duration > 0) {
      if (this.actionResetTimeout) {
        clearTimeout(this.actionResetTimeout);
      }
      this.actionResetTimeout = setTimeout(() => {
        avatars.forEach(avatar => avatar.performAction());
        this.updateAvatarList();
      }, duration);
    }
  }

  commandWork(duration = 4200) {
    const avatars = Array.from(worldState.avatars.values());
    if (avatars.length === 0) return;

    avatars.forEach((avatar, index) => {
      this.clearWorkTask(avatar);
      this.clearReadTask(avatar);
      this.clearAvatarTextTimers(avatar);
      avatar.performAction(WORLD_ACTIONS.SUBMIT_WORK);
      this.startWorkTask(avatar, duration, index);
    });

    this.updateAvatarList();
  }

  commandRead(duration = 3200) {
    const avatars = Array.from(worldState.avatars.values());
    if (avatars.length === 0) return;

    avatars.forEach((avatar, index) => {
      this.clearWorkTask(avatar);
      this.clearReadTask(avatar);
      this.clearAvatarTextTimers(avatar);
      avatar.performAction(WORLD_ACTIONS.READ);
      this.startReadTask(avatar, duration, index);
    });

    this.updateAvatarList();
  }

  commandCelebrate({ radius, minNeighbors = 2, duration = 1800 } = {}) {
    const avatars = Array.from(worldState.avatars.values());
    if (avatars.length === 0) return;

    const radiusPx = radius ?? WORLD_CONFIG.TILE_SIZE * 3;
    const eligible = avatars.filter(avatar => {
      return this.countNearbyAvatars(avatar, avatars, radiusPx) >= minNeighbors;
    });

    if (eligible.length === 0) return;

    eligible.forEach((avatar) => {
      this.clearWorkTask(avatar);
      this.clearReadTask(avatar);
      this.clearAvatarTextTimers(avatar);
      avatar.performAction(WORLD_ACTIONS.CELEBRATE);
    });

    this.updateAvatarList();

    if (duration > 0) {
      if (this.actionResetTimeout) {
        clearTimeout(this.actionResetTimeout);
      }
      this.actionResetTimeout = setTimeout(() => {
        eligible.forEach(avatar => avatar.performAction());
        this.updateAvatarList();
      }, duration);
    }
  }

  handleAvatarStateFx(avatar, state) {
    if (!avatar || !state) return;

    if (state === AVATAR_STATES.IDLE) {
      this.clearAvatarFx(avatar);
      return;
    }

    const stateToAction = {
      [AVATAR_STATES.WORKING]: WORLD_ACTIONS.SUBMIT_WORK,
      [AVATAR_STATES.CRAFTING]: WORLD_ACTIONS.CRAFT,
      [AVATAR_STATES.VERIFYING]: WORLD_ACTIONS.SUBMIT_STAMP,
      [AVATAR_STATES.READING]: WORLD_ACTIONS.READ,
      [AVATAR_STATES.CELEBRATING]: WORLD_ACTIONS.CELEBRATE,
      [AVATAR_STATES.CONVERSING]: WORLD_ACTIONS.CONVERSE,
    };

    const action = stateToAction[state];
    if (!action) return;

    if (action === WORLD_ACTIONS.SUBMIT_WORK && !avatar.workTask) {
      this.startWorkTask(avatar, 2800);
      return;
    }

    if (action === WORLD_ACTIONS.READ && !avatar.readTask) {
      this.startReadTask(avatar, 2400);
      return;
    }

    this.handleAvatarActionFx(avatar, action);
  }

  handleAvatarActionFx(avatar, action, index = 0) {
    if (!avatar) return;
    this.animateAvatarCommand(action, avatar, index);
  }

  animateAvatarCommand(action, avatar, index = 0) {
    if (!avatar) return;

    const tile = WORLD_CONFIG.TILE_SIZE;
    const jitter = (index % 3 - 1) * (tile * 0.05);
    const center = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.6 });
    const head = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.1 });
    const feet = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.88 });

    const effectPoint = {
      x: center.x + jitter,
      y: center.y + jitter
    };

    switch (action) {
      case 'WALK': {
        this.spawnParticleBurst(PARTICLE_TYPES.SMOKE, {
          x: feet.x,
          y: feet.y,
          count: 6,
          color: PALETTE.LIGHT_GRAY,
          life: 600,
          size: 2,
          gravity: 0.05
        });
        setTimeout(() => {
          this.spawnParticleBurst(PARTICLE_TYPES.SMOKE, {
            x: feet.x + tile * 0.15,
            y: feet.y,
            count: 4,
            color: PALETTE.GRAY,
            life: 500,
            size: 2,
            gravity: 0.04
          });
        }, 180);
        break;
      }
      case WORLD_ACTIONS.SUBMIT_WORK: {
        this.spawnParticleBurst(PARTICLE_TYPES.SPARK, {
          x: effectPoint.x,
          y: effectPoint.y - tile * 0.1,
          count: 6,
          color: PALETTE.ORANGE,
          life: 700,
          size: 3
        });
        break;
      }
      case WORLD_ACTIONS.CRAFT: {
        this.spawnParticleBurst(PARTICLE_TYPES.SPARK, {
          x: effectPoint.x,
          y: effectPoint.y - tile * 0.15,
          count: 10,
          color: PALETTE.ORANGE,
          life: 900,
          size: 3
        });
        this.spawnParticleBurst(PARTICLE_TYPES.SMOKE, {
          x: feet.x,
          y: feet.y,
          count: 6,
          color: PALETTE.DARK_GRAY,
          life: 1000,
          size: 3,
          gravity: -0.02
        });
        this.scheduleAvatarText(avatar, 'CRAFT', PALETTE.ORANGE, {
          x: effectPoint.x,
          y: head.y - tile * 0.2
        }, {
          baseDelay: 120,
          jitter: 140,
          minGap: 100
        });
        break;
      }
      case WORLD_ACTIONS.SUBMIT_STAMP:
      case WORLD_ACTIONS.ACCEPT_JOB: {
        this.spawnParticleBurst(PARTICLE_TYPES.STAMP, {
          x: effectPoint.x,
          y: effectPoint.y - tile * 0.1,
          count: 7,
          color: PALETTE.YELLOW,
          life: 800,
          size: 3
        });
        this.spawnParticleBurst(PARTICLE_TYPES.SPARK, {
          x: effectPoint.x,
          y: effectPoint.y,
          count: 5,
          color: PALETTE.PEACH,
          life: 700,
          size: 2
        });
        this.scheduleAvatarText(avatar, 'STAMP', PALETTE.PEACH, {
          x: effectPoint.x,
          y: head.y - tile * 0.2
        }, {
          baseDelay: 130,
          jitter: 150,
          minGap: 110
        });
        break;
      }
      case WORLD_ACTIONS.READ: {
        this.spawnParticleBurst(PARTICLE_TYPES.STAR, {
          x: head.x,
          y: head.y,
          count: 6,
          color: PALETTE.LAVENDER,
          life: 1100,
          size: 3
        });
        break;
      }
      case WORLD_ACTIONS.CONVERSE: {
        this.scheduleAvatarText(avatar, '...', PALETTE.CYAN, {
          x: head.x,
          y: head.y - tile * 0.35
        }, {
          baseDelay: 120,
          jitter: 160,
          minGap: 120
        });
        this.spawnParticleBurst(PARTICLE_TYPES.STAR, {
          x: head.x,
          y: head.y - tile * 0.1,
          count: 4,
          color: PALETTE.CYAN,
          life: 700,
          size: 2
        });
        break;
      }
      case WORLD_ACTIONS.CELEBRATE: {
        const celebratePoint = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.35 });
        this.spawnBalloonBurst(celebratePoint, {
          count: 7,
          colors: [PALETTE.YELLOW, PALETTE.YELLOW, PALETTE.YELLOW, PALETTE.PINK]
        });
        this.spawnParticleBurst(PARTICLE_TYPES.SPARK, {
          x: celebratePoint.x,
          y: celebratePoint.y - tile * 0.05,
          count: 6,
          color: PALETTE.YELLOW,
          life: 700,
          size: 2
        });
        this.scheduleCelebrateText(avatar, celebratePoint, index);
        break;
      }
      default:
        break;
    }
  }

  animateAvatarSpawn(avatar, isSquad = false) {
    if (!avatar) return;
    const point = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.6 });
    this.spawnParticleBurst(PARTICLE_TYPES.STAR, {
      x: point.x,
      y: point.y,
      count: isSquad ? 6 : 12,
      color: avatar.color || PALETTE.CYAN,
      life: 900,
      size: 3
    });

    if (!isSquad) {
      this.scheduleAvatarText(avatar, 'JOINED', PALETTE.GREEN, point, {
        baseDelay: 140,
        jitter: 180,
        minGap: 120
      });
    }
  }

  animateAvatarDespawn(avatar) {
    if (!avatar) return;
    const point = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.6 });
    this.spawnParticleBurst(PARTICLE_TYPES.SMOKE, {
      x: point.x,
      y: point.y,
      count: 12,
      color: PALETTE.DARK_GRAY,
      life: 1000,
      size: 3,
      gravity: -0.02
    });

    this.scheduleAvatarText(avatar, 'EXIT', PALETTE.GRAY, point, {
      baseDelay: 130,
      jitter: 180,
      minGap: 120
    });
  }

  startWorkTask(avatar, duration, index = 0) {
    if (!avatar) return;

    const start = Date.now();
    avatar.workTask = {
      start,
      duration,
      pulseTimer: null,
      completeTimer: null
    };

    this.scheduleWorkPulse(avatar, index);

    avatar.workTask.completeTimer = setTimeout(() => {
      this.finishWorkTask(avatar);
    }, duration);
  }

  scheduleWorkPulse(avatar, index = 0) {
    if (!avatar || !avatar.workTask) return;

    const task = avatar.workTask;
    const interval = 520 + (index % 4) * 90;
    const tile = WORLD_CONFIG.TILE_SIZE;

    task.pulseTimer = setTimeout(() => {
      if (!avatar.workTask) return;

      const anvil = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.6 });
      const feet = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.9 });

      this.spawnParticleBurst(PARTICLE_TYPES.SPARK, {
        x: anvil.x,
        y: anvil.y - tile * 0.12,
        count: 6,
        color: PALETTE.ORANGE,
        life: 800,
        size: 3
      });

      this.spawnParticleBurst(PARTICLE_TYPES.SMOKE, {
        x: feet.x,
        y: feet.y,
        count: 3,
        color: PALETTE.DARK_GRAY,
        life: 900,
        size: 3,
        gravity: -0.02
      });

      const elapsed = Date.now() - task.start;
      if (elapsed < task.duration - 600) {
        this.scheduleWorkPulse(avatar, index + 1);
      }
    }, interval);
  }

  finishWorkTask(avatar) {
    if (!avatar || !avatar.workTask) return;

    const completePoint = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.45 });
    const labelPoint = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.05 });

    this.spawnParticleBurst(PARTICLE_TYPES.SPARK, {
      x: completePoint.x,
      y: completePoint.y,
      count: 10,
      color: PALETTE.GREEN,
      life: 900,
      size: 3
    });

    this.scheduleAvatarText(avatar, 'WORK COMPLETE', PALETTE.GREEN, labelPoint, {
      baseDelay: 150,
      jitter: 200,
      minGap: 120
    });

    this.clearWorkTask(avatar);
    avatar.performAction();
    this.updateAvatarList();
  }

  startReadTask(avatar, duration, index = 0) {
    if (!avatar) return;

    const start = Date.now();
    avatar.readTask = {
      start,
      duration,
      pulseTimer: null,
      completeTimer: null
    };

    this.scheduleReadPulse(avatar, index);

    avatar.readTask.completeTimer = setTimeout(() => {
      this.finishReadTask(avatar);
    }, duration);
  }

  scheduleReadPulse(avatar, index = 0) {
    if (!avatar || !avatar.readTask) return;

    const task = avatar.readTask;
    const interval = 1400 + Math.random() * 500 + (index % 3) * 120;
    const tile = WORLD_CONFIG.TILE_SIZE;

    task.pulseTimer = setTimeout(() => {
      if (!avatar.readTask) return;

      const head = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.05 });

      const sheetCount = 2 + (Math.random() > 0.6 ? 1 : 0);
      for (let i = 0; i < sheetCount; i++) {
        const offsetX = (Math.random() - 0.5) * tile * 0.4;
        const offsetY = (Math.random() - 0.3) * tile * 0.1;
        const size = 2.6 + Math.random() * 1.2;
        const drift = tile * (0.18 + Math.random() * 0.12);
        const wind = Math.random() > 0.5 ? 1 : -1;

        worldState.spawnParticle(PARTICLE_TYPES.PAPER, head.x + offsetX, head.y + offsetY, {
          color: PALETTE.LAVENDER,
          size,
          life: 1800 + Math.random() * 800,
          gravity: 0.002 + Math.random() * 0.004,
          vx: wind * (0.6 + Math.random() * 0.5),
          vy: -0.05 + Math.random() * 0.12,
          rotation: (Math.random() - 0.5) * 0.6,
          rotationSpeed: (Math.random() - 0.5) * 0.04,
          driftAmplitude: drift,
          driftSpeed: 1.6 + Math.random() * 1.6
        });
      }

      const elapsed = Date.now() - task.start;
      if (elapsed < task.duration - 900) {
        this.scheduleReadPulse(avatar, index + 1);
      }
    }, interval);
  }

  finishReadTask(avatar) {
    if (!avatar || !avatar.readTask) return;

    const tile = WORLD_CONFIG.TILE_SIZE;
    const head = this.getAvatarEffectPoint(avatar, { x: 0.5, y: 0.1 });
    const label = this.getAvatarEffectPoint(avatar, { x: 0.5, y: -0.05 });

    this.spawnParticleBurst(PARTICLE_TYPES.STAR, {
      x: head.x,
      y: head.y,
      count: 6,
      color: PALETTE.LAVENDER,
      life: 900,
      size: 3
    });

    this.scheduleAvatarText(avatar, 'READING COMPLETE', PALETTE.LAVENDER, {
      x: label.x,
      y: label.y - tile * 0.2
    }, {
      baseDelay: 160,
      jitter: 200,
      minGap: 120
    });

    this.clearReadTask(avatar);
    avatar.performAction();
    this.updateAvatarList();
  }

  clearReadTask(avatar) {
    if (!avatar || !avatar.readTask) return;

    if (avatar.readTask.pulseTimer) {
      clearTimeout(avatar.readTask.pulseTimer);
    }

    if (avatar.readTask.completeTimer) {
      clearTimeout(avatar.readTask.completeTimer);
    }

    avatar.readTask = null;
  }

  clearWorkTask(avatar) {
    if (!avatar || !avatar.workTask) return;

    if (avatar.workTask.pulseTimer) {
      clearTimeout(avatar.workTask.pulseTimer);
    }

    if (avatar.workTask.completeTimer) {
      clearTimeout(avatar.workTask.completeTimer);
    }

    avatar.workTask = null;
  }

  clearAvatarFx(avatar) {
    this.clearWorkTask(avatar);
    this.clearReadTask(avatar);
    this.clearAvatarTextTimers(avatar);
  }

  spawnParticleBurst(type, options = {}) {
    const count = options.count ?? 12;
    const centerX = options.x ?? WORLD_CONFIG.CANVAS_SIZE * 0.5;
    const centerY = options.y ?? WORLD_CONFIG.CANVAS_SIZE * 0.45;
    const color = options.color ?? PALETTE.YELLOW;
    const gravity = options.gravity ?? 0.12;

    for (let i = 0; i < count; i++) {
      worldState.spawnParticle(type, centerX, centerY, {
        color,
        size: options.size ?? 3,
        life: options.life ?? 1200,
        gravity,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3 - 1
      });
    }

    if (options.label) {
      this.scheduleWorldText(options.label, options.labelColor ?? color, {
        x: centerX,
        y: centerY - 10
      }, {
        baseDelay: 120,
        jitter: 160,
        minGap: 100
      });
    }
  }

  spawnBalloonBurst(point, options = {}) {
    const tile = WORLD_CONFIG.TILE_SIZE;
    const count = options.count ?? 6;
    const colors = options.colors ?? [PALETTE.YELLOW];
    const baseX = point.x;
    const baseY = point.y - tile * 0.1;

    for (let i = 0; i < count; i++) {
      const spreadX = (Math.random() - 0.5) * tile * 0.9;
      const spreadY = (Math.random() - 0.5) * tile * 0.4;
      const size = 3.5 + Math.random() * 2;
      const color = colors[Math.floor(Math.random() * colors.length)];

      worldState.spawnParticle(PARTICLE_TYPES.BALLOON, baseX + spreadX, baseY + spreadY, {
        color,
        size,
        life: 2200 + Math.random() * 900,
        gravity: -0.012,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -0.25 - Math.random() * 0.15,
        driftAmplitude: tile * (0.06 + Math.random() * 0.08),
        driftSpeed: 0.9 + Math.random() * 1.2
      });
    }
  }

  getCelebrateText() {
    const lines = [
      'HOORAY!',
      'BOOYAH!',
      'PARTY TIME!',
      'CHEERS!',
      'LET\'S GO!',
      'WOOHOO!',
      'NICE WORK!',
      'HIGH FIVE!',
      'VICTORY!',
      'BRAVO!'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  scheduleCelebrateText(avatar, point, index = 0) {
    const tile = WORLD_CONFIG.TILE_SIZE;
    const text = this.getCelebrateText();
    const baseDelay = 160 + (index % 4) * 80;

    this.scheduleAvatarText(avatar, text, PALETTE.YELLOW, point, {
      baseDelay,
      jitter: 180,
      minGap: 120,
      offset: { x: tile * 0.35, y: tile * 0.12 }
    });
  }

  scheduleAvatarText(avatar, text, color, point, options = {}) {
    if (!avatar) return;
    if (!avatar.textTimers) {
      avatar.textTimers = new Set();
    }

    this.scheduleText(text, color, point, options, avatar.textTimers);
  }

  scheduleWorldText(text, color, point, options = {}) {
    this.scheduleText(text, color, point, options, this.worldTextTimers);
  }

  scheduleText(text, color, point, options = {}, timerSet) {
    if (!text || !point) return;

    const tile = WORLD_CONFIG.TILE_SIZE;
    const baseDelay = options.baseDelay ?? 120;
    const jitter = options.jitter ?? 160;
    const minGap = options.minGap ?? 100;
    const offset = options.offset ?? { x: tile * 0.35, y: tile * 0.12 };

    const now = Date.now();
    let scheduledAt = now + baseDelay + Math.random() * jitter;

    if (this.lastTextTime && scheduledAt < this.lastTextTime + minGap) {
      scheduledAt = this.lastTextTime + minGap;
    }

    this.lastTextTime = scheduledAt;

    const timer = setTimeout(() => {
      const offsetX = (Math.random() - 0.5) * offset.x;
      const offsetY = (Math.random() - 0.5) * offset.y;
      worldState.spawnFloatingText(text, point.x + offsetX, point.y + offsetY, color);
      timerSet?.delete(timer);
    }, Math.max(0, scheduledAt - now));

    timerSet?.add(timer);
  }

  clearAvatarTextTimers(avatar) {
    if (!avatar?.textTimers) return;
    avatar.textTimers.forEach(timer => clearTimeout(timer));
    avatar.textTimers.clear();
  }

  clearWorldTextTimers() {
    if (!this.worldTextTimers.size) return;
    this.worldTextTimers.forEach(timer => clearTimeout(timer));
    this.worldTextTimers.clear();
  }

  getAvatarEffectPoint(avatar, offset = { x: 0.5, y: 0.6 }) {
    return {
      x: avatar.x + WORLD_CONFIG.TILE_SIZE * offset.x,
      y: avatar.y + WORLD_CONFIG.TILE_SIZE * offset.y
    };
  }

  getRandomWalkableTile() {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * WORLD_CONFIG.WORLD_WIDTH);
      const y = Math.floor(Math.random() * WORLD_CONFIG.WORLD_HEIGHT);
      if (worldState.isWalkable(x, y)) {
        return { x, y };
      }
    }
    return { x: 1, y: 1 };
  }

  countNearbyAvatars(avatar, avatars, radiusPx) {
    const tile = WORLD_CONFIG.TILE_SIZE;
    const centerX = avatar.x + tile * 0.5;
    const centerY = avatar.y + tile * 0.5;
    const maxDist = radiusPx * radiusPx;

    let count = 0;
    for (const other of avatars) {
      if (other.id === avatar.id) continue;
      const otherX = other.x + tile * 0.5;
      const otherY = other.y + tile * 0.5;
      const dx = otherX - centerX;
      const dy = otherY - centerY;
      if (dx * dx + dy * dy <= maxDist) {
        count++;
      }
    }

    return count;
  }

  createRandomAvatar(index = 0) {
    const schools = Object.keys(SCHOOL_COLORS);
    const titles = ['Runner', 'Verifier', 'Crafter', 'Archivist', 'Scout', 'Builder'];
    const school = schools[Math.floor(Math.random() * schools.length)];
    const tile = this.getRandomWalkableTile();
    const seed = Math.floor(Math.random() * 9000) + 1000;

    return new Avatar({
      id: `demo_${Date.now()}_${seed}_${index}`,
      name: `${titles[index % titles.length]}-${seed}`,
      x: tile.x,
      y: tile.y,
      school
    });
  }

  /**
   * Simulate a mint event (for testing)
   */
  simulateMintEvent() {
    const avatars = Array.from(worldState.avatars.values());
    if (avatars.length === 0) return;
    
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
    const event = {
      id: `sim_${Date.now()}`,
      type: 'MINT',
      timestamp: new Date().toISOString(),
      actor_id: randomAvatar.name,
      tokens_minted: ['token_1']
    };

    worldState.processLedgerEvent(event);
    this.handleLedgerEventVisualization(event);
  }

  /**
   * Reset the world state
   */
  resetWorld() {
    // Clear avatars
    worldState.avatars.forEach((avatar) => {
      this.clearAvatarFx(avatar);
      if (avatar.actionTimeout) {
        clearTimeout(avatar.actionTimeout);
        avatar.actionTimeout = null;
      }
    });
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
