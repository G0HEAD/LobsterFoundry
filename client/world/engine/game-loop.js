/**
 * LobsterFoundry Pixel World - Game Loop
 * Main update and render loop
 */

class GameLoop {
  constructor() {
    this.running = false;
    this.lastTime = 0;
    this.deltaTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsUpdateInterval = 1000;
    this.lastFpsUpdate = 0;
    
    // Bound methods
    this.tick = this.tick.bind(this);
  }

  /**
   * Start the game loop
   */
  start() {
    if (this.running) return;
    
    this.running = true;
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    
    console.log('[GameLoop] Started');
    requestAnimationFrame(this.tick);
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.running = false;
    console.log('[GameLoop] Stopped');
  }

  /**
   * Main tick function
   */
  tick(currentTime) {
    if (!this.running) return;
    
    // Calculate delta time
    this.deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Cap delta time to prevent spiral of death
    if (this.deltaTime > 100) {
      this.deltaTime = 100;
    }
    
    // Update FPS counter
    this.frameCount++;
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = Math.round(this.frameCount * 1000 / (currentTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
    }
    
    // Update world state
    this.update(this.deltaTime);
    
    // Render
    this.render();
    
    // Schedule next frame
    requestAnimationFrame(this.tick);
  }

  /**
   * Update game state
   */
  update(deltaTime) {
    try {
      worldState.update(deltaTime);
    } catch (error) {
      console.error('[GameLoop] Update error:', error);
    }
  }

  /**
   * Render the world
   */
  render() {
    try {
      worldRenderer.render(worldState);
    } catch (error) {
      console.error('[GameLoop] Render error:', error);
    }
  }

  /**
   * Get current FPS
   */
  getFps() {
    return this.fps;
  }
}

// Create global instance
const gameLoop = new GameLoop();
