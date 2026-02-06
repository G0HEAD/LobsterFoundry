/**
 * LobsterFoundry Pixel World - World State Management
 * Manages the state of the entire pixel world
 */

class WorldState {
  constructor() {
    try {
      // Core state
      this.tick = 0;
      this.gameTime = {
        day: 1,
        hour: 8,
        minute: 0,
        period: 'DAY'
      };
      
      // Entities
      this.avatars = new Map();
      this.buildings = new Map();
      this.particles = [];
      this.floatingTexts = [];
      
      // Event queue
      this.eventQueue = [];
      this.eventListeners = new Map();
      
      // Ledger connection
      this.lastLedgerEventId = null;
      this.recentEvents = [];
      
      // Build night state
      this.isBuildNight = false;
      this.buildNightProgress = 0;
      
      // World map (tile data) - deferred to allow constants to load
      this.terrain = null;
      this.buildingLayer = null;
      
      console.log('[WorldState] Constructed (terrain not yet generated)');
    } catch (error) {
      console.error('[WorldState] Constructor error:', error);
    }
  }

  /**
   * Initialize terrain - call after constants are loaded
   */
  initTerrain() {
    if (this.terrain) return; // Already initialized
    
    try {
      this.terrain = this.generateTerrain();
      this.buildingLayer = this.generateBuildingLayer();
      console.log('[WorldState] Terrain and buildings generated');
    } catch (error) {
      console.error('[WorldState] Terrain generation error:', error);
    }
  }

  /**
   * Generate terrain data
   */
  generateTerrain() {
    const width = WORLD_CONFIG.WORLD_WIDTH;
    const height = WORLD_CONFIG.WORLD_HEIGHT;
    const terrain = [];
    
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        // Determine which district this tile belongs to
        const district = this.getDistrictAt(x, y);
        
        // Determine tile type
        let tileType = 'grass_' + ((x + y) % 4);
        
        if (district) {
          tileType = `district_${district.id}`;
        }
        
        // Add paths
        if (this.isPathTile(x, y)) {
          tileType = this.getPathType(x, y);
        }
        
        row.push({
          type: tileType,
          walkable: true,
          district: district?.id || null
        });
      }
      terrain.push(row);
    }
    
    return terrain;
  }

  /**
   * Generate building placements
   */
  generateBuildingLayer() {
    const buildings = [];
    
    // Place buildings in their districts
    const buildingPlacements = [
      { type: 'WELCOME_BOOTH', x: 3, y: 3 },
      { type: 'NOTICE_BOARD', x: 14, y: 4 },
      { type: 'FORGE_STALL', x: 24, y: 3 },
      { type: 'STAMP_DESK', x: 3, y: 14 },
      { type: 'MUSEUM_HALL', x: 12, y: 14 },
      { type: 'FURNACE', x: 26, y: 10 },
      { type: 'LEDGER_TERMINAL', x: 22, y: 26 }
    ];
    
    buildingPlacements.forEach((placement, index) => {
      const buildingDef = BUILDINGS[placement.type];
      if (buildingDef) {
        const building = {
          id: `building_${index}`,
          type: placement.type,
          name: buildingDef.name,
          x: placement.x,
          y: placement.y,
          width: buildingDef.size.width,
          height: buildingDef.size.height,
          color: buildingDef.color,
          active: false,
          queue: []
        };
        buildings.push(building);
        this.buildings.set(building.id, building);
        
        // Mark tiles as non-walkable
        for (let dy = 0; dy < building.height; dy++) {
          for (let dx = 0; dx < building.width; dx++) {
            const tx = placement.x + dx;
            const ty = placement.y + dy;
            if (this.terrain[ty] && this.terrain[ty][tx]) {
              this.terrain[ty][tx].walkable = false;
              this.terrain[ty][tx].building = building.id;
            }
          }
        }
      }
    });
    
    return buildings;
  }

  /**
   * Get district at tile position
   */
  getDistrictAt(x, y) {
    for (const [key, district] of Object.entries(DISTRICTS)) {
      const b = district.bounds;
      if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) {
        return district;
      }
    }
    return null;
  }

  /**
   * Check if tile should be a path
   */
  isPathTile(x, y) {
    // Horizontal paths between districts
    if (y === 9 || y === 10) return true;
    if (y === 21 || y === 22) return true;
    
    // Vertical paths
    if (x === 9 || x === 10) return true;
    if (x === 21 || x === 22) return true;
    
    return false;
  }

  /**
   * Get path type for a tile
   */
  getPathType(x, y) {
    const isHorizontal = (y === 9 || y === 10 || y === 21 || y === 22);
    const isVertical = (x === 9 || x === 10 || x === 21 || x === 22);
    
    if (isHorizontal && isVertical) return 'path_cross';
    if (isHorizontal) return 'path_h';
    if (isVertical) return 'path_v';
    return 'path_h';
  }

  /**
   * Update world state
   */
  update(deltaTime) {
    this.tick++;
    
    // Update game time
    this.updateGameTime();
    
    // Update avatars
    this.avatars.forEach(avatar => {
      avatar.update(deltaTime);
    });
    
    // Update particles
    this.updateParticles(deltaTime);
    
    // Update floating texts
    this.updateFloatingTexts(deltaTime);
    
    // Process event queue
    this.processEvents();
  }

  /**
   * Update game time
   */
  updateGameTime() {
    if (this.tick % WORLD_CONFIG.TICKS_PER_GAME_MINUTE === 0) {
      this.gameTime.minute++;
      
      if (this.gameTime.minute >= WORLD_CONFIG.MINUTES_PER_GAME_HOUR) {
        this.gameTime.minute = 0;
        this.gameTime.hour++;
        
        if (this.gameTime.hour >= WORLD_CONFIG.HOURS_PER_GAME_DAY) {
          this.gameTime.hour = 0;
          this.gameTime.day++;
        }
      }
      
      // Update time period
      if (this.gameTime.hour >= 5 && this.gameTime.hour < 7) {
        this.gameTime.period = 'DAWN';
      } else if (this.gameTime.hour >= 7 && this.gameTime.hour < 18) {
        this.gameTime.period = 'DAY';
      } else if (this.gameTime.hour >= 18 && this.gameTime.hour < 20) {
        this.gameTime.period = 'DUSK';
      } else {
        this.gameTime.period = 'NIGHT';
      }
    }
  }

  /**
   * Update particles
   */
  updateParticles(deltaTime) {
    this.particles = this.particles.filter(particle => {
      const dt = deltaTime / 1000;
      particle.life -= deltaTime;
      if (particle.driftAmplitude) {
        particle.driftPhase = (particle.driftPhase || 0) + (particle.driftSpeed || 2) * dt;
        particle.baseX = (particle.baseX ?? particle.x) + particle.vx;
        particle.x = particle.baseX + Math.sin(particle.driftPhase) * particle.driftAmplitude;
      } else {
        particle.x += particle.vx;
      }

      particle.y += particle.vy;
      particle.vy += particle.gravity || 0;
      if (particle.rotationSpeed) {
        particle.rotation = (particle.rotation || 0) + particle.rotationSpeed;
      }
      return particle.life > 0;
    });
  }

  /**
   * Update floating texts
   */
  updateFloatingTexts(deltaTime) {
    this.floatingTexts = this.floatingTexts.filter(text => {
      text.life -= deltaTime;
      text.y -= 0.5;
      text.opacity = Math.min(1, text.life / 500);
      return text.life > 0;
    });
  }

  /**
   * Add an avatar to the world
   */
  addAvatar(avatar) {
    this.avatars.set(avatar.id, avatar);
    this.emit(WORLD_EVENTS.AVATAR_SPAWN, { avatar });
    console.log(`[WorldState] Avatar added: ${avatar.name}`);
  }

  /**
   * Remove an avatar from the world
   */
  removeAvatar(avatarId) {
    const avatar = this.avatars.get(avatarId);
    if (avatar) {
      this.avatars.delete(avatarId);
      this.emit(WORLD_EVENTS.AVATAR_DESPAWN, { avatar });
      console.log(`[WorldState] Avatar removed: ${avatar.name}`);
    }
  }

  /**
   * Get avatar by ID
   */
  getAvatar(avatarId) {
    return this.avatars.get(avatarId);
  }

  /**
   * Get avatar controlled by a specific bot
   */
  getAvatarByBotId(botId) {
    for (const avatar of this.avatars.values()) {
      if (avatar.botId === botId) {
        return avatar;
      }
    }
    return null;
  }

  /**
   * Spawn a particle effect
   */
  spawnParticle(type, x, y, config = {}) {
    const particle = {
      type,
      x,
      y,
      vx: config.vx ?? (Math.random() - 0.5) * 2,
      vy: config.vy ?? -Math.random() * 3,
      gravity: config.gravity ?? 0.1,
      life: config.life ?? 1000,
      size: config.size ?? 3,
      color: config.color ?? PALETTE.YELLOW,
      rotation: config.rotation ?? 0,
      rotationSpeed: config.rotationSpeed ?? 0,
      driftAmplitude: config.driftAmplitude ?? 0,
      driftSpeed: config.driftSpeed ?? 0,
      baseX: config.driftAmplitude ? x : null
    };
    this.particles.push(particle);
  }

  /**
   * Spawn floating text
   */
  spawnFloatingText(text, x, y, color = '#fff') {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 2000,
      opacity: 1
    });
  }

  /**
   * Trigger celebration effect
   */
  triggerCelebration(x, y, text = '') {
    // Spawn multiple particles
    for (let i = 0; i < 20; i++) {
      this.spawnParticle(PARTICLE_TYPES.STAR, x, y, {
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 5 - 2,
        color: [PALETTE.YELLOW, PALETTE.ORANGE, PALETTE.CYAN, PALETTE.GREEN][Math.floor(Math.random() * 4)],
        life: 1500
      });
    }
    
    if (text) {
      this.spawnFloatingText(text, x, y - 10, PALETTE.YELLOW);
    }
    
    this.emit(WORLD_EVENTS.MINT_CELEBRATION, { x, y, text });
  }

  /**
   * Start Build Night event
   */
  startBuildNight() {
    this.isBuildNight = true;
    this.buildNightProgress = 0;
    this.emit(WORLD_EVENTS.BUILD_NIGHT_START, {});
    console.log('[WorldState] Build Night started!');
  }

  /**
   * End Build Night event
   */
  endBuildNight() {
    this.isBuildNight = false;
    this.emit(WORLD_EVENTS.BUILD_NIGHT_END, {});
    console.log('[WorldState] Build Night ended');
  }

  /**
   * Process a ledger event from the Runner
   */
  processLedgerEvent(event) {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 10) {
      this.recentEvents.pop();
    }
    
    this.emit(WORLD_EVENTS.LEDGER_EVENT, { event });
    
  }

  /**
   * Find avatar by account ID
   */
  findAvatarByAccountId(accountId) {
    for (const avatar of this.avatars.values()) {
      if (avatar.name === accountId || avatar.id === accountId) {
        return avatar;
      }
    }
    return null;
  }

  /**
   * Queue an event
   */
  queueEvent(type, data) {
    this.eventQueue.push({ type, data, timestamp: Date.now() });
  }

  /**
   * Process event queue
   */
  processEvents() {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      this.emit(event.type, event.data);
    }
  }

  /**
   * Add event listener
   */
  on(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType).push(callback);
  }

  /**
   * Remove event listener
   */
  off(eventType, callback) {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  emit(eventType, data) {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Get serializable state snapshot
   */
  getSnapshot() {
    return {
      tick: this.tick,
      gameTime: { ...this.gameTime },
      avatars: Array.from(this.avatars.values()).map(a => a.serialize()),
      buildings: Array.from(this.buildings.values()),
      isBuildNight: this.isBuildNight,
      recentEvents: this.recentEvents.slice(0, 5)
    };
  }

  /**
   * Get tile at position
   */
  getTile(x, y) {
    if (y >= 0 && y < this.terrain.length && x >= 0 && x < this.terrain[0].length) {
      return this.terrain[y][x];
    }
    return null;
  }

  /**
   * Check if tile is walkable
   */
  isWalkable(x, y) {
    const tile = this.getTile(x, y);
    return tile ? tile.walkable : false;
  }
}

// Create global instance
const worldState = new WorldState();
