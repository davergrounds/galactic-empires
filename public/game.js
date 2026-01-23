/* ===== Galactic Empires – game.js (repaired) ===== */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const canvas = $('map');
  const ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!canvas || !ctx) return;

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

  const buildHint = $('buildHint');
  const selectedShipyardEl = $('selectedShipyard');
  const buildPanel = $('buildPanel');
  const queueBuildBtn = $('queueBuildBtn');
  const clearBuildBtn = $('clearBuildBtn');

  const cargoHint = $('cargoHint');
  const selectedJumpShipEl = $('selectedJumpShip');
  const cargoPanel = $('cargoPanel');

  const researchHint = $('researchHint');
  const selectedLabEl = $('selectedLab');
  const researchPanel = $('researchPanel');
  const techLevelsEl = $('techLevels');

  const reportEl = $('report');

  const COST = { JumpShip:10, Striker:2, Escort:1, Blocker:1, Mine:1, Lab:3, Shipyard:10 };
  const TECH_TYPES = ['Striker','Escort','Blocker','Mine','Shipyard','JumpShip','Lab'];

  const FACTION_COLOR = {
    ithaxi:'#ff8a2a',
    hive:'#35d04a',
    neutral:'#888'
  };

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
    history.replaceState({}, '', `/?${p.toString()}`);
  }

  function clearUrl() {
    history.replaceState({}, '', '/');
  }

  function showStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  let view = { scale:80, offsetX:80, offsetY:80 };
  let game = null;
  let yourFaction = null;

  function worldToScreen(x,y) {
    return { x:view.offsetX + x*view.scale, y:view.offsetY + y*view.scale };
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!game) return;

    for (const s of game.systems || []) {
      const p = worldToScreen(s.x, s.y);
      ctx.beginPath();
      ctx.arc(p.x,p.y,10,0,Math.PI*2);
      ctx.fillStyle = FACTION_COLOR[s.owner || 'neutral'];
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }

  async function apiGetState() {
    const res = await fetch(
      `/games/${encodeURIComponent(session.gameId)}/state?code=${encodeURIComponent(session.code)}`
    );
    return res.json();
  }

  async function refresh() {
    if (!session.gameId || !session.code) return;
    const state = await apiGetState();
    if (!state?.success) {
      showStatus(state?.error || 'Load failed');
      return;
    }
    game = state;
    yourFaction = state.yourFaction;
    turnEl.textContent = `Turn: ${state.turn}`;
    viewerEl.textContent = `You: ${yourFaction}`;
    gameInfoEl.textContent = `Game: ${session.gameId}`;
    readyStatusEl.textContent = `Ready: ithaxi=${state.ready.ithaxi} hive=${state.ready.hive}`;
    draw();
  }

  function openOverlay() {
    if (setupOverlay) setupOverlay.style.display = 'flex';
  }

  function closeOverlay() {
    if (setupOverlay) setupOverlay.style.display = 'none';
  }

  if (setupCreateBtn) {
    setupCreateBtn.onclick = async () => {
      const openAs = setupOpenAs.value;
      const cfg = {
        mapW:+setupMapW.value,
        mapH:+setupMapH.value,
        neutralCount:+setupNeutralCount.value,
        homeSysRes:+setupHomeSysRes.value,
        playerRes:+setupPlayerRes.value,
        uJumpShip:+setupUJumpShip.value,
        uShipyard:+setupUShipyard.value,
        uMine:+setupUMine.value,
        uLab:+setupULab.value,
        uStriker:+setupUStriker.value,
        uEscort:+setupUEscort.value,
        uBlocker:+setupUBlocker.value
      };

      showStatus('Creating game...');
      const res = await fetch('/games',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(cfg)
      }).then(r=>r.json());

      if (!res.success) {
        showStatus(res.error || 'Create failed');
        return;
      }

      const code = openAs === 'hive' ? res.join.hive.code : res.join.ithaxi.code;
      session.gameId = res.gameId;
      session.code = code;
      saveSession();
      setUrl(session.gameId, session.code);
      closeOverlay();
      refresh();
    };
  }

  if (joinBtn) {
    joinBtn.onclick = async () => {
      session.gameId = joinGameIdEl.value.trim();
      session.code = joinCodeEl.value.trim();
      saveSession();
      setUrl(session.gameId, session.code);
      closeOverlay();
      refresh();
    };
  }

  if (openSetupBtn) {
    openSetupBtn.onclick = () => {
      clearSession();
      clearUrl();
      game = null;
      openOverlay();
      draw();
    };
  }

  loadSession();

  (() => {
    const p = new URLSearchParams(location.search);
    const g = p.get('game');
    const c = p.get('code');
    if (g && c) {
      session.gameId = g;
      session.code = c;
      saveSession();
      closeOverlay();
      refresh();
    } else if (session.gameId && session.code) {
      setUrl(session.gameId, session.code);
      closeOverlay();
      refresh();
    } else {
      openOverlay();
    }
  })();

})();
