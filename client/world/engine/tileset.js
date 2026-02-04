/**
 * LobsterFoundry Pixel World - Tileset Manager
 * Handles tile rendering with procedurally generated pixel art
 * (Can be replaced with actual tileset images later)
 */

class TilesetManager {
  constructor() {
    this.tileSize = WORLD_CONFIG.TILE_SIZE;
    this.tileCache = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the tileset manager
   */
  async init() {
    // Generate base tiles procedurally
    this.generateBaseTiles();
    this.initialized = true;
    console.log('[Tileset] Initialized with procedural tiles');
  }

  /**
   * Generate base tiles procedurally (8-bit style)
   */
  generateBaseTiles() {
    // Grass tile variations
    for (let i = 0; i < 4; i++) {
      this.tileCache.set(`grass_${i}`, this.createGrassTile(i));
    }
    
    // Path/road tiles
    this.tileCache.set('path_h', this.createPathTile('horizontal'));
    this.tileCache.set('path_v', this.createPathTile('vertical'));
    this.tileCache.set('path_cross', this.createPathTile('cross'));
    this.tileCache.set('path_corner_ne', this.createPathTile('corner_ne'));
    this.tileCache.set('path_corner_nw', this.createPathTile('corner_nw'));
    this.tileCache.set('path_corner_se', this.createPathTile('corner_se'));
    this.tileCache.set('path_corner_sw', this.createPathTile('corner_sw'));
    
    // Water tiles
    this.tileCache.set('water', this.createWaterTile());
    
    // Building tiles (simple colored blocks for now)
    Object.entries(BUILDINGS).forEach(([key, building]) => {
      this.tileCache.set(`building_${building.id}`, this.createBuildingTile(building));
    });
    
    // District ground tiles
    Object.entries(DISTRICTS).forEach(([key, district]) => {
      this.tileCache.set(`district_${district.id}`, this.createDistrictTile(district));
    });
  }

  /**
   * Create a grass tile with variation
   */
  createGrassTile(variant) {
    const canvas = document.createElement('canvas');
    canvas.width = this.tileSize;
    canvas.height = this.tileSize;
    const ctx = canvas.getContext('2d');
    const scale = this.tileSize / 16;
    
    // Base green
    ctx.fillStyle = PALETTE.DARK_GREEN;
    ctx.fillRect(0, 0, this.tileSize, this.tileSize);
    
    // Add grass detail pixels
    ctx.fillStyle = PALETTE.GREEN;
    const seed = variant * 1000;
    const detailCount = Math.floor(8 * scale);
    for (let i = 0; i < detailCount; i++) {
      const x = this.seededRandom(seed + i) * this.tileSize | 0;
      const y = this.seededRandom(seed + i + 100) * this.tileSize | 0;
      ctx.fillRect(x, y, Math.ceil(scale), Math.ceil(2 * scale));
    }
    
    // Add lighter highlights
    ctx.fillStyle = '#7ec850';
    const highlightCount = Math.floor(4 * scale);
    for (let i = 0; i < highlightCount; i++) {
      const x = this.seededRandom(seed + i + 200) * this.tileSize | 0;
      const y = this.seededRandom(seed + i + 300) * this.tileSize | 0;
      ctx.fillRect(x, y, Math.ceil(scale), Math.ceil(scale));
    }
    
    return canvas;
  }

  /**
   * Create a path/road tile
   */
  createPathTile(type) {
    const canvas = document.createElement('canvas');
    canvas.width = this.tileSize;
    canvas.height = this.tileSize;
    const ctx = canvas.getContext('2d');
    const size = this.tileSize;
    
    // Base dirt color
    ctx.fillStyle = PALETTE.BROWN;
    ctx.fillRect(0, 0, size, size);
    
    // Path pattern based on type (using proportional sizes)
    ctx.fillStyle = '#a67c52';
    const pathWidth = size * 0.5;
    const pathStart = size * 0.25;
    
    switch (type) {
      case 'horizontal':
        ctx.fillRect(0, pathStart, size, pathWidth);
        break;
      case 'vertical':
        ctx.fillRect(pathStart, 0, pathWidth, size);
        break;
      case 'cross':
        ctx.fillRect(0, pathStart, size, pathWidth);
        ctx.fillRect(pathStart, 0, pathWidth, size);
        break;
      case 'corner_ne':
        ctx.fillRect(pathStart, pathStart, size * 0.75, pathWidth);
        ctx.fillRect(pathStart, 0, pathWidth, size * 0.75);
        break;
      case 'corner_nw':
        ctx.fillRect(0, pathStart, size * 0.75, pathWidth);
        ctx.fillRect(pathStart, 0, pathWidth, size * 0.75);
        break;
      case 'corner_se':
        ctx.fillRect(pathStart, pathStart, size * 0.75, pathWidth);
        ctx.fillRect(pathStart, pathStart, pathWidth, size * 0.75);
        break;
      case 'corner_sw':
        ctx.fillRect(0, pathStart, size * 0.75, pathWidth);
        ctx.fillRect(pathStart, pathStart, pathWidth, size * 0.75);
        break;
    }
    
    // Add some texture
    ctx.fillStyle = PALETTE.PEACH;
    const scale = size / 16;
    for (let i = 0; i < Math.floor(6 * scale); i++) {
      const x = (Math.random() * size) | 0;
      const y = (Math.random() * size) | 0;
      ctx.fillRect(x, y, Math.ceil(scale), Math.ceil(scale));
    }
    
    return canvas;
  }

  /**
   * Create a water tile
   */
  createWaterTile() {
    const canvas = document.createElement('canvas');
    canvas.width = this.tileSize;
    canvas.height = this.tileSize;
    const ctx = canvas.getContext('2d');
    const size = this.tileSize;
    const scale = size / 16;
    
    // Base water color
    ctx.fillStyle = PALETTE.DARK_BLUE;
    ctx.fillRect(0, 0, size, size);
    
    // Wave highlights
    ctx.fillStyle = PALETTE.BLUE;
    ctx.fillRect(size * 0.12, size * 0.25, size * 0.25, Math.ceil(scale));
    ctx.fillRect(size * 0.6, size * 0.5, size * 0.25, Math.ceil(scale));
    ctx.fillRect(size * 0.25, size * 0.75, size * 0.2, Math.ceil(scale));
    
    // Lighter highlights
    ctx.fillStyle = PALETTE.CYAN;
    ctx.fillRect(size * 0.18, size * 0.25, size * 0.12, Math.ceil(scale));
    ctx.fillRect(size * 0.68, size * 0.5, size * 0.12, Math.ceil(scale));
    
    return canvas;
  }

  /**
   * Create a building tile
   */
  createBuildingTile(building) {
    const canvas = document.createElement('canvas');
    canvas.width = this.tileSize * building.size.width;
    canvas.height = this.tileSize * building.size.height;
    const ctx = canvas.getContext('2d');
    
    const w = canvas.width;
    const h = canvas.height;
    const scale = this.tileSize / 16;
    
    // Building base
    ctx.fillStyle = building.color;
    const margin = Math.ceil(2 * scale);
    const roofHeight = Math.ceil(6 * scale);
    ctx.fillRect(margin, roofHeight, w - margin * 2, h - roofHeight - margin);
    
    // Roof
    ctx.fillStyle = this.darkenColor(building.color, 30);
    ctx.fillRect(0, 0, w, roofHeight);
    
    // Shadow
    ctx.fillStyle = this.darkenColor(building.color, 50);
    const shadowWidth = Math.ceil(4 * scale);
    ctx.fillRect(w - shadowWidth, roofHeight, shadowWidth, h - roofHeight - margin);
    ctx.fillRect(margin, h - shadowWidth, w - margin, shadowWidth);
    
    // Door
    ctx.fillStyle = PALETTE.BROWN;
    const doorW = Math.ceil(6 * scale);
    const doorH = Math.ceil(10 * scale);
    const doorX = (w / 2 - doorW / 2) | 0;
    ctx.fillRect(doorX, h - doorH - margin, doorW, doorH);
    
    // Window(s)
    ctx.fillStyle = PALETTE.CYAN;
    const winSize = Math.ceil(5 * scale);
    const winY = Math.ceil(12 * scale);
    if (w > this.tileSize * 2) {
      ctx.fillRect(Math.ceil(6 * scale), winY, winSize, winSize);
      ctx.fillRect(w - winSize - Math.ceil(6 * scale), winY, winSize, winSize);
    } else {
      ctx.fillRect((w / 2 - winSize / 2) | 0, winY, winSize, winSize);
    }
    
    // Highlight
    ctx.fillStyle = this.lightenColor(building.color, 20);
    ctx.fillRect(Math.ceil(4 * scale), roofHeight + margin, Math.ceil(2 * scale), h - roofHeight - margin * 3);
    
    return canvas;
  }

  /**
   * Create a district ground tile
   */
  createDistrictTile(district) {
    const canvas = document.createElement('canvas');
    canvas.width = this.tileSize;
    canvas.height = this.tileSize;
    const ctx = canvas.getContext('2d');
    const size = this.tileSize;
    const scale = size / 16;
    
    // Base color (muted version of district color)
    const baseColor = this.desaturateColor(district.color, 0.6);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    // Add subtle pattern
    ctx.fillStyle = this.lightenColor(baseColor, 10);
    const step = Math.ceil(4 * scale);
    const patSize = Math.ceil(2 * scale);
    for (let x = 0; x < size; x += step) {
      for (let y = 0; y < size; y += step) {
        if ((x + y) % (step * 2) === 0) {
          ctx.fillRect(x, y, patSize, patSize);
        }
      }
    }
    
    return canvas;
  }

  /**
   * Get a tile by name
   */
  getTile(name) {
    return this.tileCache.get(name);
  }

  /**
   * Draw a tile to a context
   */
  drawTile(ctx, tileName, x, y) {
    const tile = this.tileCache.get(tileName);
    if (tile) {
      ctx.drawImage(tile, x, y);
    }
  }

  // Utility functions
  seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
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

  darkenColor(hex, amount) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return hex;
    return this.rgbToHex(
      rgb.r - amount,
      rgb.g - amount,
      rgb.b - amount
    );
  }

  lightenColor(hex, amount) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return hex;
    return this.rgbToHex(
      rgb.r + amount,
      rgb.g + amount,
      rgb.b + amount
    );
  }

  desaturateColor(hex, factor) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return hex;
    const gray = (rgb.r + rgb.g + rgb.b) / 3;
    return this.rgbToHex(
      (rgb.r * factor + gray * (1 - factor)) | 0,
      (rgb.g * factor + gray * (1 - factor)) | 0,
      (rgb.b * factor + gray * (1 - factor)) | 0
    );
  }
}

// Create global instance
const tilesetManager = new TilesetManager();
