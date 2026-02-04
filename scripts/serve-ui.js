const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const zlib = require('zlib');
const crypto = require('crypto');

// Try to load ws for WebSocket support
let WebSocketServer;
try {
  WebSocketServer = require('ws').WebSocketServer;
} catch (e) {
  console.log('[Server] WebSocket support disabled (ws not installed). Run: npm install ws');
}

const root = path.resolve(__dirname, '..');
const portFlagIndex = process.argv.indexOf('--port');
const shortFlagIndex = process.argv.indexOf('-p');
const portValue =
  (portFlagIndex >= 0 && process.argv[portFlagIndex + 1]) ||
  (shortFlagIndex >= 0 && process.argv[shortFlagIndex + 1]) ||
  process.env.PORT ||
  '5173';
const port = Number(portValue);
const checkpointPath = path.join(root, 'data', 'runner-checkpoint.json');

// ============================================
// WORLD STATE MANAGEMENT
// ============================================

const worldState = {
  avatars: new Map(),
  buildings: [],
  bots: new Map(),
  spectators: new Set(),
  isBuildNight: false,
  tick: 0,
  gameTime: { day: 1, hour: 8, minute: 0 },
};

// Generate a unique ID
const generateId = () => crypto.randomBytes(8).toString('hex');

// Demo avatars configuration
const DEMO_AVATARS = [
  { id: 'demo_0', name: 'Settler-001', x: 5, y: 5, school: 'MINING', state: 'IDLE' },
  { id: 'demo_1', name: 'Verifier-001', x: 15, y: 8, school: 'VERIFICATION', state: 'IDLE' },
  { id: 'demo_2', name: 'Crafter-001', x: 25, y: 12, school: 'SMITHING', state: 'IDLE' },
];

// Initialize demo avatars
DEMO_AVATARS.forEach(avatar => {
  worldState.avatars.set(avatar.id, { ...avatar, botId: null });
});

// Broadcast to all spectators (SSE)
const spectatorStreams = new Set();
const broadcastToSpectators = (event, data) => {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  spectatorStreams.forEach(res => {
    try {
      res.write(message);
    } catch (e) {
      spectatorStreams.delete(res);
    }
  });
};

// Broadcast to all connected bots (WebSocket)
const broadcastToBots = (message) => {
  worldState.bots.forEach((bot, botId) => {
    if (bot.ws && bot.ws.readyState === 1) { // WebSocket.OPEN
      try {
        bot.ws.send(JSON.stringify(message));
      } catch (e) {
        console.error(`[World] Failed to send to bot ${botId}:`, e);
      }
    }
  });
};

// Get world state snapshot
const getWorldSnapshot = () => ({
  avatars: Array.from(worldState.avatars.values()),
  buildings: worldState.buildings,
  isBuildNight: worldState.isBuildNight,
  tick: worldState.tick,
  gameTime: { ...worldState.gameTime },
  botCount: worldState.bots.size,
});

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const gzipTypes = new Set([
  'text/html; charset=utf-8',
  'text/css; charset=utf-8',
  'application/javascript; charset=utf-8',
  'application/json; charset=utf-8',
  'image/svg+xml',
]);

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-cache',
  'Access-Control-Allow-Origin': '*',
};

const sseHeaders = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*',
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
};

const sendSse = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const humanize = (value) => {
  if (!value) {
    return '--';
  }
  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const normalizeTags = (tags, limit = 4) => {
  const output = [];
  const seen = new Set();
  (tags ?? []).forEach((tag) => {
    if (!tag || seen.has(tag)) {
      return;
    }
    seen.add(tag);
    output.push(tag);
  });
  return output.slice(0, limit);
};

const normalizeLinks = (links, limit = 6) => {
  const output = [];
  const seen = new Set();
  (links ?? []).forEach((link) => {
    if (!link?.url || seen.has(link.url)) {
      return;
    }
    seen.add(link.url);
    output.push(link);
  });
  return output.slice(0, limit);
};

const normalizeArtifactUrl = (uri) => {
  if (!uri) {
    return null;
  }
  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
};

const buildArtifactLinks = (artifacts, kind, source) =>
  (artifacts ?? [])
    .map((artifact, index) => {
      const url = normalizeArtifactUrl(artifact?.uri);
      if (!url) {
        return null;
      }
      return {
        label: artifact?.name || `Artifact ${index + 1}`,
        url,
        kind: kind || 'Artifact',
        source,
      };
    })
    .filter(Boolean)
    .slice(0, 3);

const collectEvidenceLinks = (submissionContext, stamp, sourceLabel) => {
  const source = sourceLabel || submissionContext?.deliverableLabel || null;
  const links = [];
  links.push(...buildArtifactLinks(submissionContext?.artifacts, 'Artifact', source));
  links.push(...buildArtifactLinks(stamp?.artifacts, 'Evidence', source));
  return normalizeLinks(links);
};

const formatCountTag = (label, count) => {
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  return `${label} ${count}`;
};

const resolveAccountLabel = (state, accountId) => {
  if (!accountId) {
    return 'Runner';
  }
  const account = state?.accounts?.[accountId];
  return account?.display_name || account?.handle || accountId;
};

const resolveRoleLabel = (accountId) => {
  if (!accountId) {
    return 'Runner';
  }
  const lower = accountId.toLowerCase();
  if (lower.startsWith('verifier')) {
    return 'Verifier';
  }
  if (lower.startsWith('sponsor')) {
    return 'Sponsor';
  }
  if (lower.startsWith('settler')) {
    return 'Settler';
  }
  return 'Runner';
};

const resolveTokenTypes = (state, tokenIds) => {
  const tokens = tokenIds
    .map((id) => state?.tokens?.[id]?.type)
    .filter(Boolean);
  return [...new Set(tokens)];
};

const parseStakeAccount = (changes) => {
  const entry = (changes ?? []).find((change) =>
    String(change.account_id || '').startsWith('STAKE:'),
  );
  if (!entry) {
    return null;
  }
  const parts = String(entry.account_id).split(':');
  if (parts.length < 3) {
    return null;
  }
  return { jobId: parts[1], verifierId: parts[2] };
};

const parseEscrowAccount = (changes) => {
  const entry = (changes ?? []).find((change) =>
    String(change.account_id || '').startsWith('ESCROW:'),
  );
  if (!entry) {
    return null;
  }
  return String(entry.account_id).replace('ESCROW:', '');
};

const resolveSubmissionContext = (state, submissionId) => {
  if (!submissionId) {
    return null;
  }
  const submission = state?.submissions?.[submissionId];
  if (!submission) {
    return null;
  }
  const contract = state?.contracts?.[submission.contract_id];
  const deliverable = contract?.payload?.deliverable_type;
  const artifactCount = submission.payload?.artifacts?.length ?? 0;
  const claimCount = submission.payload?.claims?.length ?? 0;
  const artifacts = submission.payload?.artifacts ?? [];
  const stampIds = submission.stamp_ids ?? [];
  const stamps = stampIds.map((id) => state?.stamps?.[id]).filter(Boolean);
  const stampRoles = [...new Set(stamps.map((stamp) => stamp.role))];
  return {
    submission,
    contract,
    deliverable,
    deliverableLabel: deliverable ? humanize(deliverable) : null,
    artifactCount,
    claimCount,
    artifacts,
    stampRoles,
  };
};

const resolveJobContext = (state, jobId) => {
  if (!jobId) {
    return null;
  }
  const job = state?.verification_jobs?.[jobId];
  if (!job) {
    return null;
  }
  const submissionContext = resolveSubmissionContext(state, job.submission_id);
  const stamp = job.stamp_id ? state?.stamps?.[job.stamp_id] : null;
  return { job, submissionContext, stamp };
};

const resolveMintContext = (state, tokenIds) => {
  const tokens = (tokenIds ?? []).map((id) => state?.tokens?.[id]).filter(Boolean);
  const tokenTypes = [...new Set(tokens.map((token) => token.type))];
  const stampIds = tokens.flatMap((token) => token.stamp_ids ?? []);
  const stamps = stampIds.map((id) => state?.stamps?.[id]).filter(Boolean);
  const stampRoles = [...new Set(stamps.map((stamp) => stamp.role))];
  const submissionId = stamps[0]?.submission_id;
  const submissionContext = resolveSubmissionContext(state, submissionId);
  return { tokenTypes, stampRoles, submissionContext };
};

const sumReason = (changes, reason, direction) =>
  (changes ?? [])
    .filter((change) => change.reason === reason)
    .reduce((sum, change) => {
      if (direction === 'positive' && change.delta <= 0) {
        return sum;
      }
      if (direction === 'negative' && change.delta >= 0) {
        return sum;
      }
      return sum + Math.abs(change.delta);
    }, 0);

const formatCc = (value) => {
  const sign = value < 0 ? '-' : '';
  const amount = Math.abs(value);
  const hasDecimal = Math.abs(amount % 1) > 0.001;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  });
  return `${sign}${formatted} CC`;
};

const truncate = (value) => {
  if (!value) {
    return '#';
  }
  return value.length > 6 ? `#${value.slice(0, 4)}` : `#${value}`;
};

const buildOverlay = (event, state) => {
  if (!event) {
    return null;
  }
  const actor = resolveAccountLabel(state, event.actor_id);
  const role = resolveRoleLabel(event.actor_id);
  const blueprint = event.blueprint_id ? `BP ${truncate(event.blueprint_id)}` : null;
  const tags = [blueprint].filter(Boolean);
  const ccChanges = event.cc_changes ?? [];

  const escrowId = event.blueprint_id || parseEscrowAccount(ccChanges);
  const contract = escrowId ? state?.contracts?.[escrowId] : null;
  const contractLabel = contract?.payload?.deliverable_type
    ? humanize(contract.payload.deliverable_type)
    : null;

  const stakeInfo = parseStakeAccount(ccChanges);
  const stakeContext = stakeInfo ? resolveJobContext(state, stakeInfo.jobId) : null;
  const submissionContext = stakeContext?.submissionContext
    ? stakeContext.submissionContext
    : resolveSubmissionContext(state, event.blueprint_id);
  const submissionLabel = submissionContext?.deliverableLabel || contractLabel;
  const submissionTag = submissionContext?.submission?.id
    ? `Submission ${truncate(submissionContext.submission.id)}`
    : null;
  const jobRole = stakeContext?.job?.stamp_role
    ? humanize(stakeContext.job.stamp_role)
    : null;
  const stampDecision = stakeContext?.stamp?.decision
    ? humanize(stakeContext.stamp.decision)
    : null;

  const escrowAmount = sumReason(ccChanges, 'ESCROW_LOCK', 'positive');
  const stakeLocked = sumReason(ccChanges, 'STAKE_LOCK', 'negative');
  const stakeReleased = sumReason(ccChanges, 'STAKE_RELEASE', 'positive');
  const craftFee = sumReason(ccChanges, 'CRAFT_FEE', 'negative');
  const verifierPay = sumReason(ccChanges, 'VERIFIER_PAY', 'positive');
  const adminFee = sumReason(ccChanges, 'ADMIN_FEE', 'positive');

  const mintContext = resolveMintContext(state, event.tokens_minted ?? []);
  const mintedTypes = mintContext.tokenTypes;
  const mintedLabel = mintedTypes.length
    ? `${mintedTypes.join(' + ')} proof`
    : `${event.tokens_minted?.length ?? 0} proof token${event.tokens_minted?.length === 1 ? '' : 's'}`;
  const burnedCount = event.tokens_burned?.length ?? 0;
  const evidenceLinks = collectEvidenceLinks(
    submissionContext,
    stakeContext?.stamp,
    submissionLabel || contractLabel,
  );
  const mintLinks = collectEvidenceLinks(
    mintContext.submissionContext,
    null,
    mintContext.submissionContext?.deliverableLabel,
  );

  switch (event.type) {
    case 'ESCROW_LOCK':
      if (escrowAmount) {
        tags.push(formatCc(escrowAmount));
      }
      if (contractLabel) {
        tags.push(contractLabel);
      }
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'escrow',
        title: 'Escrow funded',
        detail: escrowAmount
          ? `${actor} locked ${formatCc(escrowAmount)} for ${submissionLabel ?? 'a contract'}.`
          : `${actor} locked escrow funding for ${submissionLabel ?? 'a contract'}.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    case 'ESCROW_RELEASE':
      if (contractLabel) {
        tags.push(contractLabel);
      }
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'escrow',
        title: 'Escrow released',
        detail: `${actor} released escrow for ${submissionLabel ?? 'a contract'}.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    case 'STAKE_LOCK':
      if (stakeLocked) {
        tags.push(formatCc(stakeLocked));
      }
      if (jobRole) {
        tags.push(jobRole);
      }
      if (submissionLabel) {
        tags.push(submissionLabel);
      }
      if (submissionTag) {
        tags.push(submissionTag);
      }
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'verification',
        title: 'Stake locked',
        detail: stakeLocked
          ? `${actor} locked ${formatCc(stakeLocked)} for ${jobRole ?? 'verification'} review.`
          : `${actor} locked stake for ${jobRole ?? 'verification'} review.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    case 'STAKE_RELEASE':
      if (stakeReleased) {
        tags.push(formatCc(stakeReleased));
      }
      if (jobRole) {
        tags.push(jobRole);
      }
      if (stampDecision) {
        tags.push(stampDecision);
      }
      if (submissionLabel) {
        tags.push(submissionLabel);
      }
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'verification',
        title: stampDecision ? `Stamp ${stampDecision}` : 'Stake released',
        detail: stakeReleased
          ? `${actor} cleared ${jobRole ?? 'verification'} and recovered ${formatCc(stakeReleased)}.`
          : `${actor} cleared ${jobRole ?? 'verification'} and recovered stake.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    case 'MINT':
      if (verifierPay) {
        tags.push(formatCc(verifierPay));
      }
      if (mintContext.stampRoles.length) {
        tags.push(...mintContext.stampRoles.map(humanize));
      }
      if (mintContext.submissionContext?.deliverableLabel) {
        tags.push(mintContext.submissionContext.deliverableLabel);
      }
      if (mintContext.submissionContext) {
        tags.push(
          formatCountTag('Artifacts', mintContext.submissionContext.artifactCount),
          formatCountTag('Claims', mintContext.submissionContext.claimCount),
        );
      }
      const stampSummary = mintContext.stampRoles.length
        ? `${mintContext.stampRoles.map(humanize).join(' + ')} stamps`
        : null;
      const stampDetail = stampSummary ? ` after ${stampSummary}` : '';
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'mint',
        title: 'Proof minted',
        detail: `${actor} minted ${mintedLabel}${stampDetail} for ${
          mintContext.submissionContext?.deliverableLabel ?? 'verified work'
        }.`,
        tags: normalizeTags(tags),
        links: mintLinks,
        role,
      };
    case 'BLUEPRINT_EXEC': {
      const details = [];
      if (event.tokens_minted?.length) {
        details.push(`minted ${event.tokens_minted.length}`);
      }
      if (burnedCount) {
        details.push(`burned ${burnedCount}`);
      }
      if (craftFee) {
        details.push(`fee ${formatCc(craftFee)}`);
      }
      const detailSuffix = details.length ? ` (${details.join(', ')})` : '';
      if (adminFee) {
        tags.push(formatCc(adminFee));
      }
      if (submissionLabel) {
        tags.push(submissionLabel);
      }
      if (submissionTag) {
        tags.push(submissionTag);
      }
      if (submissionContext) {
        tags.push(
          formatCountTag('Artifacts', submissionContext.artifactCount),
          formatCountTag('Claims', submissionContext.claimCount),
        );
      }
      if (mintedTypes.length) {
        tags.push(...mintedTypes);
      }
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'execution',
        title: 'Blueprint executed',
        detail: `${actor} executed ${submissionLabel ?? blueprint ?? 'a blueprint'}${detailSuffix}.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    }
    case 'TRANSFER':
      if (event.tokens_transferred?.length) {
        const tokenTypes = resolveTokenTypes(
          state,
          event.tokens_transferred.map((token) => token.token_id),
        );
        tags.push(...tokenTypes);
      }
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'economy',
        title: 'Transfer recorded',
        detail: `Transfer recorded for ${submissionLabel ?? blueprint ?? 'the ledger'}.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    case 'BURN':
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'economy',
        title: 'Token burned',
        detail: `${actor} burned proof tokens.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    case 'SPEND':
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'economy',
        title: 'Token spent',
        detail: `${actor} spent proof tokens.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
    default:
      return {
        id: event.id,
        timestamp: event.timestamp,
        category: 'system',
        title: event.type,
        detail: 'Runner recorded a ledger event.',
        tags: normalizeTags(tags),
        links: evidenceLinks,
        role,
      };
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/') {
      pathname = '/client/index.html';
    }

    if (pathname === '/api/checkpoint') {
      const data = await fs.readFile(checkpointPath, 'utf8').catch(() => null);
      if (!data) {
        sendJson(res, 404, { ok: false, error: 'checkpoint not found' });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(data));
      } catch (error) {
        sendJson(res, 500, { ok: false, error: 'checkpoint parse failed' });
      }
      return;
    }

    if (pathname === '/api/stream') {
      res.writeHead(200, sseHeaders);
      res.write('retry: 2000\n\n');
      let lastStamp = 0;
      let lastLedgerLength = 0;

      const pushCheckpoint = async () => {
        const stat = await fs.stat(checkpointPath).catch(() => null);
        if (!stat) {
          sendSse(res, 'status', {
            ok: false,
            message: 'Checkpoint not found. Run the runner demo to generate data.',
          });
          return;
        }
        if (stat.mtimeMs <= lastStamp) {
          return;
        }
        lastStamp = stat.mtimeMs;
        const payload = await fs.readFile(checkpointPath, 'utf8').catch(() => null);
        if (!payload) {
          return;
        }
        try {
          const checkpoint = JSON.parse(payload);
          const ledger = checkpoint?.ledger ?? [];

          if (ledger.length < lastLedgerLength) {
            lastLedgerLength = 0;
            sendSse(res, 'reset', { message: 'Ledger reset detected.' });
          }

          if (lastLedgerLength === 0) {
            lastLedgerLength = ledger.length;
          } else if (ledger.length > lastLedgerLength) {
            const newEvents = ledger.slice(lastLedgerLength);
            newEvents.forEach((event) => {
              sendSse(res, 'ledger_event', event);
              const overlay = buildOverlay(event, checkpoint?.state ?? {});
              if (overlay) {
                sendSse(res, 'overlay', overlay);
              }
            });
            lastLedgerLength = ledger.length;
          }

          sendSse(res, 'checkpoint', checkpoint);
        } catch (error) {
          sendSse(res, 'status', { ok: false, message: 'Checkpoint parse failed.' });
        }
      };

      const interval = setInterval(pushCheckpoint, 1500);
      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 15000);

      pushCheckpoint();

      req.on('close', () => {
        clearInterval(interval);
        clearInterval(heartbeat);
      });
      return;
    }

    // ============================================
    // WORLD API ENDPOINTS
    // ============================================

    // World state endpoint
    if (pathname === '/api/world/state') {
      sendJson(res, 200, { ok: true, state: getWorldSnapshot() });
      return;
    }

    // Bot authentication endpoint (REST)
    if (pathname === '/api/world/bot/auth' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const token = data.token || req.headers.authorization?.replace('Bearer ', '');
          
          if (!token) {
            sendJson(res, 401, { ok: false, message: 'Missing authentication token' });
            return;
          }
          
          // Validate OpenClaw token format (for now, accept any non-empty token)
          // In production, this would verify against OpenClaw's API
          const isValidToken = token.length >= 8;
          
          if (!isValidToken) {
            sendJson(res, 401, { ok: false, message: 'Invalid token format' });
            return;
          }
          
          // Generate bot ID from token
          const botId = `bot_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 12)}`;
          
          // Check if bot already connected
          if (worldState.bots.has(botId)) {
            sendJson(res, 409, { ok: false, message: 'Bot already connected' });
            return;
          }
          
          // Find or create avatar for this bot
          let assignedAvatar = null;
          
          // First, try to find an unassigned demo avatar
          for (const avatar of worldState.avatars.values()) {
            if (!avatar.botId) {
              avatar.botId = botId;
              assignedAvatar = avatar;
              break;
            }
          }
          
          // If no demo avatar available, create a new one
          if (!assignedAvatar) {
            const avatarId = `avatar_${generateId()}`;
            assignedAvatar = {
              id: avatarId,
              name: `Bot-${botId.slice(4, 10)}`,
              x: 5 + Math.floor(Math.random() * 10),
              y: 5 + Math.floor(Math.random() * 10),
              school: null,
              state: 'IDLE',
              botId: botId
            };
            worldState.avatars.set(avatarId, assignedAvatar);
          }
          
          // Register bot (without WebSocket yet)
          worldState.bots.set(botId, {
            id: botId,
            token: token,
            avatarId: assignedAvatar.id,
            connectedAt: Date.now(),
            ws: null
          });
          
          console.log(`[World] Bot authenticated: ${botId}, assigned avatar: ${assignedAvatar.id}`);
          
          // Broadcast avatar update
          broadcastToSpectators('avatar_update', assignedAvatar);
          
          sendJson(res, 200, {
            ok: true,
            botId: botId,
            permissions: ['MOVE', 'INTERACT', 'READ'],
            assignedAvatar: {
              id: assignedAvatar.id,
              name: assignedAvatar.name,
              x: assignedAvatar.x,
              y: assignedAvatar.y
            },
            wsEndpoint: `/api/world/ws`
          });
        } catch (error) {
          console.error('[World] Auth error:', error);
          sendJson(res, 500, { ok: false, message: 'Internal server error' });
        }
      });
      return;
    }

    // World spectator stream (SSE for humans)
    if (pathname === '/api/world/stream') {
      res.writeHead(200, sseHeaders);
      res.write('retry: 2000\n\n');
      
      spectatorStreams.add(res);
      console.log(`[World] Spectator connected. Total: ${spectatorStreams.size}`);
      
      // Send initial state
      sendSse(res, 'world_state', getWorldSnapshot());
      
      // Heartbeat
      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 15000);
      
      // Watch for ledger events and broadcast to world
      let lastLedgerLength = 0;
      const checkLedger = async () => {
        const data = await fs.readFile(checkpointPath, 'utf8').catch(() => null);
        if (!data) return;
        
        try {
          const checkpoint = JSON.parse(data);
          const ledger = checkpoint?.ledger ?? [];
          
          if (ledger.length > lastLedgerLength) {
            const newEvents = ledger.slice(lastLedgerLength);
            newEvents.forEach(event => {
              sendSse(res, 'ledger_event', event);
            });
            lastLedgerLength = ledger.length;
          }
        } catch (e) {
          // Ignore parse errors
        }
      };
      
      const ledgerInterval = setInterval(checkLedger, 2000);
      checkLedger();
      
      req.on('close', () => {
        spectatorStreams.delete(res);
        clearInterval(heartbeat);
        clearInterval(ledgerInterval);
        console.log(`[World] Spectator disconnected. Total: ${spectatorStreams.size}`);
      });
      return;
    }

    // Trigger build night (dev endpoint)
    if (pathname === '/api/world/build-night' && req.method === 'POST') {
      worldState.isBuildNight = !worldState.isBuildNight;
      console.log(`[World] Build Night: ${worldState.isBuildNight ? 'STARTED' : 'ENDED'}`);
      
      broadcastToSpectators('build_night', { active: worldState.isBuildNight });
      broadcastToBots({ type: 'BUILD_NIGHT', data: { active: worldState.isBuildNight } });
      
      sendJson(res, 200, { ok: true, isBuildNight: worldState.isBuildNight });
      return;
    }

    // Spawn test avatar (dev endpoint)
    if (pathname === '/api/world/spawn-avatar' && req.method === 'POST') {
      const avatarId = `avatar_${generateId()}`;
      const avatar = {
        id: avatarId,
        name: `Test-${avatarId.slice(-4)}`,
        x: 5 + Math.floor(Math.random() * 20),
        y: 5 + Math.floor(Math.random() * 20),
        school: ['MINING', 'SMITHING', 'VERIFICATION'][Math.floor(Math.random() * 3)],
        state: 'IDLE',
        botId: null
      };
      
      worldState.avatars.set(avatarId, avatar);
      broadcastToSpectators('avatar_update', avatar);
      
      console.log(`[World] Spawned avatar: ${avatarId}`);
      sendJson(res, 200, { ok: true, avatar });
      return;
    }

    // Pixel world page redirect
    if (pathname === '/world' || pathname === '/world/') {
      pathname = '/client/world/world.html';
    }
    
    // Redirect common pages to /client/ folder
    if (pathname === '/' || pathname === '/index.html') {
      pathname = '/client/index.html';
    }
    if (pathname === '/feed.html') {
      pathname = '/client/feed.html';
    }
    if (pathname === '/dashboard.html') {
      pathname = '/client/dashboard.html';
    }

    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = contentTypes[ext] || 'application/octet-stream';
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Content-Type', contentType);

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }

    if (pathname.startsWith('/data/') || ext === '.html' || ext === '.js' || ext === '.css') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    const buffer = await fs.readFile(filePath);
    const acceptsGzip = String(req.headers['accept-encoding'] || '').includes('gzip');
    if (acceptsGzip && gzipTypes.has(contentType)) {
      const gzipped = zlib.gzipSync(buffer);
      res.setHeader('Content-Encoding', 'gzip');
      res.writeHead(200);
      res.end(gzipped);
      return;
    }

    res.writeHead(200);
    res.end(buffer);
  } catch (error) {
    res.writeHead(500);
    res.end('Server error');
    console.error(error);
  }
});

server.listen(port, () => {
  console.log(`UI server running at http://localhost:${port}`);
  console.log(`Pixel World at http://localhost:${port}/world`);
});

// ============================================
// WEBSOCKET SERVER FOR BOT CONNECTIONS
// ============================================

if (WebSocketServer) {
  const wss = new WebSocketServer({ server, path: '/api/world/ws' });
  
  wss.on('connection', (ws, req) => {
    let authenticatedBotId = null;
    
    console.log('[WebSocket] New connection');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'BOT_AUTH': {
            const { botId, token } = message;
            
            // Verify bot was pre-authenticated via REST
            const bot = worldState.bots.get(botId);
            if (!bot || bot.token !== token) {
              ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: 'Invalid credentials' }));
              ws.close();
              return;
            }
            
            // Associate WebSocket with bot
            bot.ws = ws;
            authenticatedBotId = botId;
            
            const avatar = worldState.avatars.get(bot.avatarId);
            
            ws.send(JSON.stringify({
              type: 'AUTH_SUCCESS',
              data: {
                botId,
                avatarId: bot.avatarId,
                avatar: avatar
              }
            }));
            
            // Send current world state
            ws.send(JSON.stringify({
              type: 'WORLD_STATE',
              state: getWorldSnapshot()
            }));
            
            console.log(`[WebSocket] Bot authenticated: ${botId}`);
            break;
          }
          
          case 'BOT_ACTION': {
            if (!authenticatedBotId) {
              ws.send(JSON.stringify({ type: 'ERROR', error: 'Not authenticated' }));
              return;
            }
            
            const bot = worldState.bots.get(authenticatedBotId);
            if (!bot) {
              ws.send(JSON.stringify({ type: 'ERROR', error: 'Bot not found' }));
              return;
            }
            
            const avatar = worldState.avatars.get(bot.avatarId);
            if (!avatar) {
              ws.send(JSON.stringify({
                type: 'ACTION_RESULT',
                actionId: message.actionId,
                success: false,
                error: 'Avatar not found'
              }));
              return;
            }
            
            // Process action
            const result = processAvatarAction(avatar, message.actionType, message.payload);
            
            ws.send(JSON.stringify({
              type: 'ACTION_RESULT',
              actionId: message.actionId,
              success: result.success,
              result: result.data,
              error: result.error
            }));
            
            // Broadcast avatar update if changed
            if (result.changed) {
              broadcastToSpectators('avatar_update', avatar);
              broadcastToBots({
                type: 'AVATAR_UPDATE',
                data: { id: avatar.id, ...result.data }
              });
            }
            break;
          }
          
          case 'PING': {
            ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
            break;
          }
          
          default:
            console.log(`[WebSocket] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error('[WebSocket] Message error:', error);
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid message format' }));
      }
    });
    
    ws.on('close', () => {
      if (authenticatedBotId) {
        const bot = worldState.bots.get(authenticatedBotId);
        if (bot) {
          // Release avatar
          const avatar = worldState.avatars.get(bot.avatarId);
          if (avatar) {
            avatar.botId = null;
            broadcastToSpectators('avatar_update', avatar);
          }
          
          // Remove bot
          worldState.bots.delete(authenticatedBotId);
          console.log(`[WebSocket] Bot disconnected: ${authenticatedBotId}`);
        }
      }
    });
    
    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });
  
  console.log('[Server] WebSocket support enabled');
} else {
  console.log('[Server] WebSocket support disabled (install ws package)');
}

// Process avatar action
function processAvatarAction(avatar, actionType, payload) {
  switch (actionType) {
    case 'MOVE': {
      const { x, y } = payload;
      if (typeof x !== 'number' || typeof y !== 'number') {
        return { success: false, error: 'Invalid coordinates' };
      }
      
      // Validate bounds (0-31 for 32x32 tile world)
      const clampedX = Math.max(0, Math.min(31, x));
      const clampedY = Math.max(0, Math.min(31, y));
      
      avatar.x = clampedX;
      avatar.y = clampedY;
      avatar.state = 'WALKING';
      
      // Reset to IDLE after a delay
      setTimeout(() => {
        if (avatar.state === 'WALKING') {
          avatar.state = 'IDLE';
          broadcastToSpectators('avatar_update', avatar);
        }
      }, 1000);
      
      return { success: true, changed: true, data: { x: clampedX, y: clampedY, state: 'WALKING' } };
    }
    
    case 'INTERACT': {
      const { buildingId } = payload;
      avatar.state = 'WORKING';
      
      setTimeout(() => {
        avatar.state = 'IDLE';
        broadcastToSpectators('avatar_update', avatar);
      }, 2000);
      
      return { success: true, changed: true, data: { state: 'WORKING', targetBuilding: buildingId } };
    }
    
    case 'READ': {
      avatar.state = 'READING';
      
      setTimeout(() => {
        avatar.state = 'IDLE';
        broadcastToSpectators('avatar_update', avatar);
      }, 1500);
      
      return { success: true, changed: true, data: { state: 'READING' } };
    }
    
    case 'CELEBRATE': {
      avatar.state = 'CELEBRATING';
      
      setTimeout(() => {
        avatar.state = 'IDLE';
        broadcastToSpectators('avatar_update', avatar);
      }, 3000);
      
      return { success: true, changed: true, data: { state: 'CELEBRATING' } };
    }
    
    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}
