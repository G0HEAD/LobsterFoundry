/**
 * LobsterFoundry Pixel World - Avatar System
 * Handles avatar rendering, animation, and state
 */

class Avatar {
  constructor(config) {
    this.id = config.id || `avatar_${Date.now()}`;
    this.name = config.name || 'Settler';
    this.botId = config.botId || null; // OpenClaw bot ID if controlled by a bot
    
    // Position (in pixels, not tiles)
    this.x = (config.x || 0) * WORLD_CONFIG.TILE_SIZE;
    this.y = (config.y || 0) * WORLD_CONFIG.TILE_SIZE;
    this.targetX = this.x;
    this.targetY = this.y;
    
    // State
    this.state = AVATAR_STATES.IDLE;
    this.facing = DIRECTIONS.SOUTH;
    this.school = config.school || null;
    this.licenseTier = config.licenseTier || 'VISITOR';
    
    // Animation
    this.animationFrame = 0;
    this.animationTimer = 0;
    this.animationSpeed = WORLD_CONFIG.ANIMATION_SPEED;
    
    // Path finding
    this.path = [];
    this.pathIndex = 0;
    
    // Visual customization
    this.color = config.color || this.getSchoolColor();
    this.spriteData = null;
    
    // Generate sprite
    this.generateSprite();
  }

  /**
   * Get color based on school
   */
  getSchoolColor() {
    if (this.school && SCHOOL_COLORS[this.school]) {
      return SCHOOL_COLORS[this.school];
    }
    return PALETTE.BLUE;
  }

  /**
   * Generate a procedural pixel art sprite
   */
  generateSprite() {
    const size = WORLD_CONFIG.TILE_SIZE;
    
    // Create sprite sheets for each direction and state
    this.sprites = {
      idle: {},
      walk: {}
    };

    // Generate for each direction
    Object.values(DIRECTIONS).forEach(dir => {
      this.sprites.idle[dir] = this.createIdleFrames(dir);
      this.sprites.walk[dir] = this.createWalkFrames(dir);
    });
  }

  /**
   * Create idle animation frames
   */
  createIdleFrames(direction) {
    const frames = [];
    const size = WORLD_CONFIG.TILE_SIZE;
    const scale = size / 16; // Scale factor relative to base 16px
    
    for (let f = 0; f < 2; f++) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      // Clear
      ctx.clearRect(0, 0, size, size);
      
      // Body (slightly bob on frame 1)
      const bobOffset = f === 1 ? -1 * scale : 0;
      
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(size / 2, size * 0.9, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Body
      ctx.fillStyle = this.color;
      ctx.fillRect(size * 0.25, size * 0.35 + bobOffset, size * 0.5, size * 0.5);
      
      // Head
      ctx.fillStyle = PALETTE.PEACH;
      ctx.fillRect(size * 0.25, size * 0.1 + bobOffset, size * 0.5, size * 0.35);
      
      // Eyes based on direction
      ctx.fillStyle = PALETTE.BLACK;
      const eyeSize = Math.max(2, size * 0.12);
      if (direction === 'S') {
        ctx.fillRect(size * 0.3, size * 0.22 + bobOffset, eyeSize, eyeSize);
        ctx.fillRect(size * 0.55, size * 0.22 + bobOffset, eyeSize, eyeSize);
      } else if (direction === 'N') {
        // Back of head - no eyes
      } else if (direction === 'E') {
        ctx.fillRect(size * 0.55, size * 0.22 + bobOffset, eyeSize, eyeSize);
      } else if (direction === 'W') {
        ctx.fillRect(size * 0.3, size * 0.22 + bobOffset, eyeSize, eyeSize);
      }
      
      // School badge
      if (this.school) {
        ctx.fillStyle = SCHOOL_COLORS[this.school] || PALETTE.GRAY;
        ctx.fillRect(size * 0.68, size * 0.4 + bobOffset, size * 0.18, size * 0.18);
      }
      
      // Feet
      ctx.fillStyle = PALETTE.BROWN;
      const feetY = size * 0.85;
      const feetW = size * 0.18;
      const feetH = size * 0.12;
      ctx.fillRect(size * 0.25, feetY, feetW, feetH);
      ctx.fillRect(size * 0.55, feetY, feetW, feetH);
      
      frames.push(canvas);
    }
    
    return frames;
  }

  /**
   * Create walk animation frames
   */
  createWalkFrames(direction) {
    const frames = [];
    const size = WORLD_CONFIG.TILE_SIZE;
    const scale = size / 16;
    
    for (let f = 0; f < 4; f++) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      ctx.clearRect(0, 0, size, size);
      
      // Walking motion offsets
      const bobOffset = (f === 1 || f === 3) ? -1 * scale : 0;
      const legOffset = [0, 2, 0, -2][f] * scale;
      
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(size / 2, size * 0.9, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Body
      ctx.fillStyle = this.color;
      ctx.fillRect(size * 0.25, size * 0.35 + bobOffset, size * 0.5, size * 0.5);
      
      // Head
      ctx.fillStyle = PALETTE.PEACH;
      ctx.fillRect(size * 0.25, size * 0.1 + bobOffset, size * 0.5, size * 0.35);
      
      // Eyes
      ctx.fillStyle = PALETTE.BLACK;
      const eyeSize = Math.max(2, size * 0.12);
      if (direction === 'S') {
        ctx.fillRect(size * 0.3, size * 0.22 + bobOffset, eyeSize, eyeSize);
        ctx.fillRect(size * 0.55, size * 0.22 + bobOffset, eyeSize, eyeSize);
      } else if (direction === 'E') {
        ctx.fillRect(size * 0.55, size * 0.22 + bobOffset, eyeSize, eyeSize);
      } else if (direction === 'W') {
        ctx.fillRect(size * 0.3, size * 0.22 + bobOffset, eyeSize, eyeSize);
      }
      
      // School badge
      if (this.school) {
        ctx.fillStyle = SCHOOL_COLORS[this.school] || PALETTE.GRAY;
        ctx.fillRect(size * 0.68, size * 0.4 + bobOffset, size * 0.18, size * 0.18);
      }
      
      // Feet with walking animation
      ctx.fillStyle = PALETTE.BROWN;
      const feetY = size * 0.85;
      const feetW = size * 0.18;
      const feetH = size * 0.12;
      ctx.fillRect(size * 0.25 + legOffset, feetY, feetW, feetH);
      ctx.fillRect(size * 0.55 - legOffset, feetY, feetW, feetH);
      
      frames.push(canvas);
    }
    
    return frames;
  }

  /**
   * Update avatar state
   */
  update(deltaTime) {
    // Update animation timer
    this.animationTimer += deltaTime;
    if (this.animationTimer >= this.animationSpeed) {
      this.animationTimer = 0;
      this.animationFrame++;
    }

    // Movement
    if (this.state === AVATAR_STATES.WALKING) {
      this.updateMovement(deltaTime);
    }
    
    // Clamp animation frame
    const maxFrames = this.state === AVATAR_STATES.WALKING ? 4 : 2;
    this.animationFrame = this.animationFrame % maxFrames;
  }

  /**
   * Update movement along path
   */
  updateMovement(deltaTime) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) {
      this.state = AVATAR_STATES.IDLE;
      return;
    }

    const target = this.path[this.pathIndex];
    const targetX = target.x * WORLD_CONFIG.TILE_SIZE;
    const targetY = target.y * WORLD_CONFIG.TILE_SIZE;
    
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < WORLD_CONFIG.AVATAR_SPEED) {
      // Reached waypoint
      this.x = targetX;
      this.y = targetY;
      this.pathIndex++;
      
      if (this.pathIndex >= this.path.length) {
        this.state = AVATAR_STATES.IDLE;
        this.path = [];
        this.pathIndex = 0;
      }
    } else {
      // Move towards target
      const speed = WORLD_CONFIG.AVATAR_SPEED;
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
      
      // Update facing direction
      if (Math.abs(dx) > Math.abs(dy)) {
        this.facing = dx > 0 ? DIRECTIONS.EAST : DIRECTIONS.WEST;
      } else {
        this.facing = dy > 0 ? DIRECTIONS.SOUTH : DIRECTIONS.NORTH;
      }
    }
  }

  /**
   * Set a path for the avatar to follow
   */
  setPath(path) {
    this.path = path;
    this.pathIndex = 0;
    if (path.length > 0) {
      this.state = AVATAR_STATES.WALKING;
    }
  }

  /**
   * Move to a specific tile
   */
  moveTo(tileX, tileY) {
    // Simple direct path for now
    // TODO: Implement A* pathfinding
    this.setPath([{ x: tileX, y: tileY }]);
  }

  /**
   * Perform an action
   */
  performAction(action, target) {
    switch (action) {
      case WORLD_ACTIONS.SUBMIT_WORK:
      case WORLD_ACTIONS.CRAFT:
        this.state = AVATAR_STATES.WORKING;
        this.animationSpeed = 100;
        break;
      case WORLD_ACTIONS.SUBMIT_STAMP:
      case WORLD_ACTIONS.ACCEPT_JOB:
        this.state = AVATAR_STATES.VERIFYING;
        this.animationSpeed = 150;
        break;
      case WORLD_ACTIONS.READ:
        this.state = AVATAR_STATES.READING;
        this.animationSpeed = 300;
        break;
      case WORLD_ACTIONS.CELEBRATE:
        this.state = AVATAR_STATES.CELEBRATING;
        this.animationSpeed = 80;
        break;
      default:
        this.state = AVATAR_STATES.IDLE;
        this.animationSpeed = WORLD_CONFIG.ANIMATION_SPEED;
    }
  }

  /**
   * Get the current sprite frame to render
   */
  getCurrentSprite() {
    const spriteSet = this.state === AVATAR_STATES.WALKING ? this.sprites.walk : this.sprites.idle;
    const frames = spriteSet[this.facing] || spriteSet[DIRECTIONS.SOUTH];
    return frames[this.animationFrame % frames.length];
  }

  /**
   * Render the avatar to a context
   */
  render(ctx) {
    const sprite = this.getCurrentSprite();
    if (sprite) {
      ctx.drawImage(sprite, Math.round(this.x), Math.round(this.y));
    }
    
    // Render name tag
    this.renderNameTag(ctx);
  }

  /**
   * Render name tag above avatar
   */
  renderNameTag(ctx) {
    const scale = WORLD_CONFIG.TILE_SIZE / 16;
    const fontSize = Math.max(8, Math.floor(8 * scale));
    const tagY = this.y - Math.ceil(4 * scale);
    const tagX = this.x + WORLD_CONFIG.TILE_SIZE / 2;
    
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(this.name, tagX + 1, tagY + 1);
    
    // Text
    ctx.fillStyle = '#fff';
    ctx.fillText(this.name, tagX, tagY);
  }

  /**
   * Get tile position
   */
  getTilePosition() {
    return {
      x: Math.floor(this.x / WORLD_CONFIG.TILE_SIZE),
      y: Math.floor(this.y / WORLD_CONFIG.TILE_SIZE)
    };
  }

  /**
   * Check if avatar is controlled by a bot
   */
  isBot() {
    return this.botId !== null;
  }

  /**
   * Serialize avatar state for network transmission
   */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      botId: this.botId,
      x: this.x,
      y: this.y,
      state: this.state,
      facing: this.facing,
      school: this.school,
      licenseTier: this.licenseTier,
      animationFrame: this.animationFrame
    };
  }

  /**
   * Update from serialized state
   */
  deserialize(data) {
    if (data.x !== undefined) this.x = data.x;
    if (data.y !== undefined) this.y = data.y;
    if (data.state !== undefined) this.state = data.state;
    if (data.facing !== undefined) this.facing = data.facing;
    if (data.animationFrame !== undefined) this.animationFrame = data.animationFrame;
  }
}

// Avatar factory
const AvatarFactory = {
  /**
   * Create a demo avatar
   */
  createDemo(index = 0) {
    const schools = Object.keys(SCHOOL_COLORS);
    const names = ['Settler-001', 'Verifier-001', 'Crafter-001'];
    const positions = [
      { x: 5, y: 5 },
      { x: 15, y: 8 },
      { x: 25, y: 12 }
    ];
    
    return new Avatar({
      id: `demo_${index}`,
      name: names[index % names.length],
      x: positions[index % positions.length].x,
      y: positions[index % positions.length].y,
      school: schools[index % schools.length]
    });
  },

  /**
   * Create an avatar for an OpenClaw bot
   */
  createForBot(botId, config = {}) {
    return new Avatar({
      ...config,
      botId: botId,
      name: config.name || `Bot-${botId.slice(0, 6)}`
    });
  }
};
