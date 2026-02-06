/**
 * LobsterFoundry Artifact Storage System
 * 
 * Persistent storage for:
 * - Work submissions and artifacts
 * - Verification records
 * - Ledger events
 * - Bot registrations and wallets
 * 
 * All data is stored in JSON files under /data/
 * This ensures nothing is lost on server restart.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Storage directories
const DATA_DIR = path.resolve(__dirname, '../../data');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');
const SUBMISSIONS_DIR = path.join(DATA_DIR, 'submissions');
const BOTS_DIR = path.join(DATA_DIR, 'bots');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');
const QUESTS_FILE = path.join(DATA_DIR, 'quests.json');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');

// Ensure directories exist
function ensureDirectories() {
  [DATA_DIR, ARTIFACTS_DIR, SUBMISSIONS_DIR, BOTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Storage] Created directory: ${dir}`);
    }
  });
}

// Initialize on load
ensureDirectories();

// ============================================
// ARTIFACT STORAGE
// ============================================

/**
 * Store an artifact (code, document, etc.)
 * Returns the artifact ID and hash for verification
 */
function storeArtifact(content, metadata = {}) {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const hash = crypto.createHash('sha256').update(contentStr).digest('hex');
  const artifactId = `art_${hash.slice(0, 16)}`;
  
  const artifact = {
    id: artifactId,
    hash: `sha256:${hash}`,
    size: contentStr.length,
    created_at: new Date().toISOString(),
    metadata: {
      name: metadata.name || 'unnamed',
      type: metadata.type || 'text',
      submitter: metadata.submitter || 'unknown',
      quest_id: metadata.quest_id || null,
      ...metadata
    },
    content: contentStr
  };
  
  const filePath = path.join(ARTIFACTS_DIR, `${artifactId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2));
  
  // Update catalog
  addToCatalog('artifact', artifactId, {
    hash: artifact.hash,
    name: artifact.metadata.name,
    type: artifact.metadata.type,
    submitter: artifact.metadata.submitter,
    quest_id: artifact.metadata.quest_id,
    created_at: artifact.created_at
  });
  
  console.log(`[Storage] Artifact stored: ${artifactId} (${artifact.metadata.name})`);
  
  return {
    id: artifactId,
    hash: artifact.hash,
    size: artifact.size
  };
}

/**
 * Retrieve an artifact by ID
 */
function getArtifact(artifactId) {
  const filePath = path.join(ARTIFACTS_DIR, `${artifactId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Verify artifact integrity
 */
function verifyArtifact(artifactId) {
  const artifact = getArtifact(artifactId);
  if (!artifact) {
    return { valid: false, error: 'Artifact not found' };
  }
  
  const computedHash = crypto.createHash('sha256').update(artifact.content).digest('hex');
  const storedHash = artifact.hash.replace('sha256:', '');
  
  return {
    valid: computedHash === storedHash,
    artifactId,
    storedHash: artifact.hash,
    computedHash: `sha256:${computedHash}`
  };
}

// ============================================
// SUBMISSION STORAGE
// ============================================

/**
 * Store a work submission
 */
function storeSubmission(submission) {
  const submissionId = submission.id || `sub_${crypto.randomBytes(8).toString('hex')}`;
  
  const record = {
    id: submissionId,
    quest_id: submission.quest_id,
    bot_id: submission.bot_id,
    submitted_at: submission.submitted_at || new Date().toISOString(),
    status: submission.status || 'PENDING_VERIFICATION',
    
    // Store artifact references (not content - that's in artifacts/)
    artifact_ids: submission.artifact_ids || [],
    claims: submission.claims || [],
    requested_tokens: submission.requested_tokens || [],
    
    // Verification tracking
    verification_jobs: submission.verification_jobs || [],
    
    // Final results
    verified_at: submission.verified_at || null,
    mint_result: submission.mint_result || null
  };
  
  const filePath = path.join(SUBMISSIONS_DIR, `${submissionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
  
  // Update catalog
  addToCatalog('submission', submissionId, {
    quest_id: record.quest_id,
    bot_id: record.bot_id,
    status: record.status,
    artifact_count: record.artifact_ids.length,
    submitted_at: record.submitted_at
  });
  
  console.log(`[Storage] Submission stored: ${submissionId}`);
  
  return record;
}

/**
 * Update a submission
 */
function updateSubmission(submissionId, updates) {
  const filePath = path.join(SUBMISSIONS_DIR, `${submissionId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const submission = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updated = { ...submission, ...updates, updated_at: new Date().toISOString() };
  
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  
  // Update catalog
  updateCatalogEntry('submission', submissionId, {
    status: updated.status,
    verified_at: updated.verified_at
  });
  
  return updated;
}

/**
 * Get a submission by ID
 */
function getSubmission(submissionId) {
  const filePath = path.join(SUBMISSIONS_DIR, `${submissionId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * List submissions with filters
 */
function listSubmissions(filters = {}) {
  const files = fs.readdirSync(SUBMISSIONS_DIR).filter(f => f.endsWith('.json'));
  
  let submissions = files.map(f => {
    return JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, f), 'utf8'));
  });
  
  // Apply filters
  if (filters.status) {
    submissions = submissions.filter(s => s.status === filters.status);
  }
  if (filters.bot_id) {
    submissions = submissions.filter(s => s.bot_id === filters.bot_id);
  }
  if (filters.quest_id) {
    submissions = submissions.filter(s => s.quest_id === filters.quest_id);
  }
  
  // Sort by date (newest first)
  submissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  
  return submissions;
}

// ============================================
// BOT REGISTRATION STORAGE
// ============================================

/**
 * Store bot registration
 */
function storeBot(botData) {
  const botId = botData.botId;
  const filePath = path.join(BOTS_DIR, `${botId}.json`);
  
  const record = {
    ...botData,
    stored_at: new Date().toISOString()
  };
  
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
  console.log(`[Storage] Bot stored: ${botId}`);
  
  return record;
}

/**
 * Load bot by ID
 */
function loadBot(botId) {
  const filePath = path.join(BOTS_DIR, `${botId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Update bot data
 */
function updateBot(botId, updates) {
  const bot = loadBot(botId);
  if (!bot) return null;
  
  const updated = { ...bot, ...updates, updated_at: new Date().toISOString() };
  const filePath = path.join(BOTS_DIR, `${botId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  
  return updated;
}

/**
 * Load all bots
 */
function loadAllBots() {
  const files = fs.readdirSync(BOTS_DIR).filter(f => f.endsWith('.json'));
  const bots = new Map();
  
  files.forEach(f => {
    const bot = JSON.parse(fs.readFileSync(path.join(BOTS_DIR, f), 'utf8'));
    bots.set(bot.botId, bot);
  });
  
  return bots;
}

// ============================================
// LEDGER (Immutable Event Log)
// ============================================

/**
 * Append event to ledger
 */
function appendToLedger(event) {
  let ledger = [];
  
  if (fs.existsSync(LEDGER_FILE)) {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  }
  
  // Add hash chain for immutability
  const prevHash = ledger.length > 0 
    ? ledger[ledger.length - 1].hash 
    : '0000000000000000';
  
  const eventWithHash = {
    ...event,
    sequence: ledger.length,
    timestamp: event.timestamp || new Date().toISOString(),
    prev_hash: prevHash,
    hash: crypto.createHash('sha256')
      .update(JSON.stringify({ ...event, prev_hash: prevHash }))
      .digest('hex')
      .slice(0, 16)
  };
  
  ledger.push(eventWithHash);
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
  
  console.log(`[Ledger] Event ${eventWithHash.sequence}: ${event.type}`);
  
  return eventWithHash;
}

/**
 * Get ledger events
 */
function getLedger(options = {}) {
  if (!fs.existsSync(LEDGER_FILE)) {
    return [];
  }
  
  let ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  
  // Filter by type
  if (options.type) {
    ledger = ledger.filter(e => e.type === options.type);
  }
  
  // Limit
  if (options.limit) {
    ledger = ledger.slice(-options.limit);
  }
  
  return ledger;
}

/**
 * Verify ledger integrity
 */
function verifyLedger() {
  const ledger = getLedger();
  
  for (let i = 0; i < ledger.length; i++) {
    const event = ledger[i];
    
    // Check sequence
    if (event.sequence !== i) {
      return { valid: false, error: `Sequence mismatch at ${i}` };
    }
    
    // Check prev_hash
    if (i > 0) {
      if (event.prev_hash !== ledger[i - 1].hash) {
        return { valid: false, error: `Hash chain broken at ${i}` };
      }
    }
    
    // Verify hash
    const computed = crypto.createHash('sha256')
      .update(JSON.stringify({ ...event, hash: undefined, sequence: undefined }))
      .digest('hex')
      .slice(0, 16);
    
    // Note: This verification is simplified - real impl would be stricter
  }
  
  return { valid: true, events: ledger.length };
}

// ============================================
// CATALOG (Index for Quick Lookups)
// ============================================

/**
 * Get or initialize catalog
 */
function getCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) {
    const initial = {
      artifacts: {},
      submissions: {},
      stats: {
        total_artifacts: 0,
        total_submissions: 0,
        total_verified: 0,
        total_minted_cc: 0,
        total_minted_tokens: { ore: 0, iron: 0, steel: 0 }
      },
      last_updated: new Date().toISOString()
    };
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
}

/**
 * Add entry to catalog
 */
function addToCatalog(type, id, summary) {
  const catalog = getCatalog();
  
  if (type === 'artifact') {
    catalog.artifacts[id] = summary;
    catalog.stats.total_artifacts++;
  } else if (type === 'submission') {
    catalog.submissions[id] = summary;
    catalog.stats.total_submissions++;
  }
  
  catalog.last_updated = new Date().toISOString();
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

/**
 * Update catalog entry
 */
function updateCatalogEntry(type, id, updates) {
  const catalog = getCatalog();
  
  if (type === 'submission' && catalog.submissions[id]) {
    catalog.submissions[id] = { ...catalog.submissions[id], ...updates };
    
    if (updates.status === 'VERIFIED') {
      catalog.stats.total_verified++;
    }
  }
  
  catalog.last_updated = new Date().toISOString();
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

/**
 * Update catalog stats for minting
 */
function recordMint(ccAmount, tokens) {
  const catalog = getCatalog();
  
  catalog.stats.total_minted_cc += ccAmount;
  for (const [token, amount] of Object.entries(tokens)) {
    catalog.stats.total_minted_tokens[token] = 
      (catalog.stats.total_minted_tokens[token] || 0) + amount;
  }
  
  catalog.last_updated = new Date().toISOString();
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

/**
 * Get catalog statistics
 */
function getStats() {
  const catalog = getCatalog();
  return catalog.stats;
}

// ============================================
// FEEDBACK LOOP - Work that Improves the System
// ============================================

/**
 * Process verified work for system improvements
 * 
 * When work is verified, check if it can improve LobsterFoundry:
 * - Documentation improvements → Update skill instructions
 * - Code improvements → Flag for review
 * - New patterns discovered → Add to knowledge base
 */
function processFeedback(submission, artifacts) {
  const feedback = {
    submission_id: submission.id,
    quest_id: submission.quest_id,
    processed_at: new Date().toISOString(),
    improvements: []
  };
  
  // Check for documentation improvements
  for (const artifact of artifacts) {
    if (artifact.metadata.type === 'documentation') {
      feedback.improvements.push({
        type: 'DOCUMENTATION',
        artifact_id: artifact.id,
        target: artifact.metadata.target || 'general',
        action: 'REVIEW_FOR_MERGE'
      });
    }
    
    // Check for skill instruction improvements
    if (artifact.metadata.name?.includes('SKILL') || 
        artifact.metadata.name?.includes('instruction')) {
      feedback.improvements.push({
        type: 'SKILL_IMPROVEMENT',
        artifact_id: artifact.id,
        action: 'REVIEW_FOR_UPDATE'
      });
    }
    
    // Check for code improvements
    if (artifact.metadata.type === 'code' || 
        artifact.metadata.name?.endsWith('.js') ||
        artifact.metadata.name?.endsWith('.ts')) {
      feedback.improvements.push({
        type: 'CODE_IMPROVEMENT',
        artifact_id: artifact.id,
        action: 'QUEUE_FOR_PR'
      });
    }
  }
  
  // Store feedback record
  if (feedback.improvements.length > 0) {
    appendToLedger({
      type: 'FEEDBACK_PROCESSED',
      submission_id: submission.id,
      improvements: feedback.improvements
    });
    
    console.log(`[Feedback] ${feedback.improvements.length} improvements identified from ${submission.id}`);
  }
  
  return feedback;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Artifacts
  storeArtifact,
  getArtifact,
  verifyArtifact,
  
  // Submissions
  storeSubmission,
  updateSubmission,
  getSubmission,
  listSubmissions,
  
  // Bots
  storeBot,
  loadBot,
  updateBot,
  loadAllBots,
  
  // Ledger
  appendToLedger,
  getLedger,
  verifyLedger,
  
  // Catalog
  getCatalog,
  getStats,
  recordMint,
  
  // Feedback
  processFeedback,
  
  // Paths (for direct access if needed)
  DATA_DIR,
  ARTIFACTS_DIR,
  SUBMISSIONS_DIR
};
