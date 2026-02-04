/**
 * LobsterFoundry Pixel World - Constants
 * Core configuration for the pixel world engine
 */

const WORLD_CONFIG = {
  // Tile and world dimensions
  TILE_SIZE: 20,           // Base tile size in pixels (larger for better visibility)
  WORLD_WIDTH: 32,         // World width in tiles
  WORLD_HEIGHT: 32,        // World height in tiles
  CANVAS_SIZE: 640,        // Canvas size in pixels
  SCALE: 1,                // Render scale
  
  // Timing
  TICK_RATE: 60,           // Ticks per second
  TICK_MS: 1000 / 60,      // Milliseconds per tick
  ANIMATION_SPEED: 150,    // Default animation frame duration in ms
  
  // Game time
  TICKS_PER_GAME_MINUTE: 2,
  MINUTES_PER_GAME_HOUR: 60,
  HOURS_PER_GAME_DAY: 24,
  
  // Avatar movement
  AVATAR_SPEED: 2,         // Pixels per tick when walking
  PATH_RECALC_INTERVAL: 500, // Recalculate path every N ms
};

// District definitions with boundaries (in tiles)
const DISTRICTS = {
  LANDING: {
    id: 'landing',
    name: 'The Landing',
    color: '#4a9079',
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    description: 'Newcomer arrival area'
  },
  TOWN_HALL: {
    id: 'townhall',
    name: 'Town Hall',
    color: '#c49a4a',
    bounds: { x: 10, y: 0, width: 12, height: 10 },
    description: 'Civic center and governance'
  },
  WORKYARD: {
    id: 'workyard',
    name: 'The Workyard',
    color: '#9c4a2f',
    bounds: { x: 22, y: 0, width: 10, height: 16 },
    description: 'Production and crafting'
  },
  VERIFICATION: {
    id: 'verification',
    name: 'Verification Guild',
    color: '#8b5cf6',
    bounds: { x: 0, y: 10, width: 10, height: 12 },
    description: 'Reviewer headquarters'
  },
  ARCHIVES: {
    id: 'archives',
    name: 'Archives',
    color: '#3b82f6',
    bounds: { x: 10, y: 10, width: 12, height: 12 },
    description: 'History and curation'
  },
  QUARANTINE: {
    id: 'quarantine',
    name: 'Quarantine Bazaar',
    color: '#ef4444',
    bounds: { x: 0, y: 22, width: 16, height: 10 },
    description: 'Trial zone for new stalls'
  },
  LEDGER_WALL: {
    id: 'ledger',
    name: 'Ledger Wall',
    color: '#1b6f6a',
    bounds: { x: 16, y: 22, width: 16, height: 10 },
    description: 'Public history display'
  }
};

// Building types and their properties
const BUILDINGS = {
  FORGE_STALL: {
    id: 'forge_stall',
    name: 'Forge Stall',
    size: { width: 3, height: 3 },
    district: 'workyard',
    color: '#ff6b35',
    interactions: ['SUBMIT_WORK', 'CRAFT']
  },
  STAMP_DESK: {
    id: 'stamp_desk',
    name: 'Stamp Desk',
    size: { width: 2, height: 2 },
    district: 'verification',
    color: '#8b5cf6',
    interactions: ['SUBMIT_STAMP', 'ACCEPT_JOB']
  },
  NOTICE_BOARD: {
    id: 'notice_board',
    name: 'Notice Board',
    size: { width: 2, height: 2 },
    district: 'townhall',
    color: '#c49a4a',
    interactions: ['READ_BOARD', 'ACCEPT_JOB']
  },
  LEDGER_TERMINAL: {
    id: 'ledger_terminal',
    name: 'Ledger Terminal',
    size: { width: 2, height: 2 },
    district: 'ledger',
    color: '#1b6f6a',
    interactions: ['READ']
  },
  WELCOME_BOOTH: {
    id: 'welcome_booth',
    name: 'Welcome Booth',
    size: { width: 2, height: 2 },
    district: 'landing',
    color: '#4a9079',
    interactions: ['READ']
  },
  FURNACE: {
    id: 'furnace',
    name: 'Furnace',
    size: { width: 2, height: 2 },
    district: 'workyard',
    color: '#ef4444',
    interactions: ['CRAFT', 'BURN']
  },
  MUSEUM_HALL: {
    id: 'museum_hall',
    name: 'Museum Hall',
    size: { width: 4, height: 3 },
    district: 'archives',
    color: '#3b82f6',
    interactions: ['READ', 'PUBLISH']
  }
};

// Avatar states
const AVATAR_STATES = {
  IDLE: 'IDLE',
  WALKING: 'WALKING',
  WORKING: 'WORKING',
  VERIFYING: 'VERIFYING',
  CRAFTING: 'CRAFTING',
  CONVERSING: 'CONVERSING',
  READING: 'READING',
  CELEBRATING: 'CELEBRATING'
};

// Avatar facing directions
const DIRECTIONS = {
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W'
};

// School colors for avatar badges
const SCHOOL_COLORS = {
  MINING: '#8b4513',
  SMITHING: '#ff6b35',
  COOKING: '#22c55e',
  CARTOGRAPHY: '#3b82f6',
  ARCHIVIST: '#8b5cf6',
  VERIFICATION: '#f59e0b',
  MODERATION: '#ef4444'
};

// World action types (verbs)
const WORLD_ACTIONS = {
  MOVE: 'MOVE',
  INTERACT: 'INTERACT',
  SUBMIT_WORK: 'SUBMIT_WORK',
  ACCEPT_JOB: 'ACCEPT_JOB',
  SUBMIT_STAMP: 'SUBMIT_STAMP',
  CRAFT: 'CRAFT',
  BURN: 'BURN',
  READ: 'READ',
  CONVERSE: 'CONVERSE',
  CELEBRATE: 'CELEBRATE'
};

// Event types for the pixel world
const WORLD_EVENTS = {
  AVATAR_SPAWN: 'AVATAR_SPAWN',
  AVATAR_MOVE: 'AVATAR_MOVE',
  AVATAR_ACTION: 'AVATAR_ACTION',
  AVATAR_DESPAWN: 'AVATAR_DESPAWN',
  BUILDING_ACTIVATE: 'BUILDING_ACTIVATE',
  PARTICLE_SPAWN: 'PARTICLE_SPAWN',
  MINT_CELEBRATION: 'MINT_CELEBRATION',
  BUILD_NIGHT_START: 'BUILD_NIGHT_START',
  BUILD_NIGHT_END: 'BUILD_NIGHT_END',
  LEDGER_EVENT: 'LEDGER_EVENT'
};

// Particle types for visual effects
const PARTICLE_TYPES = {
  SPARK: 'SPARK',
  SMOKE: 'SMOKE',
  STAR: 'STAR',
  COIN: 'COIN',
  STAMP: 'STAMP',
  FIRE: 'FIRE'
};

// Color palette (Dawnbringer 16 inspired)
const PALETTE = {
  BLACK: '#140c1c',
  DARK_PURPLE: '#442434',
  DARK_BLUE: '#30346d',
  DARK_GRAY: '#4e4a4e',
  BROWN: '#854c30',
  DARK_GREEN: '#346524',
  RED: '#d04648',
  GRAY: '#757161',
  BLUE: '#597dce',
  ORANGE: '#d27d2c',
  LIGHT_GRAY: '#8595a1',
  GREEN: '#6daa2c',
  PEACH: '#d2aa99',
  CYAN: '#6dc2ca',
  YELLOW: '#dad45e',
  WHITE: '#deeed6'
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WORLD_CONFIG,
    DISTRICTS,
    BUILDINGS,
    AVATAR_STATES,
    DIRECTIONS,
    SCHOOL_COLORS,
    WORLD_ACTIONS,
    WORLD_EVENTS,
    PARTICLE_TYPES,
    PALETTE
  };
}
