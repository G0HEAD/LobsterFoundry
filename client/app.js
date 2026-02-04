const navToggle = document.querySelector('[data-nav-toggle]');
const navMenu = document.querySelector('#primary-navigation');

const closeNav = () => {
  if (!document.body.classList.contains('nav-open')) {
    return;
  }
  document.body.classList.remove('nav-open');
  if (navToggle) {
    navToggle.setAttribute('aria-expanded', 'false');
  }
};

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

if (navMenu) {
  navMenu.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.matches('a')) {
      closeNav();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeNav();
  }
});

const revealItems = document.querySelectorAll('[data-reveal]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (revealItems.length > 0) {
  if (prefersReducedMotion) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    revealItems.forEach((item) => observer.observe(item));
  }
}

const dashboard = document.querySelector('[data-dashboard]');
const landing = document.querySelector('[data-landing]');
const feed = document.querySelector('[data-feed]');
if (dashboard || landing || feed) {
  initDataViews().catch((error) => {
    console.error(error);
  });
}

if (landing) {
  initWorldPreview();
}

async function initDataViews() {
  const statusEl = document.querySelectorAll('[data-data-status]');
  const ledgerList = document.querySelector('[data-ledger-list]');
  const ledgerExport = document.querySelector('[data-ledger-export]');
  const queueList = document.querySelector('[data-queue-list]');
  const queueCount = document.querySelector('[data-queue-count]');
  const escrowCount = document.querySelector('[data-escrow-count]');
  const escrowBar = document.querySelector('[data-escrow-bar]');
  const budgetBar = document.querySelector('[data-budget-bar]');
  const contractsCount = document.querySelector('[data-contracts-count]');
  const contractsBody = document.querySelector('[data-contracts-body]');
  const tickerTrack = document.querySelector('[data-ticker-track]');
  const overlayStack = document.querySelector('[data-overlay-stack]');
  const evidenceList = document.querySelector('[data-evidence-list]');
  const evidenceCount = document.querySelector('[data-evidence-count]');

  let checkpoint = null;
  let overlayCache = [];
  let snapshotCache = null;
  let streamActive = false;
  const dataEndpoints = ['/api/checkpoint', '/data/runner-checkpoint.json'];

  try {
    const { data, source } = await fetchCheckpoint(dataEndpoints);
    if (data) {
      const savedAt = data?.saved_at ? new Date(data.saved_at) : new Date();
      applyCheckpoint(
        data,
        `Live data loaded at ${savedAt.toLocaleTimeString()} from ${source}.`,
        false,
      );
    } else {
      setStatus(
        statusEl,
        'Live data unavailable. Run the runner demo to generate data/runner-checkpoint.json.',
        true,
      );
    }
  } catch (error) {
    setStatus(
      statusEl,
      'Live data unavailable. Run the runner demo to generate data/runner-checkpoint.json.',
      true,
    );
  }

  startStream();

  if (ledgerExport) {
    ledgerExport.addEventListener('click', () => {
      if (!checkpoint) {
        return;
      }
      const blob = new Blob([JSON.stringify(checkpoint.ledger ?? [], null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ledger.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }

  async function fetchCheckpoint(urls) {
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          continue;
        }
        const data = await response.json();
        return { data, source: url };
      } catch (error) {
        continue;
      }
    }
    return { data: null, source: null };
  }

  function startStream() {
    if (typeof EventSource === 'undefined') {
      return;
    }
    const stream = new EventSource('/api/stream');

    stream.addEventListener('checkpoint', (event) => {
      try {
        const data = JSON.parse(event.data);
        streamActive = true;
        applyCheckpoint(data, `Live stream connected at ${new Date().toLocaleTimeString()}.`, false);
      } catch (error) {
        console.error(error);
      }
    });

    stream.addEventListener('ledger_event', (event) => {
      try {
        const data = JSON.parse(event.data);
        streamActive = true;
        applyLedgerEvent(data);
      } catch (error) {
        console.error(error);
      }
    });

    stream.addEventListener('overlay', (event) => {
      try {
        const data = JSON.parse(event.data);
        streamActive = true;
        applyOverlay(data);
      } catch (error) {
        console.error(error);
      }
    });

    stream.addEventListener('reset', (event) => {
      try {
        const payload = JSON.parse(event.data);
        snapshotCache = buildSnapshot(null);
        checkpoint = null;
        overlayCache = [];
        updateShared(snapshotCache);
        if (dashboard) {
          updateDashboard(snapshotCache);
        }
        if (landing) {
          updateLanding(snapshotCache);
        }
        if (feed) {
          updateFeed(snapshotCache);
        }
        if (overlayStack) {
          renderOverlayStack(overlayStack, overlayCache);
        }
        if (evidenceList) {
          renderEvidenceList(evidenceList, evidenceCount, []);
        }
        if (payload?.message) {
          setStatus(statusEl, payload.message, true);
        }
      } catch (error) {
        console.error(error);
      }
    });

    stream.addEventListener('status', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload?.ok) {
          setStatus(statusEl, payload?.message ?? 'Waiting for live data.', true);
        }
      } catch (error) {
        console.error(error);
      }
    });

    stream.addEventListener('error', () => {
      if (!streamActive) {
        setStatus(statusEl, 'Live stream unavailable. Showing last snapshot.', true);
      }
    });
  }

  function applyCheckpoint(data, message, isError) {
    if (!data) {
      return;
    }
    checkpoint = data;
    snapshotCache = buildSnapshot(data);
    updateShared(snapshotCache);
    if (dashboard) {
      updateDashboard(snapshotCache);
    }
    if (landing) {
      updateLanding(snapshotCache);
    }
    if (feed) {
      updateFeed(snapshotCache);
    }
    if (message) {
      setStatus(statusEl, message, isError);
    }
  }

  function applyLedgerEvent(event) {
    if (!event || !event.id) {
      return;
    }
    if (!checkpoint) {
      checkpoint = { ledger: [event] };
    } else {
      const ledger = checkpoint.ledger ?? [];
      if (ledger.some((item) => item.id === event.id)) {
        return;
      }
      ledger.push(event);
      checkpoint.ledger = ledger;
    }

    if (!snapshotCache) {
      snapshotCache = buildSnapshot(checkpoint);
    } else {
      snapshotCache.ledger = checkpoint.ledger ?? [];
      snapshotCache.ledgerVelocity = calculateLedgerVelocity(snapshotCache.ledger, 24);
      snapshotCache.activityScore = calculateActivityScore(
        snapshotCache.ledger,
        snapshotCache.openJobs?.length ?? 0,
        snapshotCache.activeEscrows?.length ?? 0,
      );
    }

    updateShared(snapshotCache);
    if (dashboard) {
      updateDashboard(snapshotCache);
    }
    if (landing) {
      updateLanding(snapshotCache);
    }
    if (feed) {
      updateFeed(snapshotCache);
    }
  }

  function applyOverlay(overlay) {
    if (!overlayStack || !overlay) {
      return;
    }
    const next = [overlay, ...overlayCache].filter((item) => item?.id);
    const unique = [];
    const seen = new Set();
    next.forEach((item) => {
      if (!item?.id || seen.has(item.id)) {
        return;
      }
      seen.add(item.id);
      unique.push(item);
    });
    overlayCache = unique.slice(0, 4);
    renderOverlayStack(overlayStack, overlayCache);
    renderEvidenceList(evidenceList, evidenceCount, collectEvidenceFromOverlays(overlayCache));
  }

  function updateShared(data) {
    const { ledger, state, accounts, openJobs, escrowTotal, verifierCount, ledgerVelocity } = data;
    const treasury = accounts.find((account) => account.id === 'TREASURY');
    const treasuryBalance = treasury?.cc_balance ?? 0;
    const cycle = state.world_state?.current_cycle ?? ledger.length ?? '--';
    const irlValue = Number.isFinite(state.world_state?.irl) ? state.world_state.irl : '--';
    const activity = formatActivityScore(data.activityScore);

    setTextAll('[data-cycle]', String(cycle));
    setTextAll('[data-irl]', String(irlValue));
    setTextAll('[data-treasury]', formatCc(treasuryBalance));
    setTextAll('[data-activity]', activity);
    setTextAll('[data-open-jobs]', String(openJobs.length));
    setTextAll('[data-escrow-total]', formatCc(escrowTotal));
    setTextAll('[data-verifiers]', String(verifierCount));
    setTextAll('[data-ledger-velocity]', ledgerVelocity);

    if (Number.isFinite(state.world_state?.irl)) {
      const percent = Math.min(100, Math.round((state.world_state.irl / 5) * 100));
      setStyleAll('[data-irl-bar]', 'width', `${percent}%`);
    } else {
      setStyleAll('[data-irl-bar]', 'width', '0%');
    }
  }

  function buildSnapshot(data) {
    const ledger = data?.ledger ?? [];
    const state = data?.state ?? {};
    const accounts = Object.values(state.accounts ?? {});
    const escrows = Object.values(state.escrows ?? {});
    const contracts = Object.values(state.contracts ?? {});
    const submissions = Object.values(state.submissions ?? {});
    const jobs = Object.values(state.verification_jobs ?? {});
    const activeEscrows = escrows.filter((escrow) => escrow.status === 'OPEN');
    const openJobs = jobs.filter((job) => job.status === 'OPEN');
    const verifierCount = accounts.filter((account) =>
      (account.licenses ?? []).some((license) => license.school === 'VERIFICATION'),
    ).length;
    const escrowTotal = activeEscrows.reduce(
      (sum, escrow) => sum + (escrow.balance_cc ?? 0),
      0,
    );
    const ledgerVelocity = calculateLedgerVelocity(ledger, 24);
    const activityScore = calculateActivityScore(ledger, openJobs.length, activeEscrows.length);

    return {
      ledger,
      state,
      accounts,
      escrows,
      contracts,
      submissions,
      jobs,
      activeEscrows,
      openJobs,
      verifierCount,
      escrowTotal,
      ledgerVelocity,
      activityScore,
    };
  }

  function updateDashboard(data) {
    const {
      ledger,
      accounts,
      escrows,
      contracts,
      submissions,
      openJobs,
      activeEscrows,
      escrowTotal,
    } = data;

    const treasury = accounts.find((account) => account.id === 'TREASURY');
    const treasuryBalance = treasury?.cc_balance ?? 0;

    if (ledgerList) {
      const recent = [...ledger]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);
      replaceChildren(
        ledgerList,
        recent.length
          ? recent.map(renderLedgerItem)
          : [renderEmpty('No ledger events yet.')],
      );
    }

    if (queueCount) {
      queueCount.textContent = `${openJobs.length} open`;
    }
    if (queueList) {
      replaceChildren(
        queueList,
        openJobs.length
          ? openJobs.map(renderQueueItem)
          : [renderEmpty('Queue is clear.')],
      );
    }

    const totalEscrowBalance = escrows.reduce((sum, escrow) => sum + (escrow.balance_cc ?? 0), 0);
    const activeEscrowBalance = escrowTotal;
    const escrowPercent = totalEscrowBalance
      ? Math.min(100, Math.round((activeEscrowBalance / totalEscrowBalance) * 100))
      : 0;
    if (escrowCount) {
      escrowCount.textContent = `${activeEscrows.length} active`;
    }
    if (escrowBar) {
      escrowBar.style.width = `${escrowPercent}%`;
    }

    const treasuryOutflow = ledger.reduce((sum, event) => {
      const change = (event.cc_changes ?? []).reduce((acc, item) => {
        if (item.account_id === 'TREASURY' && item.delta < 0) {
          return acc + Math.abs(item.delta);
        }
        return acc;
      }, 0);
      return sum + change;
    }, 0);
    const budgetTotal = treasuryOutflow + treasuryBalance;
    const budgetPercent = budgetTotal
      ? Math.min(100, Math.round((treasuryOutflow / budgetTotal) * 100))
      : 0;
    if (budgetBar) {
      budgetBar.style.width = `${budgetPercent}%`;
    }

    if (contractsBody) {
      const rows = contracts.map((contract) => {
        const related = submissions.filter((submission) => submission.contract_id === contract.id);
        const status = deriveContractStatus(related);
        const escrow = escrows.find((item) => item.id === contract.id);
        const escrowValue = escrow ? formatCc(escrow.balance_cc) : '--';
        return renderContractRow(contract, escrowValue, status);
      });

      replaceChildren(
        contractsBody,
        rows.length ? rows : [renderEmptyRow('No active contracts')],
      );

      const openCount = contracts.filter((contract) => {
        const related = submissions.filter((submission) => submission.contract_id === contract.id);
        return deriveContractStatus(related) === 'Open';
      }).length;
      if (contractsCount) {
        contractsCount.textContent = `${openCount} open`;
      }
    }
  }

  function updateLanding(data) {
    const { ledger, accounts, activeEscrows } = data;

    setTextAll('[data-accounts]', accounts.length ? String(accounts.length) : '--');
    setTextAll('[data-escrows]', String(activeEscrows.length ?? 0));
    setTextAll('[data-ledger]', ledger.length ? String(ledger.length) : '--');
  }

  function updateFeed(data) {
    const { ledger, accounts, activeEscrows, openJobs, activityScore, state } = data;

    const treasury = accounts.find((account) => account.id === 'TREASURY');
    const latestEvent = ledger[ledger.length - 1];

    const viewers = Math.max(1, ledger.length * 4 + openJobs.length * 12 + activeEscrows.length * 7);
    const lastBuild = latestEvent ? formatTimeAgo(latestEvent.timestamp) : '--';

    const viewersEl = document.querySelector('[data-viewers]');
    const openJobsEl = document.querySelector('[data-open-jobs]');
    const lastBuildEl = document.querySelector('[data-last-build]');
    const streamTitle = document.querySelector('[data-stream-title]');
    const streamDetail = document.querySelector('[data-stream-detail]');
    const streamEvent = document.querySelector('[data-stream-event]');
    const streamEscrow = document.querySelector('[data-stream-escrow]');
    const streamTreasury = document.querySelector('[data-stream-treasury]');
    const streamActivity = document.querySelector('[data-stream-activity]');
    const feedList = document.querySelector('[data-feed-list]');
    const feedCount = document.querySelector('[data-feed-count]');
    const chatList = document.querySelector('[data-chat-list]');

    if (viewersEl) {
      viewersEl.textContent = viewers.toLocaleString('en-US');
    }
    if (openJobsEl) {
      openJobsEl.textContent = String(openJobs.length);
    }
    if (lastBuildEl) {
      lastBuildEl.textContent = lastBuild;
    }

    if (streamTitle) {
      streamTitle.textContent = latestEvent
        ? `Now Streaming: ${latestEvent.type}`
        : 'Now Streaming: Awaiting events';
    }
    if (streamDetail) {
      streamDetail.textContent = latestEvent
        ? describeLedgerEvent(latestEvent)
        : 'Connect the Runner to begin the broadcast.';
    }
    if (streamEvent) {
      streamEvent.textContent = latestEvent ? latestEvent.type : '--';
    }
    if (streamEscrow) {
      streamEscrow.textContent = `${activeEscrows.length} open`;
    }
    if (streamTreasury) {
      streamTreasury.textContent = formatCc(treasury?.cc_balance ?? 0);
    }
    if (streamActivity) {
      streamActivity.textContent = formatActivityScore(activityScore);
    }

    if (tickerTrack) {
      const tickerItems = buildTickerItems(ledger);
      replaceChildren(
        tickerTrack,
        tickerItems.length
          ? tickerItems
          : [renderTickerItem('Broadcast standby. Connect Runner to stream live events.')],
      );
    }

    if (feedList) {
      const recent = [...ledger]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 6);
      replaceChildren(
        feedList,
        recent.length
          ? recent.map(renderLedgerItem)
          : [renderEmpty('No events yet.')],
      );
    }
    if (feedCount) {
      feedCount.textContent = `${ledger.length} events`;
    }

    if (overlayStack) {
      if (!streamActive || overlayCache.length === 0) {
        overlayCache = buildOverlayModels(ledger, state);
      }
      renderOverlayStack(overlayStack, overlayCache);
    }

    if (evidenceList) {
      const evidenceLinks = collectEvidenceFromOverlays(overlayCache);
      renderEvidenceList(evidenceList, evidenceCount, evidenceLinks);
    }

    if (chatList) {
      const chatMessages = (latestEvent ? buildChatMessages(latestEvent) : []).slice(0, 4);
      replaceChildren(
        chatList,
        chatMessages.length
          ? chatMessages.map(renderChatItem)
          : [renderEmpty('Chat opens when the feed goes live.')],
      );
    }
  }
}

function setStatus(element, message, isError) {
  if (!element) {
    return;
  }
  if (element instanceof NodeList || Array.isArray(element)) {
    element.forEach((item) => setStatus(item, message, isError));
    return;
  }
  element.textContent = message;
  element.classList.toggle('is-error', Boolean(isError));
}

function setTextAll(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function setStyleAll(selector, property, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.style[property] = value;
  });
}

function replaceChildren(container, children) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  children.forEach((child) => container.appendChild(child));
}

function calculateLedgerVelocity(ledger, windowHours) {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const count = ledger.filter((event) => Date.parse(event.timestamp) >= cutoff).length;
  return `${count}/${windowHours}h`;
}

function calculateActivityScore(ledger, openJobs, activeEscrows) {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  const recentEvents = ledger.filter((event) => Date.parse(event.timestamp) >= cutoff).length;
  const score = recentEvents * 8 + openJobs * 12 + activeEscrows * 6;
  return Math.min(100, Math.round(score));
}

function formatActivityScore(score) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  return `${safeScore}%`;
}

function renderLedgerItem(event) {
  const item = document.createElement('li');
  item.dataset.type = event.type;
  const dot = document.createElement('span');
  dot.className = 'dot';

  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = event.type;
  const description = document.createElement('p');
  description.textContent = describeLedgerEvent(event);
  content.appendChild(title);
  content.appendChild(description);

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = formatTimeAgo(event.timestamp);

  item.appendChild(dot);
  item.appendChild(content);
  item.appendChild(meta);
  return item;
}

function buildTickerItems(ledger) {
  const recent = [...ledger]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6);
  return recent.map((event) =>
    renderTickerItem(`${event.type}: ${describeLedgerEvent(event)}`),
  );
}

function renderTickerItem(message) {
  const item = document.createElement('span');
  item.className = 'ticker-item';
  item.textContent = message;
  return item;
}

function buildOverlayModels(ledger, state) {
  const recent = [...ledger]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 4);
  return recent
    .map((event) => deriveOverlayFromEvent(event, state))
    .filter(Boolean);
}

function deriveOverlayFromEvent(event, state) {
  if (!event) {
    return null;
  }
  const actor = resolveAccountLabel(event.actor_id, state);
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
  const jobRole = stakeContext?.job?.stamp_role ? humanize(stakeContext.job.stamp_role) : null;
  const stampDecision = stakeContext?.stamp?.decision ? humanize(stakeContext.stamp.decision) : null;

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
  const base = { id: event.id, timestamp: event.timestamp, role };
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
        ...base,
        category: 'escrow',
        title: 'Escrow funded',
        detail: escrowAmount
          ? `${actor} locked ${formatCc(escrowAmount)} for ${submissionLabel ?? 'a contract'}.`
          : `${actor} locked escrow funding for ${submissionLabel ?? 'a contract'}.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
      };
    case 'ESCROW_RELEASE':
      if (contractLabel) {
        tags.push(contractLabel);
      }
      return {
        ...base,
        category: 'escrow',
        title: 'Escrow released',
        detail: `${actor} released escrow for ${submissionLabel ?? 'a contract'}.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
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
        ...base,
        category: 'verification',
        title: 'Stake locked',
        detail: stakeLocked
          ? `${actor} locked ${formatCc(stakeLocked)} for ${jobRole ?? 'verification'} review.`
          : `${actor} locked stake for ${jobRole ?? 'verification'} review.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
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
        ...base,
        category: 'verification',
        title: stampDecision && jobRole ? `${jobRole} Stamp ${stampDecision}` : 'Stake released',
        detail: stakeReleased
          ? `${actor} cleared ${jobRole ?? 'verification'} and recovered ${formatCc(stakeReleased)}.`
          : `${actor} cleared ${jobRole ?? 'verification'} and recovered stake.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
      };
    case 'MINT':
      if (verifierPay) {
        tags.push(formatCc(verifierPay));
      }
      if (mintContext.stampRoles.length) {
        tags.push(...mintContext.stampRoles);
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
        ? `${mintContext.stampRoles.join(' + ')} stamps`
        : '';
      const stampDetail = stampSummary ? ` after ${stampSummary}` : '';
      return {
        ...base,
        category: 'mint',
        title: 'Proof minted',
        detail: `${actor} minted ${mintedLabel}${stampDetail} for ${
          mintContext.submissionContext?.deliverableLabel ?? 'verified work'
        }.`,
        tags: normalizeTags(tags),
        links: mintLinks,
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
        ...base,
        category: 'execution',
        title: 'Blueprint executed',
        detail: `${actor} executed ${submissionLabel ?? blueprint ?? 'a blueprint'}${detailSuffix}.`,
        tags: normalizeTags(tags),
        links: evidenceLinks,
      };
    }
    case 'TRANSFER':
      if (event.tokens_transferred?.length) {
        const tokenTypes = resolveTokenTypes(
          event.tokens_transferred.map((token) => token.token_id),
          state,
        );
        tags.push(...tokenTypes);
      }
      return {
        ...base,
        category: 'economy',
        title: 'Transfer recorded',
        detail: describeLedgerEvent(event),
        tags: normalizeTags(tags),
        links: evidenceLinks,
      };
    case 'BURN':
      return {
        ...base,
        category: 'economy',
        title: 'Token burned',
        detail: describeLedgerEvent(event),
        tags: normalizeTags(tags),
        links: evidenceLinks,
      };
    case 'SPEND':
      return {
        ...base,
        category: 'economy',
        title: 'Token spent',
        detail: describeLedgerEvent(event),
        tags: normalizeTags(tags),
        links: evidenceLinks,
      };
    default:
      return {
        ...base,
        category: 'system',
        title: event.type,
        detail: describeLedgerEvent(event),
        tags: normalizeTags(tags),
        links: evidenceLinks,
      };
  }
}

function resolveAccountLabel(accountId, state) {
  if (!accountId) {
    return 'Runner';
  }
  const account = state?.accounts?.[accountId];
  return account?.display_name || account?.handle || accountId;
}

function resolveRoleLabel(accountId) {
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
}

function resolveTokenTypes(tokenIds, state) {
  const tokens = tokenIds
    .map((id) => state?.tokens?.[id]?.type)
    .filter(Boolean);
  return [...new Set(tokens)];
}

function normalizeTags(tags, limit = 4) {
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
}

function normalizeLinks(links, limit = 6) {
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
}

function normalizeArtifactUrl(uri) {
  if (!uri) {
    return null;
  }
  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

function buildArtifactLinks(artifacts, kind, source) {
  return (artifacts ?? [])
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
}

function collectEvidenceLinks(submissionContext, stamp, sourceLabel) {
  const source = sourceLabel || submissionContext?.deliverableLabel || null;
  const links = [];
  links.push(...buildArtifactLinks(submissionContext?.artifacts, 'Artifact', source));
  links.push(...buildArtifactLinks(stamp?.artifacts, 'Evidence', source));
  return normalizeLinks(links);
}

function formatCountTag(label, count) {
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  return `${label} ${count}`;
}

function parseStakeAccount(changes) {
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
}

function parseEscrowAccount(changes) {
  const entry = (changes ?? []).find((change) =>
    String(change.account_id || '').startsWith('ESCROW:'),
  );
  if (!entry) {
    return null;
  }
  return String(entry.account_id).replace('ESCROW:', '');
}

function resolveSubmissionContext(state, submissionId) {
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
  const stampRoles = [...new Set(stamps.map((stamp) => humanize(stamp.role)))];
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
}

function resolveJobContext(state, jobId) {
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
}

function resolveMintContext(state, tokenIds) {
  const tokens = (tokenIds ?? []).map((id) => state?.tokens?.[id]).filter(Boolean);
  const tokenTypes = [...new Set(tokens.map((token) => token.type))];
  const stampIds = tokens.flatMap((token) => token.stamp_ids ?? []);
  const stamps = stampIds.map((id) => state?.stamps?.[id]).filter(Boolean);
  const stampRoles = [...new Set(stamps.map((stamp) => humanize(stamp.role)))];
  const submissionId = stamps[0]?.submission_id;
  const submissionContext = resolveSubmissionContext(state, submissionId);
  return { tokenTypes, stampRoles, submissionContext };
}

function sumReason(changes, reason, direction) {
  return changes
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
}

function renderOverlayStack(container, overlays) {
  if (!container) {
    return;
  }
  if (!overlays || !overlays.length) {
    replaceChildren(container, [renderOverlayEmpty()]);
    return;
  }
  replaceChildren(container, overlays.map(renderOverlayCard));
}

function renderOverlayCard(overlay) {
  const card = document.createElement('div');
  card.className = 'overlay-card';
  if (overlay.category) {
    card.dataset.category = overlay.category;
  }

  const meta = document.createElement('div');
  meta.className = 'overlay-meta';
  const label = document.createElement('span');
  label.textContent = overlay.role || overlay.category || 'Signal';
  const time = document.createElement('span');
  const timeValue = overlay.timestamp ? formatTimeAgo(overlay.timestamp) : '';
  time.textContent = timeValue || 'just now';
  meta.appendChild(label);
  meta.appendChild(time);

  const title = document.createElement('strong');
  title.textContent = overlay.title || 'Live update';
  const detail = document.createElement('p');
  detail.textContent = overlay.detail || '';

  const tags = document.createElement('div');
  tags.className = 'overlay-tags';
  const tagList = (overlay.tags ?? []).filter((tag) => tag && tag !== overlay.role);
  tagList.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = tag;
    tags.appendChild(chip);
  });

  card.appendChild(meta);
  card.appendChild(title);
  if (overlay.detail) {
    card.appendChild(detail);
  }
  if (tagList.length) {
    card.appendChild(tags);
  }
  if (overlay.links?.length) {
    const links = document.createElement('div');
    links.className = 'overlay-links';
    overlay.links.forEach((link) => {
      if (!link?.url) {
        return;
      }
      const anchor = document.createElement('a');
      anchor.className = 'overlay-link';
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';

      if (link.kind) {
        const kind = document.createElement('span');
        kind.className = 'overlay-link-kind';
        kind.textContent = link.kind;
        anchor.appendChild(kind);
      }

      const label = document.createElement('span');
      label.textContent = link.label || 'Evidence';
      anchor.appendChild(label);

      if (link.source) {
        anchor.title = link.source;
      }

      links.appendChild(anchor);
    });
    if (links.childElementCount) {
      card.appendChild(links);
    }
  }
  return card;
}

function renderOverlayEmpty() {
  const card = document.createElement('div');
  card.className = 'overlay-card is-empty';
  const title = document.createElement('strong');
  title.textContent = 'Awaiting overlays';
  const detail = document.createElement('p');
  detail.textContent = 'Live cues appear as the Runner executes ledger events.';
  card.appendChild(title);
  card.appendChild(detail);
  return card;
}

function collectEvidenceFromOverlays(overlays) {
  return normalizeLinks(
    (overlays ?? []).flatMap((overlay) => overlay?.links ?? []),
    6,
  );
}

function renderEvidenceList(container, countEl, links) {
  if (!container) {
    return;
  }
  const items = links && links.length ? links : [];
  if (!items.length) {
    replaceChildren(container, [renderEvidenceEmpty()]);
    if (countEl) {
      countEl.textContent = '0 links';
    }
    return;
  }
  replaceChildren(container, items.map(renderEvidenceItem));
  if (countEl) {
    countEl.textContent = `${items.length} links`;
  }
}

function renderEvidenceItem(link) {
  const item = document.createElement('li');
  const anchor = document.createElement('a');
  anchor.href = link.url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';

  const label = document.createElement('span');
  label.className = 'evidence-label';
  label.textContent = link.label || 'Evidence';

  const meta = document.createElement('span');
  meta.className = 'evidence-meta';
  meta.textContent = [link.kind, link.source].filter(Boolean).join(' - ');

  anchor.appendChild(label);
  if (meta.textContent) {
    anchor.appendChild(meta);
  }
  item.appendChild(anchor);
  return item;
}

function renderEvidenceEmpty() {
  const item = document.createElement('li');
  item.className = 'empty-state';
  item.textContent = 'No evidence yet.';
  return item;
}

function renderQueueItem(job) {
  const item = document.createElement('div');
  item.className = 'queue-item';

  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `${humanize(job.stamp_role)} Review`;
  const sub = document.createElement('p');
  sub.textContent = `Submission ${truncate(job.submission_id)}`;
  content.appendChild(title);
  content.appendChild(sub);

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = formatCc(job.current_pay_cc ?? job.base_pay_cc ?? 0);

  item.appendChild(content);
  item.appendChild(pill);
  return item;
}

function renderContractRow(contract, escrowValue, status) {
  const row = document.createElement('tr');
  const nameCell = document.createElement('td');
  nameCell.textContent = humanize(contract.payload?.deliverable_type ?? contract.id);
  const escrowCell = document.createElement('td');
  escrowCell.textContent = escrowValue;
  const statusCell = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = status;
  statusCell.appendChild(pill);

  row.appendChild(nameCell);
  row.appendChild(escrowCell);
  row.appendChild(statusCell);
  return row;
}

function renderChatItem(message) {
  const item = document.createElement('li');
  item.textContent = message;
  return item;
}

function renderEmpty(message) {
  const item = document.createElement('li');
  item.className = 'empty-state';
  item.textContent = message;
  return item;
}

function renderEmptyRow(message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 3;
  cell.className = 'empty-state';
  cell.textContent = message;
  row.appendChild(cell);
  return row;
}

function describeLedgerEvent(event) {
  if (event.type === 'MINT') {
    const count = event.tokens_minted?.length ?? 0;
    return `Minted ${count} token${count === 1 ? '' : 's'}.`;
  }
  if (event.type === 'BLUEPRINT_EXEC') {
    return event.blueprint_id
      ? `Blueprint executed ${truncate(event.blueprint_id)}.`
      : 'Blueprint executed.';
  }
  if (event.type === 'ESCROW_LOCK') {
    return 'Escrow locked for quest funding.';
  }
  if (event.type === 'ESCROW_RELEASE') {
    return 'Escrow released.';
  }
  if (event.type === 'STAKE_LOCK') {
    return 'Stake locked for verification.';
  }
  if (event.type === 'STAKE_RELEASE') {
    return 'Stake released.';
  }
  if (event.type === 'TRANSFER') {
    return 'Token transfer recorded.';
  }
  if (event.type === 'BURN') {
    return 'Token burn recorded.';
  }
  if (event.type === 'SPEND') {
    return 'Token spend recorded.';
  }
  const delta = (event.cc_changes ?? []).reduce((sum, change) => sum + change.delta, 0);
  if (delta !== 0) {
    return `Net CC ${formatCc(delta)}.`;
  }
  return 'Runner execution event.';
}

function buildChatMessages(event) {
  if (!event) {
    return [];
  }
  const lines = [];
  if (event.type === 'MINT') {
    lines.push('Spectator: Fresh proof just landed.');
    lines.push('Archivist: Logging the new token mint.');
  } else if (event.type === 'ESCROW_LOCK') {
    lines.push('Town Hall: Escrow secured for a new quest.');
  } else if (event.type === 'BLUEPRINT_EXEC') {
    lines.push('Runner: Blueprint executed on schedule.');
    lines.push('Spectator: World state updated live.');
  } else if (event.type === 'STAKE_LOCK') {
    lines.push('Verifier: Stake locked. Reviewing now.');
  } else if (event.type === 'STAKE_RELEASE') {
    lines.push('Verifier: Stake cleared.');
  } else {
    lines.push('Observer: Runner executed a blueprint.');
  }
  return lines;
}

function deriveContractStatus(submissions) {
  if (!submissions.length) {
    return 'Open';
  }
  if (submissions.some((submission) => submission.status === 'PENDING_AUDIT')) {
    return 'Pending Audit';
  }
  if (submissions.some((submission) => submission.status === 'SUBMITTED')) {
    return 'Verifying';
  }
  if (submissions.some((submission) => submission.status === 'VERIFIED')) {
    return 'Verified';
  }
  if (submissions.every((submission) => submission.status === 'REJECTED')) {
    return 'Rejected';
  }
  return 'In Review';
}

function formatCc(value) {
  const sign = value < 0 ? '-' : '';
  const amount = Math.abs(value);
  const hasDecimal = Math.abs(amount % 1) > 0.001;
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  });
  return `${sign}${formatter.format(amount)} CC`;
}

function formatTimeAgo(value) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  const diff = Date.now() - timestamp;
  if (diff < 0) {
    return 'just now';
  }
  if (diff < 60000) {
    return 'just now';
  }
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(value) {
  if (!value) {
    return '#';
  }
  return value.length > 6 ? `#${value.slice(0, 4)}` : `#${value}`;
}

function humanize(value) {
  if (!value) {
    return '--';
  }
  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function initWorldPreview() {
  const canvas = document.querySelector('[data-world-preview]');
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const districts = getPreviewDistricts();
  if (!districts.length) {
    return;
  }

  let frames = [];
  let currentIndex = 0;
  let nextIndex = districts.length > 1 ? 1 : 0;
  let lastSwap = performance.now();
  let holdMs = randomRange(10000, 28000);
  const transitionMs = 1400;

  const resizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.imageSmoothingEnabled = false;
    frames = buildDistrictFrames(districts, width, height);
  };

  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas);
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(resizeCanvas);

  const render = (now) => {
    if (!frames.length) {
      requestAnimationFrame(render);
      return;
    }

    const elapsed = now - lastSwap;
    const transitionStart = holdMs;
    const transitionProgress = (elapsed - transitionStart) / transitionMs;
    const blend = Math.min(1, Math.max(0, transitionProgress));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFrame(ctx, frames[currentIndex], 1 - blend);
    if (blend > 0) {
      drawFrame(ctx, frames[nextIndex], blend);
    }

    if (elapsed >= holdMs + transitionMs) {
      currentIndex = nextIndex;
      nextIndex = (nextIndex + 1) % districts.length;
      lastSwap = now;
      holdMs = randomRange(10000, 28000);
    }

    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
}

function drawFrame(ctx, frame, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(frame.canvas, 0, 0);
  if (frame.label) {
    const padding = Math.round(frame.canvas.height * 0.07);
    const barHeight = Math.round(frame.canvas.height * 0.18);
    ctx.fillStyle = 'rgba(10, 10, 20, 0.65)';
    ctx.fillRect(0, frame.canvas.height - barHeight, frame.canvas.width, barHeight);
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(10, Math.round(frame.canvas.height * 0.08))}px "Press Start 2P", monospace`;
    ctx.fillText(frame.label, padding, frame.canvas.height - barHeight / 2);
  }
  ctx.restore();
}

function buildDistrictFrames(districts, width, height) {
  if (!districts.length) {
    return [];
  }

  const worldWidth = typeof WORLD_CONFIG !== 'undefined' ? WORLD_CONFIG.WORLD_WIDTH : 32;
  const worldHeight = typeof WORLD_CONFIG !== 'undefined' ? WORLD_CONFIG.WORLD_HEIGHT : 32;
  const tileSize = Math.max(6, Math.floor(Math.min(width, height) / 12));
  const worldMap = buildWorldPreviewMap(districts, worldWidth, worldHeight, tileSize);

  const frames = districts.map((district) => {
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = width;
    baseCanvas.height = height;
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) {
      return null;
    }
    baseCtx.imageSmoothingEnabled = false;
    baseCtx.fillStyle = '#0a0a12';
    baseCtx.fillRect(0, 0, width, height);

    const padding = 2;
    const bounds = district.bounds;
    const cropX = Math.max(0, bounds.x - padding);
    const cropY = Math.max(0, bounds.y - padding);
    const cropW = Math.min(worldWidth, bounds.x + bounds.width + padding) - cropX;
    const cropH = Math.min(worldHeight, bounds.y + bounds.height + padding) - cropY;

    const sx = cropX * tileSize;
    const sy = cropY * tileSize;
    const sWidth = cropW * tileSize;
    const sHeight = cropH * tileSize;
    const scaleX = width / sWidth;
    const scaleY = height / sHeight;
    const scale = Math.max(scaleX, scaleY);
    const drawWidth = Math.ceil(sWidth * scale);
    const drawHeight = Math.ceil(sHeight * scale);
    const dx = Math.floor((width - drawWidth) / 2);
    const dy = Math.floor((height - drawHeight) / 2);

    baseCtx.drawImage(worldMap, sx, sy, sWidth, sHeight, dx, dy, drawWidth, drawHeight);

    baseCtx.strokeStyle = 'rgba(100, 200, 150, 0.35)';
    baseCtx.lineWidth = Math.max(1, Math.round(tileSize / 6));
    baseCtx.strokeRect(dx, dy, drawWidth, drawHeight);

    return {
      canvas: baseCanvas,
      label: district.name,
    };
  });

  return frames.filter(Boolean);
}

function buildWorldPreviewMap(districts, worldWidth, worldHeight, tileSize) {
  const canvas = document.createElement('canvas');
  canvas.width = worldWidth * tileSize;
  canvas.height = worldHeight * tileSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#223020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  districts.forEach((district) => {
    const bounds = district.bounds;
    if (!bounds) {
      return;
    }
    const base = district.color || '#4a9079';
    const dark = shiftColor(base, -30);
    const light = shiftColor(base, 18);
    ctx.fillStyle = base;
    ctx.fillRect(
      bounds.x * tileSize,
      bounds.y * tileSize,
      bounds.width * tileSize,
      bounds.height * tileSize,
    );

    const seed = hashString(district.id || district.name || 'district');
    const random = mulberry32(seed);
    for (let y = 0; y < bounds.height; y++) {
      for (let x = 0; x < bounds.width; x++) {
        const noise = random();
        if (noise > 0.82) {
          ctx.fillStyle = light;
        } else if (noise < 0.18) {
          ctx.fillStyle = dark;
        } else {
          continue;
        }
        ctx.fillRect(
          (bounds.x + x) * tileSize,
          (bounds.y + y) * tileSize,
          tileSize,
          tileSize,
        );
      }
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = Math.max(1, Math.floor(tileSize / 6));
    ctx.strokeRect(
      bounds.x * tileSize,
      bounds.y * tileSize,
      bounds.width * tileSize,
      bounds.height * tileSize,
    );
  });

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = Math.max(1, Math.floor(tileSize / 8));
  for (let x = 0; x <= worldWidth; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tileSize, 0);
    ctx.lineTo(x * tileSize, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= worldHeight; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * tileSize);
    ctx.lineTo(canvas.width, y * tileSize);
    ctx.stroke();
  }

  return canvas;
}

function getPreviewDistricts() {
  if (typeof DISTRICTS !== 'undefined' && DISTRICTS) {
    return Object.values(DISTRICTS).map((district) => ({
      id: district.id,
      name: district.name,
      color: district.color,
      bounds: district.bounds,
    }));
  }

  return [
    { id: 'landing', name: 'The Landing', color: '#4a9079', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    { id: 'townhall', name: 'Town Hall', color: '#c49a4a', bounds: { x: 10, y: 0, width: 12, height: 10 } },
    { id: 'workyard', name: 'The Workyard', color: '#9c4a2f', bounds: { x: 22, y: 0, width: 10, height: 16 } },
    { id: 'verification', name: 'Verification Guild', color: '#8b5cf6', bounds: { x: 0, y: 10, width: 10, height: 12 } },
    { id: 'archives', name: 'Archives', color: '#3b82f6', bounds: { x: 10, y: 10, width: 12, height: 12 } },
    { id: 'quarantine', name: 'Quarantine Bazaar', color: '#ef4444', bounds: { x: 0, y: 22, width: 16, height: 10 } },
    { id: 'ledger', name: 'Ledger Wall', color: '#1b6f6a', bounds: { x: 16, y: 22, width: 16, height: 10 } },
  ];
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shiftColor(hex, amount) {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Math.max(0, Math.min(255, parseInt(normalized.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(normalized.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(normalized.slice(4, 6), 16) + amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
