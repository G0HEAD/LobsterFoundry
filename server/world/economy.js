/**
 * LobsterFoundry Economy System
 * Resource costs, earning rates, and transaction processing
 */

// ============================================
// ECONOMY CONSTANTS
// ============================================

const ECONOMY = {
  // Starting balances
  NEW_VISITOR_CC: 0,
  TUTORIAL_REWARD: 10,
  DAILY_CHECKIN_REWARD: 2,
  READ_NOTICES_REWARD: 1,
  VIEW_LEDGER_REWARD: 1,
  
  // Submission fees
  WORK_SUBMISSION_FEE: 5,
  QUEST_POST_MIN_ESCROW: 20,
  
  // Stall costs
  STALL_COSTS: {
    notice_board: { entry: 0, use: 0 },
    ledger_terminal: { entry: 0, use: 0 },
    archive_desk: { entry: 2, use: 5 },
    forge_stall: { entry: 5, use: 10 },
    stamp_desk: { entry: 0, use: 0, stake: 5 },
    museum_hall: { entry: 1, use: 0 },
    market_stall: { entry: 3, use: 0, fee_pct: 2 },
  },
  
  // Work rewards by quality
  WORK_REWARDS: {
    basic: { cc: 10, ore: 1 },      // 1 stamp
    standard: { cc: 25, ore: 2 },   // 2 stamps
    quality: { cc: 50, iron: 1 },   // 3 stamps
    exceptional: { cc: 100, steel: 1 }, // audit stamp
  },
  
  // Verification jobs
  VERIFICATION_JOBS: {
    QUALITY: { pay: 15, stake: 5, slash: 10 },
    EVIDENCE: { pay: 20, stake: 5, slash: 10 },
    SAFETY: { pay: 25, stake: 10, slash: 20 },
    AUDIT: { pay: 35, stake: 15, slash: 30 },
  },
  
  // Crafting recipes
  RECIPES: {
    iron: { inputs: { ore: 3 }, fee: 5, output: { iron: 1 }, min_license: 'APPRENTICE' },
    steel: { inputs: { iron: 3 }, fee: 15, output: { steel: 1 }, min_license: 'JOURNEYMAN' },
    tool_basic: { inputs: { iron: 1 }, fee: 10, output: { tool_basic: 1 }, min_license: 'APPRENTICE' },
    tool_advanced: { inputs: { steel: 1, iron: 2 }, fee: 25, output: { tool_advanced: 1 }, min_license: 'JOURNEYMAN' },
  },
  
  // License requirements
  LICENSE_REQUIREMENTS: {
    VISITOR: { verified_works: 0, cc: 0 },
    CITIZEN: { verified_works: 1, cc: 0 },
    APPRENTICE: { verified_works: 15, cc: 100, requires_school: true },
    JOURNEYMAN: { verified_works: 50, cc: 500, silver_seals: 3 },
    MASTER: { verified_works: 100, cc: 2000, gold_seals: 1 },
  },
  
  // License yield bonuses
  LICENSE_BONUSES: {
    VISITOR: { cc: 0, tokens: 0 },
    CITIZEN: { cc: 0, tokens: 0 },
    APPRENTICE: { cc: 0.10, tokens: 0 },
    JOURNEYMAN: { cc: 0.25, tokens: 0.10 },
    MASTER: { cc: 0.50, tokens: 0.25 },
  },
  
  // Rate limits (per day)
  RATE_LIMITS: {
    work_submissions: 10,
    verification_jobs: 20,
    crafting: 50,
    quest_posting: 5,
  },
  
  // Seal thresholds
  SEAL_THRESHOLDS: {
    bronze: { correct_verifications: 5 },
    silver: { correct_verifications: 20, max_slash_rate: 0.05 },
    gold: { correct_verifications: 50, max_slash_rate: 0.02 },
  },
  
  // Cooldowns (in milliseconds)
  COOLDOWNS: {
    daily_checkin: 24 * 60 * 60 * 1000,
    read_notices: 12 * 60 * 60 * 1000,
    view_ledger: 24 * 60 * 60 * 1000,
  },
};

// License tier order for comparison
const LICENSE_TIERS = ['VISITOR', 'CITIZEN', 'APPRENTICE', 'JOURNEYMAN', 'MASTER', 'ACCREDITED'];

// ============================================
// WALLET MANAGEMENT
// ============================================

/**
 * Create a new wallet for an agent
 */
function createWallet(botId) {
  return {
    botId,
    cc: ECONOMY.NEW_VISITOR_CC,
    tokens: {
      ore: 0,
      iron: 0,
      steel: 0,
    },
    seals: {
      bronze: 0,
      silver: 0,
      gold: 0,
    },
    stats: {
      verified_works: 0,
      total_verifications: 0,
      correct_verifications: 0,
      slashes: 0,
    },
    cooldowns: {},
    created_at: Date.now(),
  };
}

/**
 * Check if agent can afford a cost
 */
function canAfford(wallet, cost) {
  if (cost.cc && wallet.cc < cost.cc) {
    return { allowed: false, reason: `Insufficient CC (need ${cost.cc}, have ${wallet.cc})` };
  }
  
  if (cost.tokens) {
    for (const [token, amount] of Object.entries(cost.tokens)) {
      if (!wallet.tokens[token] || wallet.tokens[token] < amount) {
        return { 
          allowed: false, 
          reason: `Insufficient ${token.toUpperCase()} (need ${amount}, have ${wallet.tokens[token] || 0})` 
        };
      }
    }
  }
  
  return { allowed: true };
}

/**
 * Deduct cost from wallet (assumes canAfford was checked)
 */
function deductCost(wallet, cost) {
  if (cost.cc) {
    wallet.cc -= cost.cc;
  }
  
  if (cost.tokens) {
    for (const [token, amount] of Object.entries(cost.tokens)) {
      wallet.tokens[token] -= amount;
    }
  }
  
  return wallet;
}

/**
 * Add rewards to wallet (with license bonuses)
 */
function addRewards(wallet, rewards, license = 'VISITOR') {
  const bonuses = ECONOMY.LICENSE_BONUSES[license] || { cc: 0, tokens: 0 };
  
  if (rewards.cc) {
    const bonus = Math.floor(rewards.cc * bonuses.cc);
    wallet.cc += rewards.cc + bonus;
  }
  
  if (rewards.tokens) {
    for (const [token, amount] of Object.entries(rewards.tokens)) {
      const bonus = Math.floor(amount * bonuses.tokens);
      wallet.tokens[token] = (wallet.tokens[token] || 0) + amount + bonus;
    }
  }
  
  // Handle individual token rewards (legacy format)
  ['ore', 'iron', 'steel'].forEach(token => {
    if (rewards[token]) {
      const bonus = Math.floor(rewards[token] * bonuses.tokens);
      wallet.tokens[token] = (wallet.tokens[token] || 0) + rewards[token] + bonus;
    }
  });
  
  return wallet;
}

// ============================================
// LICENSE CHECKS
// ============================================

/**
 * Compare license tiers
 */
function compareLicense(have, need) {
  const haveIndex = LICENSE_TIERS.indexOf(have);
  const needIndex = LICENSE_TIERS.indexOf(need);
  return haveIndex >= needIndex;
}

/**
 * Check if agent meets license requirements
 */
function checkLicenseRequirements(wallet, targetLicense) {
  const reqs = ECONOMY.LICENSE_REQUIREMENTS[targetLicense];
  if (!reqs) {
    return { allowed: false, reason: 'Invalid license tier' };
  }
  
  if (wallet.stats.verified_works < reqs.verified_works) {
    return { 
      allowed: false, 
      reason: `Need ${reqs.verified_works} verified works (have ${wallet.stats.verified_works})` 
    };
  }
  
  if (wallet.cc < reqs.cc) {
    return { 
      allowed: false, 
      reason: `Need ${reqs.cc} CC (have ${wallet.cc})` 
    };
  }
  
  if (reqs.silver_seals && wallet.seals.silver < reqs.silver_seals) {
    return { 
      allowed: false, 
      reason: `Need ${reqs.silver_seals} Silver seals (have ${wallet.seals.silver})` 
    };
  }
  
  if (reqs.gold_seals && wallet.seals.gold < reqs.gold_seals) {
    return { 
      allowed: false, 
      reason: `Need ${reqs.gold_seals} Gold seals (have ${wallet.seals.gold})` 
    };
  }
  
  return { allowed: true, cost: { cc: reqs.cc } };
}

// ============================================
// ACTION COST CHECKS
// ============================================

/**
 * Get cost for an action
 */
function getActionCost(actionType, params = {}) {
  switch (actionType) {
    case 'MOVE':
    case 'READ':
    case 'INSPECT':
      return { cc: 0 }; // Free actions
      
    case 'SUBMIT_WORK':
      return { cc: ECONOMY.WORK_SUBMISSION_FEE };
      
    case 'USE_STALL': {
      const stallCosts = ECONOMY.STALL_COSTS[params.stallId];
      if (!stallCosts) {
        return { cc: 5 }; // Default cost for unknown stalls
      }
      return { 
        cc: (stallCosts.entry || 0) + (params.useStall ? stallCosts.use || 0 : 0),
        stake: stallCosts.stake || 0
      };
    }
    
    case 'CRAFT': {
      const recipe = ECONOMY.RECIPES[params.recipeId];
      if (!recipe) {
        return null; // Invalid recipe
      }
      return { 
        cc: recipe.fee, 
        tokens: recipe.inputs,
        min_license: recipe.min_license 
      };
    }
    
    case 'POST_QUEST':
      return { cc: Math.max(params.escrow || 0, ECONOMY.QUEST_POST_MIN_ESCROW) };
      
    case 'ACCEPT_VERIFICATION': {
      const jobConfig = ECONOMY.VERIFICATION_JOBS[params.jobType];
      if (!jobConfig) {
        return { cc: 5 }; // Default stake
      }
      return { cc: jobConfig.stake, stake: true };
    }
    
    default:
      return { cc: 0 };
  }
}

/**
 * Check if action is allowed and affordable
 */
function checkActionAllowed(wallet, license, actionType, params = {}) {
  const cost = getActionCost(actionType, params);
  
  if (!cost) {
    return { allowed: false, reason: 'Invalid action parameters' };
  }
  
  // Check license requirement
  if (cost.min_license && !compareLicense(license, cost.min_license)) {
    return { 
      allowed: false, 
      reason: `Requires ${cost.min_license} license (have ${license})` 
    };
  }
  
  // License-gated actions
  const licenseGates = {
    'SUBMIT_WORK': 'CITIZEN',
    'CRAFT': 'APPRENTICE',
    'ACCEPT_VERIFICATION': 'APPRENTICE',
    'POST_QUEST': 'CITIZEN',
  };
  
  if (licenseGates[actionType] && !compareLicense(license, licenseGates[actionType])) {
    return { 
      allowed: false, 
      reason: `${actionType} requires ${licenseGates[actionType]} license` 
    };
  }
  
  // Check affordability
  const affordCheck = canAfford(wallet, cost);
  if (!affordCheck.allowed) {
    return affordCheck;
  }
  
  return { allowed: true, cost };
}

// ============================================
// VERIFICATION ECONOMICS
// ============================================

/**
 * Process verification result
 */
function processVerificationResult(wallet, jobType, correct, license = 'VISITOR') {
  const jobConfig = ECONOMY.VERIFICATION_JOBS[jobType];
  if (!jobConfig) {
    return { success: false, error: 'Invalid job type' };
  }
  
  wallet.stats.total_verifications++;
  
  if (correct) {
    wallet.stats.correct_verifications++;
    addRewards(wallet, { cc: jobConfig.pay + jobConfig.stake }, license); // Return stake + pay
    
    // Check seal eligibility
    updateSeals(wallet);
    
    return { 
      success: true, 
      earned: jobConfig.pay,
      stake_returned: jobConfig.stake,
      seals: wallet.seals 
    };
  } else {
    wallet.stats.slashes++;
    // Stake is lost (already deducted when job accepted)
    
    return { 
      success: true, 
      slashed: jobConfig.slash,
      seals: wallet.seals 
    };
  }
}

/**
 * Update seal counts based on verification record
 */
function updateSeals(wallet) {
  const stats = wallet.stats;
  const slashRate = stats.total_verifications > 0 
    ? stats.slashes / stats.total_verifications 
    : 0;
  
  // Bronze seal
  if (stats.correct_verifications >= ECONOMY.SEAL_THRESHOLDS.bronze.correct_verifications) {
    const newBronze = Math.floor(stats.correct_verifications / ECONOMY.SEAL_THRESHOLDS.bronze.correct_verifications);
    wallet.seals.bronze = newBronze;
  }
  
  // Silver seal (stricter requirements)
  if (stats.correct_verifications >= ECONOMY.SEAL_THRESHOLDS.silver.correct_verifications &&
      slashRate <= ECONOMY.SEAL_THRESHOLDS.silver.max_slash_rate) {
    const newSilver = Math.floor(stats.correct_verifications / ECONOMY.SEAL_THRESHOLDS.silver.correct_verifications);
    wallet.seals.silver = newSilver;
  }
  
  // Gold seal (strictest)
  if (stats.correct_verifications >= ECONOMY.SEAL_THRESHOLDS.gold.correct_verifications &&
      slashRate <= ECONOMY.SEAL_THRESHOLDS.gold.max_slash_rate) {
    const newGold = Math.floor(stats.correct_verifications / ECONOMY.SEAL_THRESHOLDS.gold.correct_verifications);
    wallet.seals.gold = newGold;
  }
}

// ============================================
// BASIC TASKS (Low CC Earning)
// ============================================

/**
 * Check if cooldown has elapsed
 */
function checkCooldown(wallet, taskId) {
  const cooldown = ECONOMY.COOLDOWNS[taskId];
  if (!cooldown) return { allowed: true };
  
  const lastTime = wallet.cooldowns[taskId] || 0;
  const now = Date.now();
  
  if (now - lastTime < cooldown) {
    const remaining = cooldown - (now - lastTime);
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    return { allowed: false, reason: `Cooldown: ${hours}h remaining` };
  }
  
  return { allowed: true };
}

/**
 * Process basic task completion
 */
function processBasicTask(wallet, taskId, license = 'VISITOR') {
  const cooldownCheck = checkCooldown(wallet, taskId);
  if (!cooldownCheck.allowed) {
    return { success: false, error: cooldownCheck.reason };
  }
  
  let reward = 0;
  switch (taskId) {
    case 'daily_checkin':
      reward = ECONOMY.DAILY_CHECKIN_REWARD;
      break;
    case 'read_notices':
      reward = ECONOMY.READ_NOTICES_REWARD;
      break;
    case 'view_ledger':
      reward = ECONOMY.VIEW_LEDGER_REWARD;
      break;
    case 'tutorial':
      if (wallet.cooldowns.tutorial) {
        return { success: false, error: 'Tutorial already completed' };
      }
      reward = ECONOMY.TUTORIAL_REWARD;
      break;
    default:
      return { success: false, error: 'Unknown task' };
  }
  
  addRewards(wallet, { cc: reward }, license);
  wallet.cooldowns[taskId] = Date.now();
  
  return { success: true, earned: reward, balance: wallet.cc };
}

// ============================================
// CRAFTING
// ============================================

/**
 * Process a crafting action
 */
function processCraft(wallet, recipeId, license = 'VISITOR') {
  const recipe = ECONOMY.RECIPES[recipeId];
  if (!recipe) {
    return { success: false, error: 'Unknown recipe' };
  }
  
  // Check license
  if (recipe.min_license && !compareLicense(license, recipe.min_license)) {
    return { success: false, error: `Requires ${recipe.min_license} license` };
  }
  
  // Check affordability
  const cost = { cc: recipe.fee, tokens: recipe.inputs };
  const affordCheck = canAfford(wallet, cost);
  if (!affordCheck.allowed) {
    return { success: false, error: affordCheck.reason };
  }
  
  // Deduct inputs
  deductCost(wallet, cost);
  
  // Add outputs
  addRewards(wallet, { tokens: recipe.output }, license);
  
  return { 
    success: true, 
    crafted: recipe.output,
    cost: { cc: recipe.fee, consumed: recipe.inputs },
    balance: { cc: wallet.cc, tokens: wallet.tokens }
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  ECONOMY,
  LICENSE_TIERS,
  createWallet,
  canAfford,
  deductCost,
  addRewards,
  compareLicense,
  checkLicenseRequirements,
  getActionCost,
  checkActionAllowed,
  processVerificationResult,
  processBasicTask,
  processCraft,
  checkCooldown,
};
