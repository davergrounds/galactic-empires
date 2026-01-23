// public/game.js
(() => {
  'use strict';

  /* ============================
     BASIC DOM / SAFETY
     ============================ */

  const canvas = document.getElementById('map');
  const ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!canvas || !ctx) {
    console.error('Canvas not available');
    return;
  }

  const $ = id => document.getElementById(id);

  const tooltip = $('tooltip');
  const turnEl = $('turn');
  const viewerEl = $('viewer');
  const readyStatusEl = $('readyStatus');
  const gameInfoEl = $('gameInfo');
  const statusEl = $('status');

  const readyTurnBtn = $('readyTurnBtn');
  const resignBtn = $('resignBtn');
  const confirmResignBtn = $('confirmResignBtn');
  const openSetupBtn = $('openSetupBtn');

  const zoomInBtn = $('zoomInBtn');
  const zoomOutBtn = $('zoomOutBtn');
  const resetViewBtn = $('resetViewBtn');

  /* ============================
     CONSTANTS
     ============================ */

  const COST = {
    JumpShip: 10,
    Striker: 2,
    Escort: 1,
    Blocker: 1,
    Mine: 1,
    Lab: 3,
    Shipyard: 10
  };

  const TECH_TYPES = ['Striker','Escort','Blocker','Mine','Shipyard','JumpShip','Lab'];

  const FACTION_COLOR = {
    ithaxi: '#ff8a2a',
    hive: '#35d04a',
    neutral: '#888'
  };

  /* ============================
     VIEW STATE
     ============================ */

  let view = { scale: 80, offsetX: 80, offsetY: 80 };
  let dragging = false;
  let dragStart = { x:0, y:0, ox:0, oy:0 };

  function worldToScreen(x, y) {
    return {
      x: view.offsetX + x * view.scale,
      y: view.offsetY + y * view.scale
    };
  }

  function screenToWorld(x, y) {
    return {
      x: (x - view.offsetX) / view.scale,
      y: (y - view.offsetY) / view.scale
    };
  }

  /* ============================
     SESSION
     ============================ */

  const LS_KEY = 'GE_SESSION';
  let session = { gameId:null, code:null };

  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) session = JSON.parse(raw);
    } catch {}
  }

  function saveSession() {
    localStorage.setItem(LS_KEY, JSON.stringify(session));
  }

  function clearSession() {
    session = { gameId:null, code:null };
    localStorage.removeItem(LS_KEY);
  }

  function setUrl(gameId, code) {
    const p = new URLSearchParams();
    p.set('game', gameId);
    p.set('code', code);
    history.replaceState({}, '', '/?' + p.toString());
  }

  function clearUrl() {
    history.replaceState({}, '', '/');
  }

  /* ============================
     GAME STATE
     ============================ */

  let game = null;
  let yourFaction = null;

  function getSystem(id) {
    return game?.systems?.find(s => s.id === id) || null;
  }

  function techLevel(faction, tech) {
    return game?.techLevels?.[faction]?.[tech] || 0;
  }

  function jumpshipCap(faction) {
    return Math.floor(8 * (1 + 0.2 * techLevel(faction, 'JumpShip')));
  }

  function shipyardCap(faction) {
    return Math.floor(10 * (1 + 0.2 * techLevel(faction, 'Shipyard')));
  }

  /* ============================
     API
     ============================ */

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ ...body, gameId: session.gameId, code: session.code })
    });
    return res.json();
  }

  async function apiGetState() {
    const res = await fetch(
      `/games/${encodeURIComponent(session.gameId)}/state?code=${encodeURIComponent(session.code)}`
    );
    return res.json();
  }

  /* ============================
     DRAW MAP
     ============================ */

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!game) return;

    for (const sys of game.systems) {
      const p = worldToScreen(sys.x, sys.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = FACTION_COLOR[sys.owner || 'neutral'];
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }

  /* ============================
     REFRESH
     ============================ */

  async function refresh(initial=false) {
    if (!session.gameId || !session.code) return;

    const state = await apiGetState();
    if (!state.success) {
      statusEl.textContent = state.error || 'Error loading game';
      return;
    }

    game = state;
    yourFaction = state.yourFaction;

    turnEl.textContent = `Turn: ${state.turn}`;
    viewerEl.textContent = `You: ${yourFaction}`;
    gameInfoEl.textContent = `Game: ${session.gameId}`;
    readyStatusEl.textContent =
      `Ready: ithaxi=${state.ready.ithaxi} hive=${state.ready.hive}`;

    if (state.gameOver) showEndgameOverlay();
    draw();
  }

  /* ============================
     ENDGAME OVERLAY
     ============================ */

  let endOverlay = null;

  function showEndgameOverlay() {
    if (endOverlay) return;

    endOverlay = document.createElement('div');
    endOverlay.style.position = 'fixed';
    endOverlay.style.inset = '0';
    endOverlay.style.background = 'rgba(0,0,0,0.9)';
    endOverlay.style.zIndex = '9999';
    endOverlay.style.display = 'flex';
    endOverlay.style.alignItems = 'center';
    endOverlay.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.background = '#111';
    card.style.padding = '20px';
    card.style.border = '1px solid #333';
    card.style.borderRadius = '12px';
    card.style.width = '720px';
    card.style.maxHeight = '85vh';
    card.style.overflow = 'auto';

    const winner =
      game.winner ? `Winner: ${game.winner}` : 'Draw';

    card.innerHTML = `
      <h2>Game Over</h2>
      <div>${winner}</div>
      <pre style="margin-top:10px;font-size:12px">
Resources produced:
  Ithaxi: ${game.stats.produced.ithaxi}
  Hive:   ${game.stats.produced.hive}
      </pre>
    `;

    const close = document.createElement('button');
    close.textContent = 'Back to Setup';
    close.onclick = () => {
      endOverlay.remove();
      endOverlay = null;
      clearSession();
      clearUrl();
      game = null;
      openSetup();
      draw();
    };

    card.appendChild(close);
    endOverlay.appendChild(card);
    document.body.appendChild(endOverlay);
  }

  /* ============================
     SETUP OVERLAY
     ============================ */

  const setupOverlay = $('setupOverlay');

  function openSetup() {
    setupOverlay.style.display = 'flex';
  }

  function closeSetup() {
    setupOverlay.style.display = 'none';
  }

  /* ============================
     INIT
     ============================ */

  loadSession();

  (async () => {
    const p = new URLSearchParams(location.search);
    const g = p.get('game');
    const c = p.get('code');
    if (g && c) {
      session.gameId = g;
      session.code = c;
      saveSession();
      closeSetup();
      await refresh(true);
    } else if (session.gameId && session.code) {
      setUrl(session.gameId, session.code);
      closeSetup();
      await refresh(true);
    } else {
      openSetup();
    }
  })();

})();
