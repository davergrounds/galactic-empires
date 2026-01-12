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

  if (!canvas || !ctx) return;

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

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
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

  async function apiReadyTurn() {
    const { gameId, code } = session;
    const res = await fetch(`/games/${encodeURIComponent(gameId)}/turn/ready`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gameId, code })
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

  // --------------------
  // Panels
  // --------------------
  function updateBuildPanel() {
    if (!buildHint || !selectedShipyardEl) return;

    if (!selectedShipyard) {
      buildHint.textContent = 'Click a Shipyard to build units.';
      selectedShipyardEl.textContent = '';
      setBuildEnabled(false);
      return;
    }

    const queue = selectedShipyard.buildQueue || [];
    const qEntries = Array.isArray(queue) ? queue.length : 0;

    const sys = selectedShipyard.systemId ? getSystem(selectedShipyard.systemId) : null;
    const sysRes = (sys && sys.resources != null) ? sys.resources : '?';

    const lvl = techLevel(selectedShipyard.faction, 'Shipyard');
    const cap = Math.floor(10 * (1 + 0.2 * lvl));

    buildHint.textContent = 'Shipyard selected. Queue applies ONLY to this shipyard.';
    selectedShipyardEl.textContent =
      `Selected Shipyard: #${selectedShipyard.id} (${selectedShipyard.faction}) @ ${selectedShipyard.systemId} | ` +
      `System R:${sysRes} | Spend cap: ${cap} | Queue entries: ${qEntries}`;

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
    const sysRes = (sys && sys.resources != null) ? sys.resources : '?';

    const lvl = techLevel(selectedJumpShip.faction, 'JumpShip');
    const cap = Math.floor(8 * (1 + 0.2 * lvl));

    cargoHint.textContent = 'JumpShip selected.';
    selectedJumpShipEl.textContent = `Selected JumpShip: #${selectedJumpShip.id} (${selectedJumpShip.faction}) @ ${selectedJumpShip.systemId || '—'}`;
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
          div.innerHTML = `<span>${humanCargoEntry(entry)}</span><span class="muted">#${idx}</span>`;
          div.addEventListener('click', () => { selectedCargoIndex = idx; updateCargoPanel(); });
          cargoListEl.appendChild(div);
        });
      }
    }

    if (unloadAllBtn) unloadAllBtn.disabled = cargoArr.length === 0;
    if (unloadSelectedBtn) unloadSelectedBtn.disabled = !(cargoArr.length > 0 && selectedCargoIndex != null && selectedCargoIndex >= 0 && selectedCargoIndex < cargoArr.length);

    const canLoadUnit =
      selectedUnit &&
      selectedUnit.systemId &&
      selectedJumpShip.systemId &&
      selectedUnit.systemId === selectedJumpShip.systemId &&
      selectedUnit.faction === selectedJumpShip.faction &&
      selectedUnit.type !== 'JumpShip';

    if (loadSelectedUnitBtn) loadSelectedUnitBtn.disabled = !canLoadUnit;

    if (selectedUnitLine) {
      selectedUnitLine.textContent = selectedUnit
        ? `Selected unit: ${selectedUnit.type} #${selectedUnit.id} @ ${selectedUnit.systemId || '—'} (${selectedUnit.faction})`
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
    const sysRes = (sys && sys.resources != null) ? sys.resources : '?';

    researchHint.textContent = 'Lab selected. Research order applies to ALL labs of your faction in this system.';
    selectedLabEl.textContent =
      `Selected Lab: #${selectedLab.id} (${selectedLab.faction}) @ ${selectedLab.systemId} | ` +
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

  // --------------------
  // Drawing / grid
  // --------------------
  function drawGrid() {
    const scale = view.scale;
    if (scale < 25) return;

    const w = canvas.width, h = canvas.height;
    const topLeft = screenToWorld(0,0);
    const botRight = screenToWorld(w,h);

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
      list.sort((a,b)=>a.id-b.id);
      stacks.push({ kind:'stack', unit:list[0], units:list, sysId: sys.id, stackKey: key });
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
    jumpships.slice().sort((a,b) => (a.faction||'').localeCompare(b.faction||'') || a.id-b.id)
      .forEach(u => items.push({ kind:'unit', unit:u, units:[u], sysId: sys.id, stackKey: null }));

    stacks.slice().sort((a,b) => {
      const ra = typeRank(a.unit.type), rb = typeRank(b.unit.type);
      if (ra !== rb) return ra - rb;
      if ((a.unit.faction||'') !== (b.unit.faction||'')) return (a.unit.faction||'').localeCompare(b.unit.faction||'');
      return a.unit.id - b.unit.id;
    }).forEach(s => items.push(s));

    return items;
  }

  function drawUnit(u, x, y, isGhost=false, highlight=false) {
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
        ctx.beginPath(); ctx.arc(x + size - 3, y - size + 3, 3, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (u.type === 'Shipyard') {
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Striker') {
      drawTriangle(x, y, size); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Escort') {
      drawSquare(x, y, size); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Blocker') {
      drawPolygon(x, y, size, 6); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Mine') {
      drawPolygon(x, y, size, 8); ctx.fill(); ctx.stroke();
    } else if (u.type === 'Lab') {
      ctx.beginPath(); ctx.arc(x, y, size - 2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }

    ctx.restore();
  }

  function drawSquare(x, y, s) { ctx.beginPath(); ctx.rect(x - s, y - s, s*2, s*2); }
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
    for (let i=0;i<sides;i++) {
      const a = (i / sides) * Math.PI*2 - Math.PI/2;
      const px = x + Math.cos(a)*r;
      const py = y + Math.sin(a)*r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = 'black';
    ctx.fillRect(0,0,canvas.width,canvas.height);

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

      const owner = sys.owner || 'neutral';
      ctx.fillStyle = FACTION_COLOR[owner] || FACTION_COLOR.neutral;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(sys.id, p.x + 22, p.y - 10);

      const rText = (sys.resources == null) ? 'R:?' : `R:${sys.resources}`;
      const vText = (sys.value == null) ? 'V:?' : `V:${sys.value}`;

      ctx.fillStyle = '#ccc';
      ctx.font = '11px Arial';
      ctx.fillText(`${rText} ${vText}`, p.x + 22, p.y + 6);
    }

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

  // --------------------
  // Hit tests + tooltips
  // --------------------
  function findSystemAtScreen(sx, sy) {
    if (!game) return null;
    for (const sys of game.systems) {
      const p = worldToScreen(sys.x, sys.y);
      const dx = sx - p.x, dy = sy - p.y;
      if (Math.sqrt(dx*dx + dy*dy) <= 18) return sys;
    }
    return null;
  }

  function findUnitAtScreen(sx, sy) {
    if (!game) return null;
    const list = [...drawItems].reverse();
    for (const item of list) {
      const dx = sx - item.x, dy = sy - item.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist <= item.r) return item.unit;
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

    const u = findUnitAtScreen(sx, sy);
    const sys = u ? null : findSystemAtScreen(sx, sy);

    if (u) {
      const used = (u.type === 'JumpShip') ? cargoUsedLocal(u) : null;
      const stackCount = Math.max(1, Math.floor(Number(u._stackCount || 1)));
      const extra = (u.type !== 'JumpShip' && stackCount > 1) ? `Stack: ${stackCount} ${u.type}s<br>` : '';

      showTooltip(
        `<b>${escapeHtml(u.type)}</b> (#${escapeHtml(u.id)})<br>
         Faction: ${escapeHtml(u.faction)}<br>
         Hits: ${escapeHtml(u.hitsRemaining ?? '?')}<br>
         ${extra}
         ${u.type === 'JumpShip' ? `Cargo: ${escapeHtml(used)}/?` : '' }
         ${u.type === 'Shipyard' ? `<br>Queue entries: ${(u.buildQueue?.length ?? 0)}` : ''}`,
        e.pageX, e.pageY
      );
      return;
    }

    if (sys) {
      const rText = (sys.resources == null) ? '?' : sys.resources;
      const vText = (sys.value == null) ? '?' : sys.value;
      const ownerText = (sys.owner == null) ? 'Neutral' : sys.owner;

      showTooltip(
        `<b>${escapeHtml(sys.id)}</b><br>
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

  // --------------------
  // Selection
  // --------------------
  function clearSelections() {
    selectedShipyard = null;
    selectedJumpShip = null;
    selectedLab = null;
    selectedUnit = null;
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

    const u = findUnitAtScreen(sx, sy);

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

    selectedUnit = (selectedUnit && selectedUnit.id === u.id) ? null : u;
    updateCargoPanel();
    draw();
  });

  // --------------------
  // Drag JumpShips to move
  // --------------------
  canvas.addEventListener('mousedown', (e) => {
    if (!game) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const u = findUnitAtScreen(sx, sy);
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
        if (r?.success) showStatus(`Queued move: JumpShip #${unit.id} -> ${sys.id} (dist ${r.distance}).`);
        else showStatus(`Move failed: ${r?.error || 'network error'}`);

        await refresh(false);
      }
    }

    draggingPan = false;
  });

  // --------------------
  // Zoom
  // --------------------
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
  }, { passive:false });

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => { view.scale = Math.min(260, view.scale * 1.15); draw(); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => { view.scale = Math.max(30, view.scale / 1.15); draw(); });
  if (resetViewBtn) resetViewBtn.addEventListener('click', () => { view.scale = 80; view.offsetX = 80; view.offsetY = 80; draw(); });

  // --------------------
  // Sidebar actions
  // --------------------
  if (readyTurnBtn) {
    readyTurnBtn.addEventListener('click', async () => {
      if (!requireSessionOrOverlay()) return;
      if (game?.gameOver) { showStatus(`Game over. Winner: ${game.winner ?? 'draw'}`); return; }

      showStatus('Marked ready...');
      const r = await apiReadyTurn().catch(()=>null);
      if (r?.success) {
        if (r.resolved) showStatus(`Both ready. Turn resolved. Now Turn ${r.turn}.`);
        else showStatus(`Ready set. Waiting for other player...`);
      } else {
        showStatus(`Ready failed: ${r?.error || 'network error'}`);
      }
      await refresh(false);
    });
  }

  if (resignBtn) {
    resignBtn.addEventListener('click', async () => {
      if (!requireSessionOrOverlay()) return;
      showStatus('Resigning...');
      const r = await apiResign().catch(()=>null);
      if (r?.success) showStatus(`You resigned. Winner: ${r.winner}`);
      else showStatus(`Resign failed: ${r?.error || 'network error'}`);
      await refresh(false);
    });
  }

  if (queueBuildBtn) {
    queueBuildBtn.addEventListener('click', async () => {
      if (!selectedShipyard) { showStatus('Select a shipyard first.'); return; }

      const unitsArr = [];
      for (const [type, el] of Object.entries(buildInputs)) {
        const count = Math.max(0, Math.floor(Number(el?.value) || 0));
        if (count <= 0) continue;
        if (!(type in COST)) continue;
        unitsArr.push({ type, count });
      }
      if (unitsArr.length === 0) { showStatus('Nothing to queue.'); return; }

      showStatus(`Queuing for Shipyard #${selectedShipyard.id}...`);
      const r = await apiQueueBuild(selectedShipyard.id, unitsArr).catch(()=>null);
      if (r?.success) {
        showStatus(`Queued.`);
        clearBuildInputs();
        await refresh(false);
      } else showStatus(`Queue failed: ${r?.error || 'network error'}`);
    });
  }

  if (clearBuildBtn) clearBuildBtn.addEventListener('click', () => { clearBuildInputs(); showStatus(''); });

  if (unloadAllBtn) unloadAllBtn.addEventListener('click', async () => {
    if (!selectedJumpShip) return;
    showStatus('Unloading all cargo...');
    const r = await apiUnload(selectedJumpShip.id, { all:true }).catch(()=>null);
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

    const r = await apiUnload(selectedJumpShip.id, payload).catch(()=>null);
    showStatus(r?.success ? 'Unloaded.' : `Unload failed: ${r?.error || 'network error'}`);
    selectedCargoIndex = null;
    await refresh(false);
  });

  if (loadSelectedUnitBtn) loadSelectedUnitBtn.addEventListener('click', async () => {
    if (!selectedJumpShip || !selectedUnit) return;
    showStatus(`Loading unit #${selectedUnit.id} into JumpShip #${selectedJumpShip.id}...`);
    const r = await apiLoadUnit(selectedUnit.id, selectedJumpShip.id).catch(()=>null);
    showStatus(r?.success ? 'Loaded unit.' : `Load failed: ${r?.error || 'network error'}`);
    await refresh(false);
  });

  if (loadResourcesBtn) loadResourcesBtn.addEventListener('click', async () => {
    if (!selectedJumpShip) { showStatus('Select a JumpShip first.'); return; }
    const amt = Math.max(1, Math.floor(Number(resourceAmountInput?.value) || 1));
    showStatus(`Loading ${amt} resources into JumpShip #${selectedJumpShip.id}...`);
    const r = await apiLoadResources(selectedJumpShip.id, amt).catch(()=>null);
    showStatus(r?.success ? 'Loaded resources.' : `Load resources failed: ${r?.error || 'network error'}`);
    await refresh(false);
  });

  if (convertShipBtn) convertShipBtn.addEventListener('click', async () => {
    if (!selectedJumpShip) return;
    showStatus('Converting JumpShip → Shipyard...');
    const r = await apiConvertToShipyard(selectedJumpShip.id).catch(()=>null);
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
    const r = await apiQueueResearch(selectedLab.id, tech, targetLevel).catch(()=>null);
    showStatus(r?.success ? 'Research queued.' : `Research failed: ${r?.error || 'network error'}`);
    await refresh(false);
  });

  // --------------------
  // Resize + refresh
  // --------------------
  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    draw();
  }
  window.addEventListener('resize', resize);

  function updateReadyStatus() {
    if (!readyStatusEl || !game?.ready) return;
    const a = game.ready.ithaxi ? 'READY' : 'not ready';
    const b = game.ready.hive ? 'READY' : 'not ready';
    readyStatusEl.textContent = `Ready: ithaxi=${a} | hive=${b}`;
  }

  async function refresh(force) {
    if (!requireSessionOrOverlay()) return;

    const r = await apiGetState().catch(()=>null);
    if (!r?.success) {
      showStatus(`Could not load state: ${r?.error || 'network error'}`);
      openOverlay();
      return;
    }

    game = r;
    yourFaction = r.yourFaction;

    if (turnEl) turnEl.textContent = `Turn: ${game.turn}`;
    if (viewerEl) viewerEl.textContent = `You: ${yourFaction}`;
    if (gameInfoEl) gameInfoEl.textContent = `Game: ${session.gameId}`;
    updateReadyStatus();

    if (readyTurnBtn) readyTurnBtn.disabled = !!game?.gameOver;
    if (resignBtn) resignBtn.disabled = !!game?.gameOver;

    // rebind selections by id
    if (selectedShipyard) selectedShipyard = game.units.find(u => u.type === 'Shipyard' && u.id === selectedShipyard.id) || null;
    if (selectedJumpShip) selectedJumpShip = game.units.find(u => u.type === 'JumpShip' && u.id === selectedJumpShip.id) || null;
    if (selectedLab) selectedLab = game.units.find(u => u.type === 'Lab' && u.id === selectedLab.id) || null;
    if (selectedUnit) selectedUnit = game.units.find(u => u.id === selectedUnit.id) || null;

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

    if (game?.gameOver) showStatus(`GAME OVER. Winner: ${game.winner ?? 'draw'}`);
  }

  // Poll status so you see when the other player readies and the turn resolves
  let lastSeenTurn = null;
  async function poll() {
    if (!session.gameId || !session.code) return;
    const st = await apiTurnStatus().catch(()=>null);
    if (!st?.success) return;

    if (lastSeenTurn == null) lastSeenTurn = st.turn;

    if (game && st.ready) game.ready = st.ready;
    updateReadyStatus();

    if (st.turn !== lastSeenTurn) {
      lastSeenTurn = st.turn;
      await refresh(false);
    }
  }

  function init() {
    resize();

    tryAutoJoinFromUrlOrStorage().then(async (joined) => {
      if (joined) await refresh(true);
    });

    setInterval(() => { poll().catch(()=>{}); }, 1500);
  }

  init();
})();
