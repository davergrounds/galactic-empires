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

  // Cargo UI
  const loadSelectedUnitBtn = document.getElementById('loadSelectedUnitBtn');
  const loadCountInput = document.getElementById('loadCount');

  if (!canvas || !ctx) return;

  const FACTION_COLOR = {
    hive: '#35d04a',
    ithaxi: '#ff8a2a',
    neutral: '#888'
  };

  let game = null;
  let selectedJumpShip = null;
  let selectedUnit = null;
  let selectedUnitItem = null;
  let drawItems = [];

  function showStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function worldToScreen(wx, wy) {
    return { x: wx * 80 + 80, y: wy * 80 + 80 };
  }

  function drawUnit(u, x, y) {
    const size = 12;
    ctx.save();
    ctx.fillStyle = FACTION_COLOR[u.faction] || '#fff';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unitGlyph(u.type), x, y);
    ctx.restore();
  }

  function unitGlyph(type) {
    if (type === 'JumpShip') return 'J';
    if (type === 'Shipyard') return 'SY';
    if (type === 'Striker') return 'S';
    if (type === 'Escort') return 'E';
    if (type === 'Blocker') return 'B';
    if (type === 'Mine') return 'M';
    if (type === 'Lab') return 'L';
