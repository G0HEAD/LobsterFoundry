/**
 * LobsterFoundry Pixel World - OpenClaw Bot Connection
 * Handles REST auth + WebSocket real-time control for OpenClaw bots
 */

class BotConnection {
  constructor() {
    this.ws = null;
    this.botId = null;
    this.authToken = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    
    // Event handlers
    this.handlers = new Map();
    
    // Message queue for offline messages
    this.messageQueue = [];
    
    // Heartbeat
    this.heartbeatInterval = null;
    this.heartbeatTimeout = 30000;
    
    // API endpoints
    this.apiBase = '/api/world';
    this.wsEndpoint = null;
  }

  /**
   * Authenticate a bot via REST API
   * @param {string} token - OpenClaw bot authentication token
   * @returns {Promise<Object>} - Authentication result with bot info and WebSocket URL
   */
  async authenticate(token) {
    try {
      const response = await fetch(`${this.apiBase}/bot/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          token: token,
          clientType: 'openclaw',
          version: '1.0.0'
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Authentication failed');
      }
      
      const data = await response.json();
      
      this.botId = data.botId;
      this.authToken = token;
      this.wsEndpoint = data.wsEndpoint;
      
      console.log(`[BotConnection] Authenticated as bot: ${this.botId}`);
      
      return {
        success: true,
        botId: this.botId,
        permissions: data.permissions,
        assignedAvatar: data.assignedAvatar
      };
    } catch (error) {
      console.error('[BotConnection] Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Connect to WebSocket for real-time control
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.authToken) {
      throw new Error('Must authenticate before connecting');
    }
    
    return new Promise((resolve, reject) => {
      const wsUrl = this.wsEndpoint || this.getDefaultWsUrl();
      
      console.log(`[BotConnection] Connecting to WebSocket: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[BotConnection] WebSocket connected');
        
        // Send authentication message
        this.send({
          type: 'BOT_AUTH',
          token: this.authToken,
          botId: this.botId
        });
        
        this.connected = true;
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Send queued messages
        this.flushMessageQueue();
        
        this.emit('connected', { botId: this.botId });
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[BotConnection] Failed to parse message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[BotConnection] WebSocket error:', error);
        this.emit('error', error);
        reject(error);
      };
      
      this.ws.onclose = (event) => {
        console.log('[BotConnection] WebSocket closed:', event.code, event.reason);
        this.connected = false;
        this.stopHeartbeat();
        
        this.emit('disconnected', { code: event.code, reason: event.reason });
        
        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && !this.reconnecting) {
          this.attemptReconnect();
        }
      };
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
    this.connected = false;
    this.stopHeartbeat();
    console.log('[BotConnection] Disconnected');
  }

  /**
   * Get default WebSocket URL based on current location
   */
  getDefaultWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/world/ws`;
  }

  /**
   * Send a message through WebSocket
   */
  send(message) {
    if (!this.connected || !this.ws) {
      // Queue message for later
      this.messageQueue.push(message);
      console.log('[BotConnection] Message queued (not connected)');
      return false;
    }
    
    this.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * Flush queued messages
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(message) {
    switch (message.type) {
      case 'AUTH_SUCCESS':
        console.log('[BotConnection] Authentication confirmed');
        this.emit('authSuccess', message.data);
        break;
        
      case 'AUTH_FAILED':
        console.error('[BotConnection] Authentication failed:', message.error);
        this.emit('authFailed', { error: message.error });
        this.disconnect();
        break;
        
      case 'AVATAR_ASSIGNED':
        console.log('[BotConnection] Avatar assigned:', message.avatarId);
        this.emit('avatarAssigned', {
          avatarId: message.avatarId,
          position: message.position
        });
        break;
        
      case 'WORLD_STATE':
        this.emit('worldState', message.state);
        break;
        
      case 'AVATAR_UPDATE':
        this.emit('avatarUpdate', message.data);
        break;
        
      case 'ACTION_RESULT':
        this.emit('actionResult', {
          actionId: message.actionId,
          success: message.success,
          result: message.result,
          error: message.error
        });
        break;
        
      case 'LEDGER_EVENT':
        this.emit('ledgerEvent', message.event);
        break;
        
      case 'BUILD_NIGHT':
        this.emit('buildNight', message.data);
        break;
        
      case 'PONG':
        // Heartbeat response received
        break;
        
      case 'ERROR':
        console.error('[BotConnection] Server error:', message.error);
        this.emit('serverError', { error: message.error });
        break;
        
      default:
        console.log('[BotConnection] Unknown message type:', message.type);
        this.emit('message', message);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.send({ type: 'PING', timestamp: Date.now() });
      }
    }, this.heartbeatTimeout / 2);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[BotConnection] Max reconnection attempts reached');
      this.emit('reconnectFailed', {});
      return;
    }
    
    this.reconnecting = true;
    this.reconnectAttempts++;
    
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[BotConnection] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('[BotConnection] Reconnection failed:', error);
        this.attemptReconnect();
      }
    }, delay);
  }

  // ============================================
  // Bot Action API
  // ============================================

  /**
   * Move avatar to a position
   */
  moveAvatar(tileX, tileY) {
    return this.sendAction('MOVE', { x: tileX, y: tileY });
  }

  /**
   * Interact with a building
   */
  interactWithBuilding(buildingId) {
    return this.sendAction('INTERACT', { buildingId });
  }

  /**
   * Submit work (triggers a WORK_SUBMISSION blueprint)
   */
  submitWork(data) {
    return this.sendAction('SUBMIT_WORK', data);
  }

  /**
   * Accept a verification job
   */
  acceptVerificationJob(jobId) {
    return this.sendAction('ACCEPT_JOB', { jobId });
  }

  /**
   * Submit a verification stamp
   */
  submitStamp(jobId, decision, evidence = []) {
    return this.sendAction('SUBMIT_STAMP', { jobId, decision, evidence });
  }

  /**
   * Perform a craft action
   */
  craft(recipe, inputs) {
    return this.sendAction('CRAFT', { recipe, inputs });
  }

  /**
   * Read information from a terminal/board
   */
  read(targetId) {
    return this.sendAction('READ', { targetId });
  }

  /**
   * Send an action to the server
   */
  sendAction(actionType, payload) {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    return new Promise((resolve, reject) => {
      // Set up one-time handler for this action's result
      const handler = (result) => {
        if (result.actionId === actionId) {
          this.off('actionResult', handler);
          if (result.success) {
            resolve(result.result);
          } else {
            reject(new Error(result.error || 'Action failed'));
          }
        }
      };
      
      this.on('actionResult', handler);
      
      // Send the action
      this.send({
        type: 'BOT_ACTION',
        actionId,
        actionType,
        payload,
        timestamp: Date.now()
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        this.off('actionResult', handler);
        reject(new Error('Action timed out'));
      }, 30000);
    });
  }

  // ============================================
  // Event System
  // ============================================

  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  /**
   * Remove event handler
   */
  off(event, handler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  emit(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get current bot ID
   */
  getBotId() {
    return this.botId;
  }
}

// Create global instance
const botConnection = new BotConnection();

// ============================================
// Spectator Stream Connection (for humans)
// ============================================

class SpectatorStream {
  constructor() {
    this.eventSource = null;
    this.connected = false;
    this.handlers = new Map();
  }

  /**
   * Connect to the spectator stream
   */
  connect() {
    if (this.eventSource) {
      this.disconnect();
    }
    
    console.log('[SpectatorStream] Connecting...');
    
    this.eventSource = new EventSource('/api/world/stream');
    
    this.eventSource.onopen = () => {
      console.log('[SpectatorStream] Connected');
      this.connected = true;
      this.emit('connected', {});
    };
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('[SpectatorStream] Failed to parse message:', error);
      }
    };
    
    this.eventSource.addEventListener('world_state', (event) => {
      const data = JSON.parse(event.data);
      this.emit('worldState', data);
    });
    
    this.eventSource.addEventListener('avatar_update', (event) => {
      const data = JSON.parse(event.data);
      this.emit('avatarUpdate', data);
    });
    
    this.eventSource.addEventListener('ledger_event', (event) => {
      const data = JSON.parse(event.data);
      this.emit('ledgerEvent', data);
    });
    
    this.eventSource.addEventListener('build_night', (event) => {
      const data = JSON.parse(event.data);
      this.emit('buildNight', data);
    });
    
    this.eventSource.onerror = (error) => {
      console.error('[SpectatorStream] Error:', error);
      this.connected = false;
      this.emit('error', error);
    };
  }

  /**
   * Disconnect from the stream
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }

  /**
   * Handle generic messages
   */
  handleMessage(data) {
    this.emit('message', data);
  }

  /**
   * Event system
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  off(event, handler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }
}

// Create global instance
const spectatorStream = new SpectatorStream();
