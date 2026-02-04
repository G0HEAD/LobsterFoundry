/**
 * LobsterFoundry Pixel World - Renderer
 * Handles all canvas rendering with retro pixel art style
 */

class WorldRenderer {
  constructor() {
    // Canvas layers
    this.terrainCanvas = null;
    this.buildingsCanvas = null;
    this.avatarsCanvas = null;
    this.effectsCanvas = null;
    
    // Contexts
    this.terrainCtx = null;
    this.buildingsCtx = null;
    this.avatarsCtx = null;
    this.effectsCtx = null;
    
    // Rendering state
    this.terrainDirty = true;
    this.buildingsDirty = true;
    
    // Camera (for future scrolling support)
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1
    };
    
    this.initialized = false;
  }

  /**
   * Initialize the renderer
   */
  init() {
    // Get canvas elements
    this.terrainCanvas = document.getElementById('world-terrain');
    this.buildingsCanvas = document.getElementById('world-buildings');
    this.avatarsCanvas = document.getElementById('world-avatars');
    this.effectsCanvas = document.getElementById('world-effects');
    
    if (!this.terrainCanvas || !this.buildingsCanvas || !this.avatarsCanvas || !this.effectsCanvas) {
      console.error('[Renderer] Could not find canvas elements');
      return false;
    }
    
    // Get contexts
    this.terrainCtx = this.terrainCanvas.getContext('2d');
    this.buildingsCtx = this.buildingsCanvas.getContext('2d');
    this.avatarsCtx = this.avatarsCanvas.getContext('2d');
    this.effectsCtx = this.effectsCanvas.getContext('2d');
    
    // Disable image smoothing for crisp pixels
    [this.terrainCtx, this.buildingsCtx, this.avatarsCtx, this.effectsCtx].forEach(ctx => {
      ctx.imageSmoothingEnabled = false;
      ctx.webkitImageSmoothingEnabled = false;
      ctx.mozImageSmoothingEnabled = false;
      ctx.msImageSmoothingEnabled = false;
    });
    
    this.initialized = true;
    console.log('[Renderer] Initialized');
    return true;
  }

  /**
   * Render the entire world
   */
  render(worldState) {
    if (!this.initialized) return;
    
    // Render terrain (only when dirty)
    if (this.terrainDirty) {
      this.renderTerrain(worldState);
      this.terrainDirty = false;
    }
    
    // Render buildings (only when dirty)
    if (this.buildingsDirty) {
      this.renderBuildings(worldState);
      this.buildingsDirty = false;
    }
    
    // Render avatars (every frame)
    this.renderAvatars(worldState);
    
    // Render effects (every frame)
    this.renderEffects(worldState);
  }

  /**
   * Render terrain layer
   */
  renderTerrain(worldState) {
    const ctx = this.terrainCtx;
    const tileSize = WORLD_CONFIG.TILE_SIZE;
    
    ctx.clearRect(0, 0, WORLD_CONFIG.CANVAS_SIZE, WORLD_CONFIG.CANVAS_SIZE);
    
    // Check if terrain exists
    if (!worldState.terrain || !worldState.terrain.length) {
      // Draw a placeholder
      // Draw loading screen
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, WORLD_CONFIG.CANVAS_SIZE, WORLD_CONFIG.CANVAS_SIZE);
      
      // Draw pixel-art loading animation
      const scale = WORLD_CONFIG.CANVAS_SIZE / 512;
      const fontSize = Math.max(12, Math.floor(14 * scale));
      ctx.fillStyle = '#64d86a';
      ctx.font = `${fontSize}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('LOADING...', WORLD_CONFIG.CANVAS_SIZE / 2, WORLD_CONFIG.CANVAS_SIZE / 2);
      
      // Draw small animated dots
      const dotCount = Math.floor(Date.now() / 300) % 4;
      ctx.fillStyle = '#ffd700';
      for (let i = 0; i < dotCount; i++) {
        const dotX = WORLD_CONFIG.CANVAS_SIZE / 2 - 30 + i * 20;
        const dotY = WORLD_CONFIG.CANVAS_SIZE / 2 + 30;
        ctx.fillRect(dotX, dotY, 8, 8);
      }
      
      console.warn('[Renderer] Terrain not yet generated');
      return;
    }
    
    // Render each tile
    for (let y = 0; y < WORLD_CONFIG.WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_CONFIG.WORLD_WIDTH; x++) {
        const tile = worldState.terrain[y] && worldState.terrain[y][x];
        if (!tile) continue;
        
        const tileImage = tilesetManager.getTile(tile.type);
        
        if (tileImage) {
          ctx.drawImage(tileImage, x * tileSize, y * tileSize);
        } else {
          // Fallback: draw colored rectangle
          ctx.fillStyle = PALETTE.DARK_GREEN;
          ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
      }
    }
    
    // Draw grid lines (subtle)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= WORLD_CONFIG.WORLD_WIDTH; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tileSize, 0);
      ctx.lineTo(i * tileSize, WORLD_CONFIG.CANVAS_SIZE);
      ctx.stroke();
    }
    for (let i = 0; i <= WORLD_CONFIG.WORLD_HEIGHT; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * tileSize);
      ctx.lineTo(WORLD_CONFIG.CANVAS_SIZE, i * tileSize);
      ctx.stroke();
    }
  }

  /**
   * Render buildings layer
   */
  renderBuildings(worldState) {
    const ctx = this.buildingsCtx;
    const tileSize = WORLD_CONFIG.TILE_SIZE;
    
    ctx.clearRect(0, 0, WORLD_CONFIG.CANVAS_SIZE, WORLD_CONFIG.CANVAS_SIZE);
    
    // Sort buildings by Y for proper depth
    const sortedBuildings = Array.from(worldState.buildings.values())
      .sort((a, b) => a.y - b.y);
    
    sortedBuildings.forEach(building => {
      const buildingImage = tilesetManager.getTile(`building_${building.type.toLowerCase()}`);
      const x = building.x * tileSize;
      const y = building.y * tileSize;
      
      if (buildingImage) {
        ctx.drawImage(buildingImage, x, y);
      } else {
        // Fallback: draw building manually
        this.drawBuildingFallback(ctx, building, x, y);
      }
      
      // Draw building name
      this.drawBuildingLabel(ctx, building, x, y);
      
      // Draw activity indicator if active
      if (building.active) {
        this.drawActivityIndicator(ctx, building, x, y);
      }
    });
  }

  /**
   * Draw a building without a tileset image
   */
  drawBuildingFallback(ctx, building, x, y) {
    const tileSize = WORLD_CONFIG.TILE_SIZE;
    const w = building.width * tileSize;
    const h = building.height * tileSize;
    
    // Building body
    ctx.fillStyle = building.color || PALETTE.GRAY;
    ctx.fillRect(x + 2, y + 4, w - 4, h - 6);
    
    // Roof
    ctx.fillStyle = this.darkenColor(building.color || PALETTE.GRAY, 30);
    ctx.fillRect(x, y, w, 6);
    
    // Door
    ctx.fillStyle = PALETTE.BROWN;
    const doorX = x + (w / 2 - 4);
    ctx.fillRect(doorX, y + h - 12, 8, 10);
    
    // Window
    ctx.fillStyle = PALETTE.CYAN;
    ctx.fillRect(x + 6, y + 10, 6, 6);
    if (w > 32) {
      ctx.fillRect(x + w - 12, y + 10, 6, 6);
    }
  }

  /**
   * Draw building label
   */
  drawBuildingLabel(ctx, building, x, y) {
    const tileSize = WORLD_CONFIG.TILE_SIZE;
    const w = building.width * tileSize;
    const scale = tileSize / 16;
    const fontSize = Math.max(8, Math.floor(8 * scale));
    
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const labelX = x + w / 2;
    const labelY = y + building.height * tileSize + Math.ceil(3 * scale);
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(building.name, labelX + 1, labelY + 1);
    
    // Text
    ctx.fillStyle = '#fff';
    ctx.fillText(building.name, labelX, labelY);
  }

  /**
   * Draw activity indicator
   */
  drawActivityIndicator(ctx, building, x, y) {
    const tileSize = WORLD_CONFIG.TILE_SIZE;
    const scale = tileSize / 16;
    const centerX = x + (building.width * tileSize) / 2;
    
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.beginPath();
    ctx.arc(centerX, y - Math.ceil(5 * scale), Math.ceil(4 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Render avatars layer
   */
  renderAvatars(worldState) {
    const ctx = this.avatarsCtx;
    ctx.clearRect(0, 0, WORLD_CONFIG.CANVAS_SIZE, WORLD_CONFIG.CANVAS_SIZE);
    
    // Sort avatars by Y for proper depth
    const sortedAvatars = Array.from(worldState.avatars.values())
      .sort((a, b) => a.y - b.y);
    
    sortedAvatars.forEach(avatar => {
      avatar.render(ctx);
    });
  }

  /**
   * Render effects layer (particles, floating text, etc.)
   */
  renderEffects(worldState) {
    const ctx = this.effectsCtx;
    
    // Reset context state and clear
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, WORLD_CONFIG.CANVAS_SIZE, WORLD_CONFIG.CANVAS_SIZE);
    
    // Render particles (filtered to only alive ones)
    const aliveParticles = worldState.particles.filter(p => p.life > 0);
    aliveParticles.forEach(particle => {
      this.renderParticle(ctx, particle);
    });
    
    // Render floating texts (filtered to only alive ones)
    const aliveTexts = worldState.floatingTexts.filter(t => t.life > 0);
    aliveTexts.forEach(text => {
      this.renderFloatingText(ctx, text);
    });
    
    // Render Build Night overlay
    if (worldState.isBuildNight) {
      this.renderBuildNightOverlay(ctx, worldState);
    }
    
    // Render game time indicator
    this.renderTimeIndicator(ctx, worldState);
    
    // Ensure state is reset
    ctx.globalAlpha = 1;
  }

  /**
   * Render a particle
   */
  renderParticle(ctx, particle) {
    const scale = WORLD_CONFIG.CANVAS_SIZE / 512;
    const size = particle.size * scale;
    
    // Calculate fade based on remaining life (fade out in last 500ms)
    const fadeStart = 500;
    const opacity = particle.life < fadeStart ? particle.life / fadeStart : 1;
    
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = particle.color;
    
    switch (particle.type) {
      case PARTICLE_TYPES.STAR:
        // Draw a small star/sparkle
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y - size);
        ctx.lineTo(particle.x + size * 0.3, particle.y - size * 0.3);
        ctx.lineTo(particle.x + size, particle.y);
        ctx.lineTo(particle.x + size * 0.3, particle.y + size * 0.3);
        ctx.lineTo(particle.x, particle.y + size);
        ctx.lineTo(particle.x - size * 0.3, particle.y + size * 0.3);
        ctx.lineTo(particle.x - size, particle.y);
        ctx.lineTo(particle.x - size * 0.3, particle.y - size * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
        
      case PARTICLE_TYPES.SPARK:
        ctx.fillRect(particle.x, particle.y, Math.ceil(2 * scale), Math.ceil(2 * scale));
        break;
        
      case PARTICLE_TYPES.SMOKE:
        ctx.globalAlpha = opacity * (particle.life / 1000);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      default:
        ctx.fillRect(particle.x, particle.y, size, size);
    }
    
    ctx.restore();
  }

  /**
   * Render floating text
   */
  renderFloatingText(ctx, text) {
    const scale = WORLD_CONFIG.CANVAS_SIZE / 512;
    const fontSize = Math.max(10, Math.floor(12 * scale));
    
    ctx.save();
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = text.opacity;
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(text.text, text.x + 1, text.y + 1);
    
    // Text
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
    
    ctx.restore();
  }

  /**
   * Render Build Night overlay
   */
  renderBuildNightOverlay(ctx, worldState) {
    const scale = WORLD_CONFIG.CANVAS_SIZE / 512;
    const bannerHeight = Math.ceil(28 * scale);
    
    // Tint the screen
    ctx.fillStyle = 'rgba(100, 50, 150, 0.15)';
    ctx.fillRect(0, 0, WORLD_CONFIG.CANVAS_SIZE, WORLD_CONFIG.CANVAS_SIZE);
    
    // Draw "BUILD NIGHT" banner
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, WORLD_CONFIG.CANVAS_SIZE, bannerHeight);
    
    const fontSize = Math.max(12, Math.floor(14 * scale));
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.fillText('✨ BUILD NIGHT ✨', WORLD_CONFIG.CANVAS_SIZE / 2, bannerHeight * 0.6);
  }

  /**
   * Render game time indicator
   */
  renderTimeIndicator(ctx, worldState) {
    const gt = worldState.gameTime;
    const timeStr = `Day ${gt.day} ${String(gt.hour).padStart(2, '0')}:${String(gt.minute).padStart(2, '0')}`;
    const scale = WORLD_CONFIG.CANVAS_SIZE / 512;
    
    // Background
    const bgWidth = Math.ceil(120 * scale);
    const bgHeight = Math.ceil(20 * scale);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(WORLD_CONFIG.CANVAS_SIZE - bgWidth, 0, bgWidth, bgHeight);
    
    // Time text
    const fontSize = Math.max(8, Math.floor(10 * scale));
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'right';
    ctx.fillStyle = this.getTimePeriodColor(gt.period);
    ctx.fillText(timeStr, WORLD_CONFIG.CANVAS_SIZE - Math.ceil(6 * scale), bgHeight * 0.65);
  }

  /**
   * Get color based on time period
   */
  getTimePeriodColor(period) {
    switch (period) {
      case 'DAWN': return PALETTE.ORANGE;
      case 'DAY': return PALETTE.WHITE;
      case 'DUSK': return PALETTE.PEACH;
      case 'NIGHT': return PALETTE.BLUE;
      default: return PALETTE.WHITE;
    }
  }

  /**
   * Mark terrain as needing redraw
   */
  invalidateTerrain() {
    this.terrainDirty = true;
  }

  /**
   * Mark buildings as needing redraw
   */
  invalidateBuildings() {
    this.buildingsDirty = true;
  }

  /**
   * Utility: Darken a color
   */
  darkenColor(hex, amount) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return hex;
    return this.rgbToHex(
      Math.max(0, rgb.r - amount),
      Math.max(0, rgb.g - amount),
      Math.max(0, rgb.b - amount)
    );
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }
}

// Create global instance
const worldRenderer = new WorldRenderer();
