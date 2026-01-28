// public/game.js
(() => {
  'use strict';

  /* =========================================================
     DOM
     ========================================================= */
  const $ = (id) => document.getElementById(id);

  const canvas = $('map');
  const ctx = canvas?.getContext?.('2d');

  const tooltip = $('tooltip');
  const turnEl = $('turn');
  const viewerEl = $('viewer');
  const readyStatusEl = $('readyStatus');
  const gameInfoEl = $('gameInfo');
  const statusEl = $('status');

  const readyTurnBtn = $('readyTurnBtn');
  const resignBtn = $('resignBtn');
  const confirmResignBtn = $('confirmResignBtn');

  const zoomInBtn = $('zoomInBtn');
  const zoomOutBtn = $('zoomOutBtn');
  const resetViewBtn = $('resetViewBtn');

  const openSetupBtn = $('openSetupBtn');

  // Setup overlay
  const setupOverlay = $('setupOverlay');
  const setupOpenAs = $('setupOpenAs');
  const setupCreateBtn = $('setupCreateBtn');
  const setupCloseBtn = $('setupCloseBtn');
  const createdLinksEl = $('createdLinks');

  const joinGameIdEl = $('joinGameId');
  const joinCodeEl = $('joinCode');
  const joinBtn = $('joinBtn');

  const setupMapW = $('setupMapW');
  const setupMapH = $('setupMapH');
  const setupNeutralCount = $('setupNeutralCount');
  const setupHomeSysRes = $('setupHomeSysRes');
  const setupPlayerRes = $('setupPlayerRes');

  const setupUJumpShip = $('setupUJumpShip');
  const setupUShipyard = $('setupUShipyard');
  const setupUMine = $('setupUMine');
  const setupULab = $('setupULab');
  const setupUStriker = $('setupUStriker');
  const setupUEscort = $('setupUEscort');
  const setupUBlocker = $('setupUBlocker');

  // Build UI
  const buildHint = $('buildHint');
  const selectedShipyardEl = $('selectedShipyard');
  const buildPanel = $('buildPanel');
  const queueBuildBtn = $('queueBuildBtn');
  const clearBuildBtn = $('clearBuildBtn');
  const buildInputs = {
    Striker: $('bStriker'),
    Escort: $('bEscort'),
    Blocker: $('bBlocker'),
    Mine: $('bMine'),
    Lab: $('bLab'),
    JumpShip: $('bJumpShip'),
    // Optional if your HTML has it:
    Shipyard: $('bShipyard'),
  };

  // Cargo UI
  const cargoHint = $('cargoHint');
  const selectedJumpShipEl = $('selectedJumpShip');
  const cargoPanel = $('cargoPanel');
  const cargoSummaryEl = $('cargoSummary');
  const cargoListEl = $('cargoList');
  const unloadSelectedBtn = $('unloadSelectedBtn');
  const unloadAllBtn = $('unloadAllBtn');
  const loadSelectedUnitBtn = $('loadSelectedUnitBtn');
  const selectedUnitLine = $('selectedUnitLine');
  const resourceAmountInput = $('resourceAmount');
  const loadResourcesBtn = $('loadResourcesBtn');
  const convertShipBtn = $('convertShipBtn');

  // Optional load-many control: <input id="loadCount" type="number" min="1" value="1">
  const loadCountInput = $('loadCount');

  // Research UI
  const researchHint = $('researchHint');
  const selectedLabEl = $('selectedLab');
  const researchPanel = $('researchPanel');
  const techLevelsEl = $('techLevels');
  const researchTechSelect = $('researchTech');
  const researchTargetLevel = $('researchTargetLevel');
  const queueResearchBtn = $('queueResearchBtn');

  // Report
  const reportEl = $('report');

  if (!canvas || !ctx) {
    console.error('Canvas missing (#map).');
    return;
  }

  /* =========================================================
     CONSTANTS
     ========================================================= */
  const COST = { JumpShip: 10, Striker: 2, Escort: 1, Blocker: 1, Mine: 1, Lab: 3, Shipyard: 10 };
  const TECH_TYPES = ['Striker', 'Escort', 'Blocker', 'Mine', 'Shipyard', 'JumpShip', 'Lab'];

  const FACTION_COLOR = {
    hive: '#35d04a',
    ithaxi: '#ff8a2a',
    neutral: '#888'
  };

  /* =========================================================
     SESSION (URL + localStorage)
     ========================================================= */
  const LS_KEY = 'GE_SESSION'; // stores {gameId, code}
  let session = { gameId: null, code: null };

  function loadSessionFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') session = { gameId: obj.gameId || null, code: obj.code || null };
    } catch { /* ignore */ }
  }
  function saveSessionToStorage() {
    localStorage.setItem(LS_KEY, JSON.stringify({ gameId: session.gameId, code: session.code }));
  }
  function clearSession() {
    session = { gameId: null, code: null };
    localStorage.removeItem(LS_KEY);
  }

  function getQueryParams() {
    const p = new URLSearchParams(window.location.search);
    return { gameId: p.get('game'), code: p.get('code') };
  }

  function setUrl(gameId, code) {
    const p = new URLSearchParams();
    p.set('game', gameId);
    p.set('code', code);
    window.history.replaceState({}, '', `/?${p.toString()}`);
  }

  function clearUrl() {
    window.history.replaceState({}, '', `/`);
  }

  function showStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  /* =========================================================
     VIEW / STATE
     ========================================================= */
  let view = { scale: 80, offsetX: 80, offsetY: 80 };
  let draggingPan = false;
  let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

  let game = null;
  let yourFaction = null;

  let selectedShipyard = null;
  let selectedJumpShip = null;
  let selectedLab = null;
  let selectedUnit = null;

  // Stack selection info (hit item includes item.units[])
  let selectedUnitItem = null;

  let draggingJumpShip = null;
  let selectedCargoIndex = null;

  let drawItems = [];

  function setBuildEnabled(enabled) { if (buildPanel) buildPanel.style.display = enabled ? 'block' : 'none'; }
  function setCargoEnabled(enabled) { if (cargoPanel) cargoPanel.style.display = enabled ? 'block' : 'none'; }
  function setResearchEnabled(enabled) { if (researchPanel) researchPanel.style.display = enabled ? 'block' : 'none'; }

  function clearBuildInputs() {
    for (const k of Object.keys(buildInputs)) if (buildInputs[k]) buildInputs[k].value = 0;
  }

  function worldToScreen(wx, wy) {
    return { x: view.offsetX + wx * view.scale, y: view.offsetY + wy * view.scale };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
  }

  function getSystem(id) { return game?.systems?.find(s => s.id === id) || null; }
  function techLevel(faction, tech) {
    const lvl = game?.techLevels?.[faction]?.[tech];
    return Number.isFinite(lvl) ? lvl : 0;
  }

  /* ============================
     SYSTEM DISPLAY NAMES (SYS-XX)
     - You can keep this mapping, but note: server already uses SYS-XX.
     - This is only for display and does NOT change real IDs used for API calls.
     ============================ */
  const SYSNAME_KEY_PREFIX = 'GE_SYSNAMES_';
  let sysNameMap = null; // { [realSystemId]: 'SYS-01' }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ensureSysNameMap() {
    if (!session.gameId || !Array.isArray(game?.systems) || game.systems.length === 0) return;

    const key = SYSNAME_KEY_PREFIX + session.gameId;
    const ids = game.systems.map(s => String(s.id));

    try { sysNameMap = JSON.parse(localStorage.getItem(key) || 'null'); } catch { sysNameMap = null; }

    const looksValid =
      sysNameMap &&
      typeof sysNameMap === 'object' &&
      Object.keys(sysNameMap).length === ids.length &&
      ids.every(id => typeof sysNameMap[id] === 'string');

    if (looksValid) return;

    const shuffled = ids.slice();
    const rnd = mulberry32(hashString(session.gameId));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const map = {};
    shuffled.forEach((realId, idx) => {
      map[realId] = `SYS-${String(idx + 1).padStart(2, '0')}`;
    });

    sysNameMap = map;
    try { localStorage.setItem(key, JSON.stringify(map)); } catch {}
  }

  function displaySysId(realId) {
    const id = String(realId ?? '');
    if (!id) return '';
    return (sysNameMap && sysNameMap[id]) ? sysNameMap[id] : id;
  }

  function displaySys(sys) {
    return displaySysId(sys?.id);
  }

  function canSeeSystemStats(sysId) {
    if (!game || !yourFaction) return false;
    return game.units?.some(u => u.systemId === sysId && u.faction === yourFaction) || false;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // --------------------
  // Ownership + combat markers
  // --------------------
  let combatSystems = new Set(); // systemIds where combat occurred last resolved turn (server-provided)

  function inferOwnerForSystem(sysId) {
    if (!game || !Array.isArray(game.units)) return null;
    let hasI = false, hasH = false;
    for (const u of game.units) {
      if (!u || u.systemId !== sysId) continue;
      if (u.faction === 'ithaxi') hasI = true;
      else if (u.faction === 'hive') hasH = true;
    }
    if (hasI && !hasH) return 'ithaxi';
    if (hasH && !hasI) return 'hive';
    return null;
  }

  function displayOwnerForSystem(sys) {
    return (sys && sys.owner) || inferOwnerForSystem(sys?.id) || 'neutral';
  }

  function jumpshipCapForFaction(faction) {
    const lvl = techLevel(faction, 'JumpShip');
    return Math.floor(8 * (1 + 0.2 * lvl));
  }

  /* =========================================================
     ENDGAME OVERLAY (dynamic)
     ========================================================= */
  let endOverlay = null;
  let endOverlayInner = null;

  function ensureEndOverlay() {
    if (endOverlay) return;

    endOverlay = document.createElement('div');
    endOverlay.style.position = 'fixed';
    endOverlay.style.inset = '0';
    endOverlay.style.background = 'rgba(0,0,0,0.85)';
    endOverlay.style.display = 'none';
    endOverlay.style.zIndex = '9999';
    endOverlay.style.alignItems = 'center';
    endOverlay.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.width = 'min(760px, 92vw)';
    card.style.maxHeight = '86vh';
    card.style.overflow = 'auto';
    card.style.background = '#111';
    card.style.border = '1px solid #333';
    card.style.borderRadius = '12px';
    card.style.padding = '16px 16px 12px 16px';
    card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';

    const title = document.createElement('div');
    title.style.fontSize = '20px';
    title.style.fontWeight = '700';
    title.style.marginBottom = '10px';
    title.textContent = 'Game Over';

    endOverlayInner = document.createElement('div');
    endOverlayInner.style.fontSize = '14px';
    endOverlayInner.style.lineHeight = '1.4';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '12px';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => { endOverlay.style.display = 'none'; };

    const newGameBtn = document.createElement('button');
    newGameBtn.textContent = 'Back to Setup';
    newGameBtn.onclick = () => {
      endOverlay.style.display = 'none';
      clearSelections();
      clearSession();
      clearUrl();
      game = null;
      yourFaction = null;
      if (turnEl) turnEl.textContent = 'Turn: ?';
      if (viewerEl) viewerEl.textContent = 'You: ?';
      if (gameInfoEl) gameInfoEl.textContent = 'Game: ?';
      if (readyStatusEl) readyStatusEl.textContent = 'Ready: ?';
      showStatus('');
      if (setupOverlay) setupOverlay.style.display = 'flex';
      draw();
    };

    btnRow.appendChild(closeBtn);
    btnRow.appendChild(newGameBtn);

    card.appendChild(title);
    card.appendChild(endOverlayInner);
    card.appendChild(btnRow);

    endOverlay.appendChild(card);
    document.body.appendChild(endOverlay);
  }

  function fmtTypeTable(title, obj) {
    const order = ['JumpShip', 'Shipyard', 'Striker', 'Escort', 'Blocker', 'Mine', 'Lab'];
    const rows = order.map(t => `<tr><td>${escapeHtml(t)}</td><td style="text-align:right">${escapeHtml(obj?.[t] ?? 0)}</td></tr>`).join('');
    return `
      <div style="margin-top:10px">
        <div style="font-weight:700; margin:6px 0">${escapeHtml(title)}</div>
        <table style="width:100%; border-collapse:collapse"><tbody>${rows}</tbody></table>
      </div>
    `;
  }

  function showEndgameOverlay() {
    ensureEndOverlay();
    if (!game?.gameOver) return;

    const winner = game.winner ? String(game.winner) : 'draw';
    const stats = game.stats || {};
    const prod = stats.produced || {};
    const built = stats.built || {};
    const destroyedBy = stats.destroyedBy || {};

    const winnerLine = (winner === 'draw')
      ? `<div><b>Result:</b> Draw</div>`
      : `<div><b>Winner:</b> ${escapeHtml(winner)}</div>`;

    const producedLine = `
      <div style="margin-top:8px">
        <b>Total resources produced (mining):</b><br>
        ithaxi: ${escapeHtml(prod.ithaxi ?? 0)}<br>
        hive: ${escapeHtml(prod.hive ?? 0)}
      </div>
    `;

    endOverlayInner.innerHTML =
      `${winnerLine}
       ${producedLine}
       ${fmtTypeTable('Units built by Ithaxi', built.ithaxi)}
       ${fmtTypeTable('Units built by Hive', built.hive)}
       ${fmtTypeTable('Units destroyed by Ithaxi', destroyedBy.ithaxi)}
       ${fmtTypeTable('Units destroyed by Hive', destroyedBy.hive)}
       <div style="margin-top:10px; color:#aaa; font-size:12px">
         Notes: “resources produced” is tracked from mining output credited to the system owner (per current rules).
       </div>`;

    endOverlay.style.display = 'flex';
  }

  /* =========================================================
     SHIPYARD QUEUE UI (optional, uses server endpoints if present)
     ========================================================= */
  let shipyardQueueWrap = null;
  let shipyardQueueList = null;
  let shipyardQueueClearBtn = null;

  function ensureShipyardQueueUI() {
    if (!buildPanel) return;
    if (shipyardQueueWrap) return;

    shipyardQueueWrap = document.createElement('div');
    shipyardQueueWrap.style.marginTop = '10px';
    shipyardQueueWrap.style.borderTop = '1px solid #333';
    shipyardQueueWrap.style.paddingTop = '10px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.justifyContent = 'space-between';

    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.textContent = 'Build Queue';

    shipyardQueueClearBtn = document.createElement('button');
    shipyardQueueClearBtn.textContent = 'Clear queue';
    shipyardQueueClearBtn.disabled = true;

    head.appendChild(title);
    head.appendChild(shipyardQueueClearBtn);

    shipyardQueueList = document.createElement('div');
    shipyardQueueList.style.marginTop = '8px';

    shipyardQueueWrap.appendChild(head);
    shipyardQueueWrap.appendChild(shipyardQueueList);
    buildPanel.appendChild(shipyardQueueWrap);
  }

  /* =========================================================
     API
     ========================================================= */
  async function apiCreateGame(cfg) {
    const res = await fetch('/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg || {})
    });
    return await res.json();
  }

  function requireSessionOrOverlay() {
    if (session.gameId && session.code) return true;
    if (setupOverlay) setupOverlay.style.display = 'flex';
    return false;
  }

  async function apiGetState() {
    const { gameId, code } = session;
    const url = `/games/${encodeURIComponent(gameId)}/state?code=${encodeURIComponent(code)}`;
    const res = await fetch(url);
    return await res.json();
  }

  async function apiTurnStatus() {
    const { gameId, code } = session;
    const url = `/games/${encodeURIComponent(gameId)}/turn/status?code=${encodeURIComponent(code)}`;
    const res = await fetch(url);
    return await res.json();
  }

  async function apiReadyTurn(setValue) {
    const { gameId, code } = session;
    const payload = { gameId, code };
    if (typeof setValue === 'boolean') payload.set = setValue;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/turn/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  async function apiResignIntent(setValue) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/resignIntent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, set: !!setValue })
    });
    return await res.json();
  }

  async function apiResign() {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/resign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code })
    });
    return await res.json();
  }

  async function apiMove(unitId, toSystemId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, unitId, toSystemId })
    });
    return await res.json();
  }

  async function apiQueueBuild(shipyardId, units) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/produce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, shipyardId, units })
    });
    return await res.json();
  }

  // Optional queue management endpoints
  async function apiShipyardQueueClear(shipyardId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/shipyardQueue/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, shipyardId })
    });
    return await res.json();
  }

  async function apiShipyardQueueRemove(shipyardId, index) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/shipyardQueue/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, shipyardId, index })
    });
    return await res.json();
  }

  async function apiLoadUnit(unitId, jumpShipId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, unitId, jumpShipId })
    });
    return await res.json();
  }

  async function apiUnload(jumpShipId, payload) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, jumpShipId, ...payload })
    });
    return await res.json();
  }

  async function apiLoadResources(jumpShipId, amount) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/loadResources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, jumpShipId, amount })
    });
    return await res.json();
  }

  async function apiQueueResearch(labId, tech, targetLevel) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, labId, tech, targetLevel })
    });
    return await res.json();
  }

  async function apiConvertToShipyard(jumpShipId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/convertToShipyard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, code, jumpShipId })
    });
    return await res.json();
  }

  /* =========================================================
     SETUP LOGIC
     ========================================================= */
  function openOverlay() {
    if (setupOverlay) setupOverlay.style.display = 'flex';
  }
  function closeOverlay() {
    if (setupOverlay) setupOverlay.style.display = 'none';
  }

  function renderCreatedLinks(data, openAs) {
    if (!createdLinksEl) return;
    createdLinksEl.style.display = 'block';

    const ith = data?.join?.ithaxi?.link || '';
    const hiv = data?.join?.hive?.link || '';

    createdLinksEl.textContent =
      `Game created!
Game ID: ${data.gameId}

Ithaxi link (send to Ithaxi player):
${ith}

Hive link (send to Hive player):
${hiv}

You chose to open as: ${openAs}
`;
  }

  async function tryAutoJoinFromUrlOrStorage() {
    loadSessionFromStorage();
    const q = getQueryParams();

    // URL overrides storage if present
    const urlHas = q.gameId && q.code;
    if (urlHas) {
      session.gameId = q.gameId;
      session.code = q.code;
      saveSessionToStorage();
      closeOverlay();
      return true;
    }

    // if storage present, use it and keep URL consistent
    if (session.gameId && session.code) {
      setUrl(session.gameId, session.code);
      closeOverlay();
      return true;
    }

    openOverlay();
    return false;
  }

  if (setupCreateBtn) {
    setupCreateBtn.addEventListener('click', async () => {
      const openAs = String(setupOpenAs?.value || 'ithaxi').toLowerCase();

      const cfg = {
        mapW: Number(setupMapW?.value || 12),
        mapH: Number(setupMapH?.value || 12),
        neutralCount: Number(setupNeutralCount?.value || 18),
        homeSysRes: Number(setupHomeSysRes?.value || 10),
        playerRes: Number(setupPlayerRes?.value || 50),

        uJumpShip: Number(setupUJumpShip?.value || 1),
        uShipyard: Number(setupUShipyard?.value || 1),
        uMine: Number(setupUMine?.value || 1),
        uLab: Number(setupULab?.value || 0),

        uStriker: Number(setupUStriker?.value || 1),
        uEscort: Number(setupUEscort?.value || 1),
        uBlocker: Number(setupUBlocker?.value || 0)
      };

      showStatus('Creating game...');
      if (setupCreateBtn) setupCreateBtn.disabled = true;

      try {
        const r = await apiCreateGame(cfg);

        if (!r?.success) {
          showStatus(`Create failed: ${r?.error || 'unknown error'}`);
          return;
        }

        renderCreatedLinks(r, openAs);

        // Auto-open as chosen side
        const chosenCode = (openAs === 'hive') ? r.join.hive.code : r.join.ithaxi.code;
        session.gameId = r.gameId;
        session.code = chosenCode;
        saveSessionToStorage();
        setUrl(session.gameId, session.code);

        showStatus('Game created. Copy the links/codes above. Close this panel when ready.');
        // Do NOT auto-close — keep the codes visible until the user closes the overlay.
        await refresh(true);
      } finally {
        if (setupCreateBtn) setupCreateBtn.disabled = false;
      }
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      const gid = String(joinGameIdEl?.value || '').trim();
      const code = String(joinCodeEl?.value || '').trim();
      if (!gid || !code) { showStatus('Enter Game ID + join code.'); return; }

      session.gameId = gid;
      session.code = code;
      saveSessionToStorage();
      setUrl(session.gameId, session.code);

      showStatus('Joining...');
      closeOverlay();
      await refresh(true);
    });
  }

  if (setupCloseBtn) setupCloseBtn.addEventListener('click', () => closeOverlay());

  if (openSetupBtn) {
    openSetupBtn.addEventListener('click', () => {
      clearSelections();
      clearSession();
      clearUrl();
      game = null;
      yourFaction = null;
      if (turnEl) turnEl.textContent = 'Turn: ?';
      if (viewerEl) viewerEl.textContent = 'You: ?';
      if (gameInfoEl) gameInfoEl.textContent = 'Game: ?';
      if (readyStatusEl) readyStatusEl.textContent = 'Ready: ?';
      showStatus('');
      openOverlay();
      draw();
    });
  }

  /* =========================================================
     PANELS
     ========================================================= */
  function updateBuildPanel() {
    if (!buildHint || !selectedShipyardEl) return;

    ensureShipyardQueueUI();

    if (!selectedShipyard) {
      buildHint.textContent = 'Click a Shipyard to build units.';
      selectedShipyardEl.textContent = '';
      if (shipyardQueueList) shipyardQueueList.innerHTML = '';
      if (shipyardQueueClearBtn) shipyardQueueClearBtn.disabled = true;
      setBuildEnabled(false);
      return;
    }

    const queue = selectedShipyard.buildQueue || [];
    const qEntries = Array.isArray(queue) ? queue.length : 0;

    const sys = selectedShipyard.systemId ? getSystem(selectedShipyard.systemId) : null;
    const sysRes = (sys && canSeeSystemStats(sys.id) && sys.resources != null) ? sys.resources : '??';

    const lvl = techLevel(selectedShipyard.faction, 'Shipyard');
    const cap = Math.floor(10 * (1 + 0.2 * lvl));

    buildHint.textContent = 'Shipyard selected. Queue applies ONLY to this shipyard.';
    selectedShipyardEl.textContent =
      `Selected Shipyard: #${selectedShipyard.id} (${selectedShipyard.faction}) @ ${displaySysId(selectedShipyard.systemId)} | ` +
      `System R:${sysRes} | Spend cap: ${cap} | Queue entries: ${qEntries}`;

    // Render queue list (server queue entries are typically {type} one-per-unit)
    if (shipyardQueueList) {
      shipyardQueueList.innerHTML = '';
      const arr = Array.isArray(selectedShipyard.buildQueue) ? selectedShipyard.buildQueue : [];
      if (arr.length === 0) {
        const d = document.createElement('div');
        d.className = 'muted';
        d.textContent = '(empty)';
        shipyardQueueList.appendChild(d);
      } else {
        arr.forEach((job, idx) => {
          const row = document.createElement('div');
          row.className = 'listItem';
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.justifyContent = 'space-between';
          row.style.gap = '10px';

          const left = document.createElement('div');
          const type = job?.type ?? '?';
          left.textContent = `${type}`;

          const right = document.createElement('div');
          right.style.display = 'flex';
          right.style.gap = '8px';
          right.style.alignItems = 'center';

          const idxEl = document.createElement('span');
          idxEl.className = 'muted';
          idxEl.textContent = `#${idx}`;

          const rm = document.createElement('button');
          rm.textContent = 'Remove';
          rm.onclick = async () => {
            if (!selectedShipyard) return;
            showStatus(`Removing queue entry #${idx}...`);
            const r = await apiShipyardQueueRemove(selectedShipyard.id, idx).catch(() => null);
            if (!r?.success) {
              showStatus(`Remove failed (server may not support this endpoint): ${r?.error || 'network error'}`);
              return;
            }
            showStatus('Removed.');
            await refresh(false);
          };

          right.appendChild(idxEl);
          right.appendChild(rm);

          row.appendChild(left);
          row.appendChild(right);

          shipyardQueueList.appendChild(row);
        });
      }
    }

    if (shipyardQueueClearBtn) {
      shipyardQueueClearBtn.disabled = !(Array.isArray(selectedShipyard.buildQueue) && selectedShipyard.buildQueue.length > 0);
      shipyardQueueClearBtn.onclick = async () => {
        if (!selectedShipyard) return;
        showStatus('Clearing shipyard queue...');
        const r = await apiShipyardQueueClear(selectedShipyard.id).catch(() => null);
        if (!r?.success) {
          showStatus(`Clear failed (server may not support this endpoint): ${r?.error || 'network error'}`);
          return;
        }
        showStatus('Queue cleared.');
        await refresh(false);
      };
    }

    setBuildEnabled(true);
  }

  function cargoUsedLocal(ship) {
    if (!ship || ship.type !== 'JumpShip') return 0;
    if (!Array.isArray(ship.cargo)) return 0;
    let used = 0;
    for (const entry of ship.cargo) {
      if (typeof entry === 'number') {
        const u = game?.units?.find(x => x.id === entry);
        if (!u) continue;
        used += (u.type === 'Shipyard') ? 8 : 1;
      } else if (entry && typeof entry === 'object' && entry.kind === 'resource') {
        used += Math.max(0, Math.floor(Number(entry.amount) || 0));
      }
    }
    return used;
  }

  function humanCargoEntry(entry) {
    if (typeof entry === 'number') {
      const u = game?.units?.find(x => x.id === entry);
      if (!u) return `Unit #${entry} (missing)`;
      const sz = (u.type === 'Shipyard') ? 8 : 1;
      return `${u.type} #${u.id} (size ${sz})`;
    }
    if (entry && typeof entry === 'object' && entry.kind === 'resource') {
      const amt = Math.max(0, Math.floor(Number(entry.amount) || 0));
      return `Resources x${amt} (size ${amt})`;
    }
    return 'Unknown cargo';
  }

  function updateCargoPanel() {
    if (!cargoHint || !selectedJumpShipEl) return;

    if (!selectedJumpShip) {
      cargoHint.textContent = 'Click a JumpShip to manage cargo.';
      selectedJumpShipEl.textContent = '';
      if (cargoSummaryEl) cargoSummaryEl.textContent = '';
      if (cargoListEl) cargoListEl.innerHTML = '';
      selectedCargoIndex = null;
      if (unloadSelectedBtn) unloadSelectedBtn.disabled = true;
      if (unloadAllBtn) unloadAllBtn.disabled = true;
      if (loadSelectedUnitBtn) loadSelectedUnitBtn.disabled = true;
      if (selectedUnitLine) selectedUnitLine.textContent = '';
      if (convertShipBtn) convertShipBtn.disabled = true;
      setCargoEnabled(false);
      return;
    }

    const used = cargoUsedLocal(selectedJumpShip);
    const sys = selectedJumpShip.systemId ? getSystem(selectedJumpShip.systemId) : null;
    const sysRes = (sys && canSeeSystemStats(sys.id) && sys.resources != null) ? sys.resources : '??';

    const lvl = techLevel(selectedJumpShip.faction, 'JumpShip');
    const cap = Math.floor(8 * (1 + 0.2 * lvl));

    cargoHint.textContent = 'JumpShip selected.';
    selectedJumpShipEl.textContent = `Selected JumpShip: #${selectedJumpShip.id} (${selectedJumpShip.faction}) @ ${displaySysId(selectedJumpShip.systemId) || '—'}`;
    if (cargoSummaryEl) cargoSummaryEl.textContent = `Cargo used: ${used}/${cap} | System resources: ${sysRes}`;

    const cargoArr = Array.isArray(selectedJumpShip.cargo) ? selectedJumpShip.cargo : [];
    if (cargoListEl) cargoListEl.innerHTML = '';

    if (cargoListEl) {
      if (cargoArr.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'listItem';
        empty.style.cursor = 'default';
        empty.textContent = '(empty)';
        cargoListEl.appendChild(empty);
      } else {
        cargoArr.forEach((entry, idx) => {
          const div = document.createElement('div');
          div.className = 'listItem' + (idx === selectedCargoIndex ? ' selected' : '');
          div.innerHTML = `<span>${escapeHtml(humanCargoEntry(entry))}</span><span class="muted">#${idx}</span>`;
          div.addEventListener('click', () => { selectedCargoIndex = idx; updateCargoPanel(); });
          cargoListEl.appendChild(div);
        });
      }
    }

    if (unloadAllBtn) unloadAllBtn.disabled = cargoArr.length === 0;
    if (unloadSelectedBtn) unloadSelectedBtn.disabled = !(cargoArr.length > 0 && selectedCargoIndex != null && selectedCargoIndex >= 0 && selectedCargoIndex < cargoArr.length);

    const canLoadUnit =
      selectedUnitItem &&
      selectedUnit &&
      selectedUnit.systemId &&
      selectedJumpShip.systemId &&
      selectedUnit.systemId === selectedJumpShip.systemId &&
      selectedUnit.faction === selectedJumpShip.faction &&
      selectedUnit.type !== 'JumpShip';

    if (loadSelectedUnitBtn) loadSelectedUnitBtn.disabled = !canLoadUnit;

    if (selectedUnitLine) {
      const stackN = selectedUnitItem?.units?.length || (selectedUnit ? 1 : 0);
      selectedUnitLine.textContent = selectedUnit
        ? `Selected unit: ${selectedUnit.type} @ ${displaySysId(selectedUnit.systemId) || '—'} (${selectedUnit.faction}) | available: x${stackN}`
        : '';
    }

    if (convertShipBtn) convertShipBtn.disabled = !!game?.gameOver || !selectedJumpShip.systemId;

    setCargoEnabled(true);
  }

  function updateResearchPanel() {
    if (!researchHint || !selectedLabEl) return;

    if (!selectedLab) {
      researchHint.textContent = 'Click a Lab to research technology.';
      selectedLabEl.textContent = '';
      setResearchEnabled(false);
      return;
    }

    const sys = selectedLab.systemId ? getSystem(selectedLab.systemId) : null;
    const sysRes = (sys && canSeeSystemStats(sys.id) && sys.resources != null) ? sys.resources : '??';

    researchHint.textContent = 'Lab selected. Research order applies to ALL labs of your faction in this system.';
    selectedLabEl.textContent =
      `Selected Lab: #${selectedLab.id} (${selectedLab.faction}) @ ${displaySysId(selectedLab.systemId)} | ` +
      `System R:${sysRes}`;

    if (researchTechSelect && researchTechSelect.options.length === 0) {
      for (const t of TECH_TYPES) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        researchTechSelect.appendChild(opt);
      }
    }

    if (researchTechSelect && researchTargetLevel) {
      const t = researchTechSelect.value || 'Striker';
      const cur = techLevel(selectedLab.faction, t);
      researchTargetLevel.value = String(cur + 1);
    }

    setResearchEnabled(true);
  }

  function renderTechLevels() {
    if (!techLevelsEl || !game?.techLevels) return;
    const parts = [];
    for (const faction of Object.keys(game.techLevels)) {
      const obj = game.techLevels[faction] || {};
      const one = TECH_TYPES.map(t => `${t}:${obj[t] ?? 0}`).join('  ');
      parts.push(`<div class="muted"><b>${escapeHtml(faction)}</b> — ${escapeHtml(one)}</div>`);
    }
    techLevelsEl.innerHTML = parts.join('');
  }

  function renderReport() {
    if (!reportEl) return;

    // Use server-provided combat markers (already fog-filtered)
    combatSystems = new Set(Array.isArray(game?.lastCombatSystems) ? game.lastCombatSystems : []);

    const lines = Array.isArray(game?.lastTurnLog) ? game.lastTurnLog : [];
    if (lines.length === 0) { reportEl.innerHTML = `<div class="muted">(no visible events yet)</div>`; return; }

    const out = [];
    for (const raw of lines) {
      const line = String(raw ?? '');
      const isCombatHeader = line.startsWith('[Combat ');
      const isAutoUnload = line.startsWith('[AutoUnload ');
      const isShipyard = line.startsWith('[Shipyard ');
      const isMining = line.startsWith('[Mining ');
      const isResearch = line.startsWith('[Research ');
      const isGame = line.startsWith('[Game]');
      const isSub = line.startsWith('  - ') || line.startsWith(' - ');

      let cls = 'reportLine';
      if (isGame) cls += ' gameHead';
      else if (isCombatHeader) cls += ' combatHead';
      else if (isSub) cls += ' combatSub';
      else if (isAutoUnload) cls += ' autoHead';
      else if (isResearch) cls += ' researchHead';
      else if (isShipyard) cls += ' shipHead';
      else if (isMining) cls += ' miningHead';

      out.push(`<div class="${cls}">${escapeHtml(line)}</div>`);
    }
    reportEl.innerHTML = out.join('');
  }

  /* =========================================================
     DRAWING
     ========================================================= */
  function drawGrid() {
    const scale = view.scale;
    if (scale < 25) return;

    const w = canvas.width, h = canvas.height;
    const topLeft = screenToWorld(0, 0);
    const botRight = screenToWorld(w, h);

    const xMin = Math.floor(Math.min(topLeft.x, botRight.x)) - 1;
    const xMax = Math.ceil(Math.max(topLeft.x, botRight.x)) + 1;
    const yMin = Math.floor(Math.min(topLeft.y, botRight.y)) - 1;
    const yMax = Math.ceil(Math.max(topLeft.y, botRight.y)) + 1;

    ctx.save();
    for (let x = xMin; x <= xMax; x++) {
      const sx = worldToScreen(x, 0).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.strokeStyle = (x % 5 === 0) ? '#1f1f1f' : '#141414';
      ctx.lineWidth = (x % 5 === 0) ? 1.2 : 1;
      ctx.stroke();
    }
    for (let y = yMin; y <= yMax; y++) {
      const sy = worldToScreen(0, y).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.strokeStyle = (y % 5 === 0) ? '#1f1f1f' : '#141414';
      ctx.lineWidth = (y % 5 === 0) ? 1.2 : 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function buildDrawItemsForSystem(sys) {
    const unitsHere = game.units.filter(u => u.systemId === sys.id);
    if (unitsHere.length === 0) return [];

    const jumpships = unitsHere.filter(u => u.type === 'JumpShip');
    const stackables = unitsHere.filter(u => u.type !== 'JumpShip');

    const byKey = new Map();
    for (const u of stackables) {
      const key = `${u.type}|${u.faction || 'neutral'}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(u);
    }

    const stacks = [];
    for (const [key, list] of byKey.entries()) {
      list.sort((a, b) => a.id - b.id);
      stacks.push({ kind: 'stack', unit: list[0], units: list, sysId: sys.id, stackKey: key });
    }

    const typeRank = (t) => {
      if (t === 'JumpShip') return 1;
      if (t === 'Shipyard') return 2;
      if (t === 'Lab') return 3;
      if (t === 'Escort') return 4;
      if (t === 'Blocker') return 5;
      if (t === 'Striker') return 6;
      if (t === 'Mine') return 7;
      return 9;
    };

    const items = [];
    jumpships.slice().sort((a, b) => (a.faction || '').localeCompare(b.faction || '') || a.id - b.id)
      .forEach(u => items.push({ kind: 'unit', unit: u, units: [u], sysId: sys.id, stackKey: null }));

    stacks.slice().sort((a, b) => {
      const ra = typeRank(a.unit.type), rb = typeRank(b.unit.type);
      if (ra !== rb) return ra - rb;
      if ((a.unit.faction || '') !== (b.unit.faction || '')) return (a.unit.faction || '').localeCompare(b.unit.faction || '');
      return a.unit.id - b.unit.id;
    }).forEach(s => items.push(s));

    return items;
  }

  function drawSquare(x, y, s) { ctx.beginPath(); ctx.rect(x - s, y - s, s * 2, s * 2); }
  function drawDiamond(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
  }
  function drawTriangle(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x - s, y + s);
    ctx.closePath();
  }
  function drawPolygon(x, y, r, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function unitGlyph(type) {
    if (type === 'JumpShip') return 'J';
    if (type === 'Shipyard') return 'SY';
    if (type === 'Striker') return 'S';
    if (type === 'Escort') return 'E';
    if (type === 'Blocker') return 'B';
    if (type === 'Mine') return 'M';
    if (type === 'Lab') return 'L';
    return '?';
  }

  function drawUnitLabel(u, x, y, size, isGhost = false) {
    const g = unitGlyph(u.type);
    if (!g) return;

    ctx.save();
    ctx.globalAlpha = isGhost ? 0.65 : 1;

    const fontSize = Math.max(10, Math.floor(size * (g.length === 2 ? 0.85 : 0.95)));
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';

    ctx.strokeText(g, x, y);
    ctx.fillText(g, x, y);

    ctx.restore();
  }

  function drawUnit(u, x, y, isGhost = false, highlight = false) {
    const factionColor = FACTION_COLOR[u.faction] || 'white';
    const outline = highlight ? '#ffffff' : (isGhost ? '#aaa' : '#000');

    let size = 10;
    if (u.type === 'JumpShip') size = 14;
    if (u.type === 'Shipyard') size = 12;
    if (u.type === 'Striker') size = 12;
    if (u.type === 'Escort') size = 9;
    if (u.type === 'Blocker') size = 11;
    if (u.type === 'Mine') size = 10;
    if (u.type === 'Lab') size = 10;

    ctx.save();
    ctx.globalAlpha = isGhost ? 0.7 : 1;

    ctx.fillStyle = factionColor;
    ctx.strokeStyle = outline;
    ctx.lineWidth = highlight ? 3 : 2;

    if (u.type === 'JumpShip') {
      drawDiamond(x, y, size); ctx.fill(); ctx.stroke();
      if (Array.isArray(u.cargo) && u.cargo.length > 0) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + size - 3, y - size + 3, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (u.type === 'Shipyard') {
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Striker') {
      drawTriangle(x, y, size); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Escort') {
      drawSquare(x, y, size); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Blocker') {
      drawPolygon(x, y, size, 6); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Mine') {
      drawPolygon(x, y, size, 8); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Lab') {
      ctx.beginPath(); ctx.arc(x, y, size - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    drawUnitLabel(u, x, y, size, isGhost);

    ctx.restore();
  }

  // ✅ FIX: server uses `inTransit` for destination
function getUnitDestinationSystemId(u) {
  if (!u) return null;
  return (
    u.inTransit ??                // <-- main one
    u.destinationSystemId ??
    u.destSystemId ??
    u.toSystemId ??
    u.moveToSystemId ??
    u.moveTo ??
    u.order?.toSystemId ??
    u.order?.moveToSystemId ??
    u.orders?.move?.toSystemId ??
    null
  );
}

function drawJumpShipDestLines() {
  if (!game?.units || !game?.systems) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  for (const u of game.units) {
    if (u.type !== 'JumpShip') continue;

    const toId = getUnitDestinationSystemId(u);
    if (!toId || toId === u.systemId) continue;

    const fromSys = getSystem(u.systemId);
    const toSys = getSystem(toId);
    if (!fromSys || !toSys) continue;

    const a = worldToScreen(fromSys.x, fromSys.y);
    const b = worldToScreen(toSys.x, toSys.y);

    const col = FACTION_COLOR[u.faction] || '#fff';
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.55;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Arrow head
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const ah = 10;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - Math.cos(ang - 0.4) * ah, b.y - Math.sin(ang - 0.4) * ah);
    ctx.lineTo(b.x - Math.cos(ang + 0.4) * ah, b.y - Math.sin(ang + 0.4) * ah);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}


  // ✅ FIX: server uses `inTransit` for destination
  function getUnitDestinationSystemId(u) {
    if (!u) return null;
    return (
      u.inTransit ??                // <-- main one
      u.destinationSystemId ??
      u.destSystemId ??
      u.toSystemId ??
      u.moveToSystemId ??
      u.moveTo ??
      u.order?.toSystemId ??
      u.order?.moveToSystemId ??
      u.orders?.move?.toSystemId ??
      null
    );
  }

  function drawJumpShipDestLines() {
    if (!game?.units || !game?.systems) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    for (const u of game.units) {
      if (u.type !== 'JumpShip') continue;

      const toId = getUnitDestinationSystemId(u);
      if (!toId || toId === u.systemId) continue;

      const fromSys = getSystem(u.systemId);
      const toSys = getSystem(toId);
      if (!fromSys || !toSys) continue;

      const a = worldToScreen(fromSys.x, fromSys.y);
      const b = worldToScreen(toSys.x, toSys.y);

      const col = FACTION_COLOR[u.faction] || '#fff';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.55;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Arrow head
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const ah = 10;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(ang - 0.4) * ah, b.y - Math.sin(ang - 0.4) * ah);
      ctx.lineTo(b.x - Math.cos(ang + 0.4) * ah, b.y - Math.sin(ang + 0.4) * ah);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawItems = [];

    if (!game) {
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      ctx.fillText('Loading...', 20, 30);
      return;
    }

    drawGrid();

    // systems
    for (const sys of game.systems) {
      const p = worldToScreen(sys.x, sys.y);
      const r = 18;

      const owner = displayOwnerForSystem(sys);
      ctx.fillStyle = FACTION_COLOR[owner] || FACTION_COLOR.neutral;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ✅ FIX: combat marker (red ring) from server-provided lastCombatSystems
      if (combatSystems && combatSystems.has(sys.id)) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Label
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(displaySysId(sys.id), p.x + 22, p.y - 10);

      // Improvement: hide R/V unless you have units there
      const vis = canSeeSystemStats(sys.id);
      const rText = vis ? ((sys.resources == null) ? 'R:?' : `R:${sys.resources}`) : 'R:??';
      const vText = vis ? ((sys.value == null) ? 'V:?' : `V:${sys.value}`) : 'V:??';

      ctx.fillStyle = '#ccc';
      ctx.font = '11px Arial';
      ctx.fillText(`${rText} ${vText}`, p.x + 22, p.y + 6);
    }

    // JumpShip destination lines
    drawJumpShipDestLines();

    // units around systems
    for (const sys of game.systems) {
      const items = buildDrawItemsForSystem(sys);
      if (items.length === 0) continue;

      const center = worldToScreen(sys.x, sys.y);
      const baseRadius = 30;

      items.forEach((item, idx) => {
        const angle = (idx / Math.max(1, items.length)) * Math.PI * 2;
        const ux = center.x + Math.cos(angle) * baseRadius;
        const uy = center.y + Math.sin(angle) * baseRadius;

        item.x = ux;
        item.y = uy;

        const rep = item.unit;
        rep._drawX = ux;
        rep._drawY = uy;
        rep._stackCount = (item.kind === 'stack') ? item.units.length : 1;

        const highlight =
          (selectedShipyard && rep.type === 'Shipyard' && rep.id === selectedShipyard.id) ||
          (selectedJumpShip && rep.type === 'JumpShip' && rep.id === selectedJumpShip.id) ||
          (selectedLab && rep.type === 'Lab' && rep.id === selectedLab.id) ||
          (selectedUnit && rep.id === selectedUnit.id);

        drawUnit(rep, ux, uy, false, highlight);

        if (item.kind === 'stack' && item.units.length > 1) {
          ctx.save();
          ctx.font = '12px Arial';
          ctx.fillStyle = 'white';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          const label = `x${item.units.length}`;
          ctx.strokeText(label, ux + 12, uy + 16);
          ctx.fillText(label, ux + 12, uy + 16);
          ctx.restore();
        }

        let rr = 14;
        if (rep.type === 'JumpShip') rr = 18;
        if (rep.type === 'Shipyard') rr = 16;
        if (rep.type === 'Lab') rr = 14;
        if (rep.type === 'Escort') rr = 12;

        drawItems.push({
          unit: rep,
          units: item.units,
          x: ux,
          y: uy,
          r: rr,
          sysId: sys.id
        });
      });
    }

    if (draggingJumpShip && draggingJumpShip.unit) {
      drawUnit(draggingJumpShip.unit, draggingJumpShip.mouseX, draggingJumpShip.mouseY, true, true);
    }
  }

  /* =========================================================
     HIT TESTS + TOOLTIPS
     ========================================================= */
  function findSystemAtScreen(sx, sy) {
    if (!game) return null;
    for (const sys of game.systems) {
      const p = worldToScreen(sys.x, sys.y);
      const dx = sx - p.x, dy = sy - p.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 18) return sys;
    }
    return null;
  }

  function findDrawItemAtScreen(sx, sy) {
    if (!game) return null;
    const list = [...drawItems].reverse();
    for (const item of list) {
      const dx = sx - item.x, dy = sy - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= item.r) return item;
    }
    return null;
  }

  function showTooltip(html, pageX, pageY) {
    if (!tooltip) return;
    tooltip.innerHTML = html;
    tooltip.style.left = (pageX + 12) + 'px';
    tooltip.style.top = (pageY + 12) + 'px';
    tooltip.style.display = 'block';
  }
  function hideTooltip() { if (tooltip) tooltip.style.display = 'none'; }

  canvas.addEventListener('mousemove', (e) => {
    if (!game) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (draggingJumpShip) {
      draggingJumpShip.mouseX = sx;
      draggingJumpShip.mouseY = sy;
      draw();
      return;
    }

    const hit = findDrawItemAtScreen(sx, sy);
    const u = hit ? hit.unit : null;
    const sys = u ? null : findSystemAtScreen(sx, sy);

    if (u) {
      const used = (u.type === 'JumpShip') ? cargoUsedLocal(u) : null;
      const destId = getUnitDestinationSystemId(u);
      const destLine = (u.type === 'JumpShip' && destId && destId !== u.systemId)
        ? `Destination: ${escapeHtml(displaySysId(destId))}<br>`
        : '';
      const stackCount = Math.max(1, Math.floor(Number(u._stackCount || 1)));
      const extra = (u.type !== 'JumpShip' && stackCount > 1) ? `Stack: ${stackCount} ${u.type}s<br>` : '';

      showTooltip(
        `<b>${escapeHtml(u.type)}</b> (#${escapeHtml(u.id)})<br>
         Faction: ${escapeHtml(u.faction)}<br>
         Hits: ${escapeHtml(u.hitsRemaining ?? '?')}<br>
         ${extra}
         ${destLine}
         ${u.type === 'JumpShip' ? (() => { const cap = jumpshipCapForFaction(u.faction); return `Cargo: ${escapeHtml(used)}/${escapeHtml(cap)}`; })() : '' }
         ${u.type === 'Shipyard' ? `<br>Queue entries: ${(u.buildQueue?.length ?? 0)}` : ''}`,
        e.pageX, e.pageY
      );
      return;
    }

    if (sys) {
      const ownerText = (sys.owner == null) ? 'Neutral' : sys.owner;
      const vis = canSeeSystemStats(sys.id);
      const rText = vis ? ((sys.resources == null) ? '?' : sys.resources) : '??';
      const vText = vis ? ((sys.value == null) ? '?' : sys.value) : '??';

      showTooltip(
        `<b>${escapeHtml(displaySysId(sys.id))}</b><br>
         Owner: ${escapeHtml(ownerText)}<br>
         Resources: ${escapeHtml(rText)}<br>
         Value: ${escapeHtml(vText)}<br>
         Position: (${sys.x}, ${sys.y})`,
        e.pageX, e.pageY
      );
      return;
    }

    hideTooltip();
  });

  canvas.addEventListener('mouseleave', hideTooltip);

  /* =========================================================
     SELECTION
     ========================================================= */
  function clearSelections() {
    selectedShipyard = null;
    selectedJumpShip = null;
    selectedLab = null;
    selectedUnit = null;
    selectedUnitItem = null;
    selectedCargoIndex = null;
    updateBuildPanel();
    updateCargoPanel();
    updateResearchPanel();
    draw();
  }

  canvas.addEventListener('click', (e) => {
    if (!game) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hit = findDrawItemAtScreen(sx, sy);
    const u = hit ? hit.unit : null;

    if (!u) { clearSelections(); return; }

    if (u.type === 'Shipyard') {
      selectedShipyard = (selectedShipyard && selectedShipyard.id === u.id) ? null : u;
      updateBuildPanel();
      showStatus('');
      draw();
      return;
    }
    if (u.type === 'Lab') {
      selectedLab = (selectedLab && selectedLab.id === u.id) ? null : u;
      updateResearchPanel();
      showStatus('');
      draw();
      return;
    }
    if (u.type === 'JumpShip') {
      if (selectedJumpShip && selectedJumpShip.id === u.id) {
        selectedJumpShip = null;
        selectedCargoIndex = null;
      } else {
        selectedJumpShip = u;
        selectedCargoIndex = null;
      }
      updateCargoPanel();
      showStatus('');
      draw();
      return;
    }

    // Other unit: select stack (hit.units) so load-many works
    if (selectedUnit && selectedUnit.id === u.id) {
      selectedUnit = null;
      selectedUnitItem = null;
    } else {
      selectedUnit = u;
      selectedUnitItem = hit; // includes stack list in hit.units
    }
    updateCargoPanel();
    draw();
  });

  /* =========================================================
     DRAG JumpShips to move (and pan otherwise)
     ========================================================= */
  canvas.addEventListener('mousedown', (e) => {
    if (!game) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hit = findDrawItemAtScreen(sx, sy);
    const u = hit ? hit.unit : null;

    if (u && u.type === 'JumpShip') {
      draggingJumpShip = { unit: u, mouseX: sx, mouseY: sy };
      hideTooltip();
      return;
    }

    draggingPan = true;
    panStart = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
  });

  window.addEventListener('mousemove', (e) => {
    if (!draggingPan) return;
    view.offsetX = panStart.ox + (e.clientX - panStart.x);
    view.offsetY = panStart.oy + (e.clientY - panStart.y);
    draw();
  });

  window.addEventListener('mouseup', async () => {
    if (!game) { draggingPan = false; draggingJumpShip = null; return; }

    if (draggingJumpShip) {
      const sx = draggingJumpShip.mouseX;
      const sy = draggingJumpShip.mouseY;
      const unit = draggingJumpShip.unit;

      draggingJumpShip = null;
      draw();

      const sys = findSystemAtScreen(sx, sy);
      if (sys && unit && unit.systemId !== sys.id) {
        const r = await apiMove(unit.id, sys.id).catch(() => null);
        if (r?.success) showStatus(`Queued move: JumpShip #${unit.id} -> ${displaySysId(sys.id)} (dist ${r.distance}).`);
        else showStatus(`Move failed: ${r?.error || 'network error'}`);
        await refresh(false);
      }
    }

    draggingPan = false;
  });

  /* =========================================================
     ZOOM
     ========================================================= */
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const delta = Math.sign(e.deltaY);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const before = screenToWorld(sx, sy);
    const factor = delta > 0 ? 0.9 : 1.1;
    view.scale = Math.max(30, Math.min(260, view.scale * factor));

    const after = screenToWorld(sx, sy);
    view.offsetX += (after.x - before.x) * view.scale;
    view.offsetY += (after.y - before.y) * view.scale;

    draw();
  }, { passive: false });

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => { view.scale = Math.min(260, view.scale * 1.15); draw(); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => { view.scale = Math.max(30, view.scale / 1.15); draw(); });
  if (resetViewBtn) resetViewBtn.addEventListener('click', () => { view.scale = 80; view.offsetX = 80; view.offsetY = 80; draw(); });

  /* =========================================================
     SIDEBAR ACTIONS
     ========================================================= */
  if (readyTurnBtn) {
    readyTurnBtn.addEventListener('click', async () => {
      if (!requireSessionOrOverlay()) return;
      if (game?.gameOver) { showStatus(`Game over. Winner: ${game.winner ?? 'draw'}`); showEndgameOverlay(); return; }

      const cur = !!(game?.ready && yourFaction && game.ready[yourFaction]);
      const next = !cur;
      showStatus(next ? 'Marked READY (click again to unready)...' : 'Marked NOT READY...');
      const r = await apiReadyTurn(next).catch(() => null);
      if (r?.success) {
        if (r.resolved) showStatus(`Both ready. Turn resolved. Now Turn ${r.turn}.`);
        else showStatus(next ? 'Ready set. Waiting for other player...' : 'Not ready.');
      } else {
        showStatus(`Ready failed: ${r?.error || 'network error'}`);
      }
      await refresh(false);
    });
  }

  if (resignBtn) {
    resignBtn.addEventListener('click', async () => {
      if (!requireSessionOrOverlay()) return;
      if (game?.gameOver) { showStatus(`Game over. Winner: ${game.winner ?? 'draw'}`); showEndgameOverlay(); return; }

      const cur = !!(game?.resignIntent && yourFaction && game.resignIntent[yourFaction]);
      const next = !cur;
      showStatus(next ? 'Resign ARMED (you can cancel). Use Confirm Resign to actually resign.' : 'Resign cancelled.');
      const r = await apiResignIntent(next).catch(() => null);
      if (!r?.success) showStatus(`Resign toggle failed: ${r?.error || 'network error'}`);
      await refresh(false);
    });
  }

  if (confirmResignBtn) {
    confirmResignBtn.addEventListener('click', async () => {
      if (!requireSessionOrOverlay()) return;
      if (game?.gameOver) return;
      if (!(game?.resignIntent && yourFaction && game.resignIntent[yourFaction])) {
        showStatus('Arm resign first.');
        return;
      }
      showStatus('Resigning...');
      const r = await apiResign().catch(() => null);
      if (r?.success) {
        showStatus(`You resigned. Winner: ${r.winner}`);
      } else {
        showStatus(`Resign failed: ${r?.error || 'network error'}`);
      }
      await refresh(false);
    });
  }

  if (queueBuildBtn) {
    queueBuildBtn.addEventListener('click', async () => {
      if (!selectedShipyard) { showStatus('Select a shipyard first.'); return; }

      const unitsArr = [];
      for (const [type, el] of Object.entries(buildInputs)) {
        if (!el) continue;

        const count = Math.max(0, Math.floor(Number(el?.value) || 0));
        if (count <= 0) continue;
        if (!(type in COST)) continue;
        unitsArr.push({ type, count });
      }
      if (unitsArr.length === 0) { showStatus('Nothing to queue.'); return; }

      showStatus(`Queuing for Shipyard #${selectedShipyard.id}...`);
      const r = await apiQueueBuild(selectedShipyard.id, unitsArr).catch(() => null);
      if (r?.success) {
        showStatus('Queued.');
        clearBuildInputs();
        await refresh(false);
      } else showStatus(`Queue failed: ${r?.error || 'network error'}`);
    });
  }

  if (clearBuildBtn) clearBuildBtn.addEventListener('click', () => { clearBuildInputs(); showStatus(''); });

  if (unloadAllBtn) unloadAllBtn.addEventListener('click', async () => {
    if (!selectedJumpShip) return;
    showStatus('Unloading all cargo...');
    const r = await apiUnload(selectedJumpShip.id, { all: true }).catch(() => null);
    showStatus(r?.success ? 'Unloaded all.' : `Unload failed: ${r?.error || 'network error'}`);
    selectedCargoIndex = null;
    await refresh(false);
  });

  if (unloadSelectedBtn) unloadSelectedBtn.addEventListener('click', async () => {
    if (!selectedJumpShip) return;
    const cargoArr = Array.isArray(selectedJumpShip.cargo) ? selectedJumpShip.cargo : [];
    if (selectedCargoIndex == null || selectedCargoIndex < 0 || selectedCargoIndex >= cargoArr.length) return;

    const entry = cargoArr[selectedCargoIndex];
    showStatus('Unloading selected cargo...');

    let payload;
    if (typeof entry === 'number') payload = { unitId: entry };
    else payload = { resourceIndex: selectedCargoIndex };

    const r = await apiUnload(selectedJumpShip.id, payload).catch(() => null);
    showStatus(r?.success ? 'Unloaded.' : `Unload failed: ${r?.error || 'network error'}`);
    selectedCargoIndex = null;
    await refresh(false);
  });

  // Load-many from a stack selection
  if (loadSelectedUnitBtn) loadSelectedUnitBtn.addEventListener('click', async () => {
    if (!selectedJumpShip || !selectedUnitItem || !selectedUnit) return;

    const pool = Array.isArray(selectedUnitItem.units) ? selectedUnitItem.units : [selectedUnit];
    if (pool.length === 0) return;

    const want = Math.max(1, Math.floor(Number(loadCountInput?.value) || 1));
    const n = Math.min(want, pool.length);

    showStatus(`Loading ${n}x ${selectedUnit.type} into JumpShip #${selectedJumpShip.id}...`);

    let loaded = 0;
    for (let i = 0; i < n; i++) {
      const unitToLoad = pool[i];
      const r = await apiLoadUnit(unitToLoad.id, selectedJumpShip.id).catch(() => null);
      if (!r?.success) {
        showStatus(`Loaded ${loaded}/${n}. Stopped: ${r?.error || 'network error'}`);
        await refresh(false);
        return;
      }
      loaded++;
    }

    showStatus(`Loaded ${loaded} unit(s).`);
    await refresh(false);
  });

  if (loadResourcesBtn) loadResourcesBtn.addEventListener('click', async () => {
    if (!selectedJumpShip) { showStatus('Select a JumpShip first.'); return; }
    const amt = Math.max(1, Math.floor(Number(resourceAmountInput?.value) || 1));
    showStatus(`Loading ${amt} resources into JumpShip #${selectedJumpShip.id}...`);
    const r = await apiLoadResources(selectedJumpShip.id, amt).catch(() => null);
    showStatus(r?.success ? 'Loaded resources.' : `Load resources failed: ${r?.error || 'network error'}`);
    await refresh(false);
  });

  if (convertShipBtn) convertShipBtn.addEventListener('click', async () => {
    if (!selectedJumpShip) return;
    showStatus('Converting JumpShip → Shipyard...');
    const r = await apiConvertToShipyard(selectedJumpShip.id).catch(() => null);
    showStatus(r?.success ? 'Conversion complete.' : `Conversion failed: ${r?.error || 'network error'}`);
    await refresh(false);
  });

  if (researchTechSelect && researchTargetLevel) {
    researchTechSelect.addEventListener('change', () => {
      if (!selectedLab) return;
      const t = researchTechSelect.value || 'Striker';
      const cur = techLevel(selectedLab.faction, t);
      researchTargetLevel.value = String(cur + 1);
    });
  }

  if (queueResearchBtn) queueResearchBtn.addEventListener('click', async () => {
    if (!selectedLab) { showStatus('Select a Lab first.'); return; }
    const tech = researchTechSelect?.value || 'Striker';
    const targetLevel = Math.max(1, Math.floor(Number(researchTargetLevel?.value) || 1));
    showStatus(`Queuing research ${tech} -> L${targetLevel} at ${selectedLab.systemId}...`);
    const r = await apiQueueResearch(selectedLab.id, tech, targetLevel).catch(() => null);
    showStatus(r?.success ? 'Research queued.' : `Research failed: ${r?.error || 'network error'}`);
    await refresh(false);
  });

  /* =========================================================
     RESIZE + REFRESH
     ========================================================= */
  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    draw();
  }
  window.addEventListener('resize', resize);

  function setButtonArmed(btn, armed) {
    if (!btn) return;
    btn.classList.toggle('armed', !!armed);
  }

  function updateReadyStatus() {
    if (!readyStatusEl) return;
    const rd = game?.ready || { ithaxi: false, hive: false };
    const a = rd.ithaxi ? 'READY' : 'not ready';
    const b = rd.hive ? 'READY' : 'not ready';
    readyStatusEl.textContent = `Ready: ithaxi=${a} | hive=${b}`;

    if (yourFaction) {
      setButtonArmed(readyTurnBtn, !!rd[yourFaction]);
      const ri = game?.resignIntent || { ithaxi: false, hive: false };
      setButtonArmed(resignBtn, !!ri[yourFaction]);
      if (confirmResignBtn) confirmResignBtn.style.display = ri[yourFaction] ? 'block' : 'none';
    }
  }

  async function refresh(force) {
    if (!requireSessionOrOverlay()) return;

    const r = await apiGetState().catch(() => null);
    if (!r?.success) {
      showStatus(`Could not load state: ${r?.error || 'network error'}`);
      openOverlay();
      return;
    }

    game = r;
    yourFaction = r.yourFaction;

    ensureSysNameMap();

    if (turnEl) turnEl.textContent = `Turn: ${game.turn}`;
    if (viewerEl) viewerEl.textContent = `You: ${yourFaction}`;
    if (gameInfoEl) gameInfoEl.textContent = `Game: ${session.gameId}`;
    updateReadyStatus();

    if (readyTurnBtn) readyTurnBtn.disabled = !!game?.gameOver;
    if (resignBtn) resignBtn.disabled = !!game?.gameOver;

    // Rebind selections by id
    if (selectedShipyard) selectedShipyard = game.units.find(u => u.type === 'Shipyard' && u.id === selectedShipyard.id) || null;
    if (selectedJumpShip) selectedJumpShip = game.units.find(u => u.type === 'JumpShip' && u.id === selectedJumpShip.id) || null;
    if (selectedLab) selectedLab = game.units.find(u => u.type === 'Lab' && u.id === selectedLab.id) || null;
    if (selectedUnit) selectedUnit = game.units.find(u => u.id === selectedUnit.id) || null;

    // Rebind stack selection after refresh
    if (selectedUnit) {
      const sysId = selectedUnit.systemId;
      const type = selectedUnit.type;
      const faction = selectedUnit.faction;
      const unitsHere = game.units.filter(x => x.systemId === sysId && x.type === type && x.faction === faction);
      selectedUnitItem = { unit: selectedUnit, units: unitsHere };
    } else {
      selectedUnitItem = null;
    }

    if (selectedJumpShip) {
      const arr = Array.isArray(selectedJumpShip.cargo) ? selectedJumpShip.cargo : [];
      if (selectedCargoIndex != null && (selectedCargoIndex < 0 || selectedCargoIndex >= arr.length)) selectedCargoIndex = null;
    } else selectedCargoIndex = null;

    updateBuildPanel();
    updateCargoPanel();
    updateResearchPanel();
    renderTechLevels();
    renderReport();
    draw();

    if (game?.gameOver) {
      showStatus(`GAME OVER. Winner: ${game.winner ?? 'draw'}`);
      showEndgameOverlay();
    }
  }

  // --------------------
  // Turn-resolved popup
  // --------------------
  let turnOverlay = null;
  let turnOverlayBody = null;

  function ensureTurnOverlay() {
    if (turnOverlay) return;
    turnOverlay = document.createElement('div');
    turnOverlay.style.position = 'fixed';
    turnOverlay.style.left = '0';
    turnOverlay.style.top = '0';
    turnOverlay.style.width = '100vw';
    turnOverlay.style.height = '100vh';
    turnOverlay.style.background = 'rgba(0,0,0,0.8)';
    turnOverlay.style.display = 'none';
    turnOverlay.style.zIndex = '9999';
    turnOverlay.style.alignItems = 'center';
    turnOverlay.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.width = 'min(820px, 94vw)';
    card.style.maxHeight = '86vh';
    card.style.overflow = 'auto';
    card.style.background = '#111';
    card.style.border = '1px solid #333';
    card.style.borderRadius = '12px';
    card.style.padding = '16px';
    card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';

    const title = document.createElement('div');
    title.style.fontSize = '18px';
    title.style.fontWeight = '700';
    title.style.marginBottom = '10px';
    title.textContent = 'Turn Resolved';

    turnOverlayBody = document.createElement('div');
    turnOverlayBody.style.fontSize = '13px';
    turnOverlayBody.style.lineHeight = '1.45';
    turnOverlayBody.style.color = '#ddd';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '12px';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => { turnOverlay.style.display = 'none'; };

    btnRow.appendChild(closeBtn);

    card.appendChild(title);
    card.appendChild(turnOverlayBody);
    card.appendChild(btnRow);

    turnOverlay.appendChild(card);
    document.body.appendChild(turnOverlay);
  }

  function showTurnResolvedPopup(turnNumber) {
    ensureTurnOverlay();
    const lines = Array.isArray(game?.lastTurnLog) ? game.lastTurnLog : [];
    const safe = lines.map(x => `<div class="reportLine">${escapeHtml(String(x ?? ''))}</div>`).join('');
    turnOverlayBody.innerHTML = `<div style="margin-bottom:8px"><b>New turn:</b> ${escapeHtml(turnNumber)}</div>` +
      (safe ? `<div style="border-top:1px solid #333; padding-top:8px">${safe}</div>` : `<div class="muted">(no visible events)</div>`);
    turnOverlay.style.display = 'flex';
  }

  // Poll status so you see when the other player readies and the turn resolves
  let lastSeenTurn = null;
  async function poll() {
    if (!session.gameId || !session.code) return;
    const st = await apiTurnStatus().catch(() => null);
    if (!st?.success) return;

    if (lastSeenTurn == null) lastSeenTurn = st.turn;

    if (game && st.ready) game.ready = st.ready;
    if (game && st.resignIntent) game.resignIntent = st.resignIntent;
    updateReadyStatus();

    if (st.turn !== lastSeenTurn) {
      lastSeenTurn = st.turn;
      await refresh(false);
      showTurnResolvedPopup(st.turn);
    }
  }

  function init() {
    resize();

    tryAutoJoinFromUrlOrStorage().then(async (joined) => {
      if (joined) await refresh(true);
    });

    setInterval(() => { poll().catch(() => { }); }, 1500);
  }

  init();
})();

