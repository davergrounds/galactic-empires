// public/game.js
(() => {
  const canvas = document.getElementById('map');
  const ctx = canvas?.getContext?.('2d');

  const tooltip = document.getElementById('tooltip');
  const turnEl = document.getElementById('turn');
  const viewerEl = document.getElementById('viewer');
  const readyStatusEl = document.getElementById('readyStatus');
  const gameInfoEl = document.getElementById('gameInfo');
  const statusEl = document.getElementById('status');

  const readyTurnBtn = document.getElementById('readyTurnBtn');
  const resignBtn = document.getElementById('resignBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const resetViewBtn = document.getElementById('resetViewBtn');

  const confirmResignBtn = document.getElementById('confirmResignBtn');
  const openSetupBtn = document.getElementById('openSetupBtn');

  // Setup overlay
  const setupOverlay = document.getElementById('setupOverlay');
  const setupOpenAs = document.getElementById('setupOpenAs');
  const setupCreateBtn = document.getElementById('setupCreateBtn');
  const setupCloseBtn = document.getElementById('setupCloseBtn');
  const createdLinksEl = document.getElementById('createdLinks');

  const joinGameIdEl = document.getElementById('joinGameId');
  const joinCodeEl = document.getElementById('joinCode');
  const joinBtn = document.getElementById('joinBtn');

  const setupMapW = document.getElementById('setupMapW');
  const setupMapH = document.getElementById('setupMapH');
  const setupNeutralCount = document.getElementById('setupNeutralCount');
  const setupHomeSysRes = document.getElementById('setupHomeSysRes');
  const setupPlayerRes = document.getElementById('setupPlayerRes');

  const setupUJumpShip = document.getElementById('setupUJumpShip');
  const setupUShipyard = document.getElementById('setupUShipyard');
  const setupUMine = document.getElementById('setupUMine');
  const setupULab = document.getElementById('setupULab');
  const setupUStriker = document.getElementById('setupUStriker');
  const setupUEscort = document.getElementById('setupUEscort');
  const setupUBlocker = document.getElementById('setupUBlocker');

  // Build UI
  const buildHint = document.getElementById('buildHint');
  const selectedShipyardEl = document.getElementById('selectedShipyard');
  const buildPanel = document.getElementById('buildPanel');
  const queueBuildBtn = document.getElementById('queueBuildBtn');
  const clearBuildBtn = document.getElementById('clearBuildBtn');
  const buildInputs = {
    Striker: document.getElementById('bStriker'),
    Escort: document.getElementById('bEscort'),
    Blocker: document.getElementById('bBlocker'),
    Mine: document.getElementById('bMine'),
    Lab: document.getElementById('bLab'),
    JumpShip: document.getElementById('bJumpShip'),
    // NEW
    Shipyard: document.getElementById('bShipyard'),
  };

  // Cargo UI
  const cargoHint = document.getElementById('cargoHint');
  const selectedJumpShipEl = document.getElementById('selectedJumpShip');
  const cargoPanel = document.getElementById('cargoPanel');
  const cargoSummaryEl = document.getElementById('cargoSummary');
  const cargoListEl = document.getElementById('cargoList');
  const unloadSelectedBtn = document.getElementById('unloadSelectedBtn');
  const unloadAllBtn = document.getElementById('unloadAllBtn');
  const loadSelectedUnitBtn = document.getElementById('loadSelectedUnitBtn');
  const selectedUnitLine = document.getElementById('selectedUnitLine');
  const resourceAmountInput = document.getElementById('resourceAmount');
  const loadResourcesBtn = document.getElementById('loadResourcesBtn');
  const convertShipBtn = document.getElementById('convertShipBtn');

  // load-many control (optional input)
  const loadCountInput = document.getElementById('loadCount');

  // Research UI
  const researchHint = document.getElementById('researchHint');
  const selectedLabEl = document.getElementById('selectedLab');
  const researchPanel = document.getElementById('researchPanel');
  const techLevelsEl = document.getElementById('techLevels');
  const researchTechSelect = document.getElementById('researchTech');
  const researchTargetLevel = document.getElementById('researchTargetLevel');
  const queueResearchBtn = document.getElementById('queueResearchBtn');

  // Report
  const reportEl = document.getElementById('report');

  if (!canvas || !ctx) {
  console.error('Canvas not ready');
  return;
}


  const COST = { JumpShip:10, Striker:2, Escort:1, Blocker:1, Mine:1, Lab:3, Shipyard:10 };
  const TECH_TYPES = ['Striker','Escort','Blocker','Mine','Shipyard','JumpShip','Lab'];

  const FACTION_COLOR = {
    hive: '#35d04a',
    ithaxi: '#ff8a2a',
    neutral: '#888'
  };

  const LS_KEY = 'GE_SESSION'; // stores {gameId, code}
  let session = { gameId:null, code:null };

  function loadSessionFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') session = { gameId: obj.gameId || null, code: obj.code || null };
    } catch {}
  }
  function saveSessionToStorage() {
    localStorage.setItem(LS_KEY, JSON.stringify({ gameId: session.gameId, code: session.code }));
  }
  function clearSession() {
    session = { gameId:null, code:null };
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

  function showStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

  let view = { scale: 80, offsetX: 80, offsetY: 80 };
  let draggingPan = false;
  let panStart = { x:0, y:0, ox:0, oy:0 };

  let game = null;
  let yourFaction = null;

  let selectedShipyard = null;
  let selectedJumpShip = null;
  let selectedLab = null;
  let selectedUnit = null;

  // stack selection info
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

  // NEW: compute caps client-side so UI always knows
  function jumpshipCapForFaction(faction) {
    const lvl = techLevel(faction, 'JumpShip');
    return Math.floor(8 * (1 + 0.2 * lvl));
  }
  function shipyardSpendCapForFaction(faction) {
    const lvl = techLevel(faction, 'Shipyard');
    return Math.floor(10 * (1 + 0.2 * lvl));
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  // --------------------
  // Endgame Overlay (created dynamically)
  // --------------------
  let endOverlay = null;
  let endOverlayInner = null;

  function ensureEndOverlay() {
    if (endOverlay) return;
    endOverlay = document.createElement('div');
    endOverlay.style.position = 'fixed';
    endOverlay.style.left = '0';
    endOverlay.style.top = '0';
    endOverlay.style.width = '100vw';
    endOverlay.style.height = '100vh';
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
      // mimic "openSetupBtn" behaviour
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
    const order = ['JumpShip','Shipyard','Striker','Escort','Blocker','Mine','Lab'];
    const rows = order.map(t => `<tr><td>${escapeHtml(t)}</td><td style="text-align:right">${escapeHtml(obj?.[t] ?? 0)}</td></tr>`).join('');
    return `
      <div style="margin-top:10px">
        <div style="font-weight:700; margin:6px 0">${escapeHtml(title)}</div>
        <table style="width:100%; border-collapse:collapse">
          <tbody>
            ${rows}
          </tbody>
        </table>
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

    const winnerLine = winner === 'draw'
      ? `<div><b>Result:</b> Draw</div>`
      : `<div><b>Winner:</b> ${escapeHtml(winner)}</div>`;

    const producedLine = `
      <div style="margin-top:8px">
        <b>Total resources produced (mining):</b><br>
        ithaxi: ${escapeHtml(prod.ithaxi ?? 0)}<br>
        hive: ${escapeHtml(prod.hive ?? 0)}
      </div>
    `;

    const builtI = fmtTypeTable('Units built by Ithaxi', built.ithaxi);
    const builtH = fmtTypeTable('Units built by Hive', built.hive);

    const dI = fmtTypeTable('Units destroyed by Ithaxi', destroyedBy.ithaxi);
    const dH = fmtTypeTable('Units destroyed by Hive', destroyedBy.hive);

    endOverlayInner.innerHTML = `
      ${winnerLine}
      ${producedLine}
      ${builtI}
      ${builtH}
      ${dI}
      ${dH}
      <div class="muted" style="margin-top:10px; color:#aaa">
        Notes: “resources produced” is tracked from mining output credited to the system owner (per current rules).
      </div>
    `;
    endOverlay.style.display = 'flex';
  }

  // --------------------
  // Shipyard queue UI (created dynamically inside buildPanel)
  // --------------------
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

  // --------------------
  // API
  // --------------------
  async function apiCreateGame(cfg) {
    const res = await fetch('/games', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
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
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  async function apiResignIntent(setValue) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/resignIntent`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, set: !!setValue })
    });
    return await res.json();
  }

  async function apiResign() {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/resign`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code })
    });
    return await res.json();
  }

  async function apiMove(unitId, toSystemId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/move`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, unitId, toSystemId })
    });
    return await res.json();
  }

  async function apiQueueBuild(shipyardId, units) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/produce`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, shipyardId, units })
    });
    return await res.json();
  }

  async function apiShipyardQueueClear(shipyardId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/shipyardQueue/clear`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, shipyardId })
    });
    return await res.json();
  }

  async function apiShipyardQueueRemove(shipyardId, index) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/shipyardQueue/remove`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, shipyardId, index })
    });
    return await res.json();
  }

  async function apiLoadUnit(unitId, jumpShipId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/load`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, unitId, jumpShipId })
    });
    return await res.json();
  }

  async function apiUnload(jumpShipId, payload) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/unload`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, jumpShipId, ...payload })
    });
    return await res.json();
  }

  async function apiLoadResources(jumpShipId, amount) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/loadResources`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, jumpShipId, amount })
    });
    return await res.json();
  }

  async function apiQueueResearch(labId, tech, targetLevel) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/research`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, labId, tech, targetLevel })
    });
    return await res.json();
  }

  async function apiConvertToShipyard(jumpShipId) {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/order/convertToShipyard`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code, jumpShipId })
    });
    return await res.json();
  }

  // --------------------
  // Setup logic
  // --------------------
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

    const urlHas = q.gameId && q.code;
    if (urlHas) {
      session.gameId = q.gameId;
      session.code = q.code;
      saveSessionToStorage();
      closeOverlay();
      return true;
    }

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
      const r = await apiCreateGame(cfg);

      if (!r?.success) {
        showStatus(`Create failed: ${r?.error || 'unknown error'}`);
        return;
      }

      renderCreatedLinks(r, openAs);

      const chosenCode = (openAs === 'hive') ? r.join.hive.code : r.join.ithaxi.code;
      session.gameId = r.gameId;
      session.code = chosenCode;
      saveSessionToStorage();
      setUrl(session.gameId, session.code);

      showStatus('Game created. Copy the links/codes above. Close this panel when ready.');
      await refresh(true);
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

  // --------------------
  // Panels
  // --------------------
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
    const sysRes = (sys && sys.resources != null) ? sys.resources : '?';

    const cap = shipyardSpendCapForFaction(selectedShipyard.faction);

    buildHint.textContent = 'Shipyard selected. Queue applies ONLY to this shipyard.';
    selectedShipyardEl.textContent =
      `Selected Shipyard: #${selectedShipyard.id} (${selectedShipyard.faction}) @ ${selectedShipyard.systemId} | ` +
      `System R:${sysRes} | Spend cap: ${cap} | Queue entries: ${qEntries}`;

    // Render queue list with remove buttons
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

