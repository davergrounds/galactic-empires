// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =====================
// Constants / Rules
// =====================
const BASE_JUMPSHIP_CAPACITY = 8;
const BASE_SHIPYARD_MAX_SPEND_PER_TURN = 10;
const JUMPSHIP_MOVE_RANGE = 4; // squares (Manhattan)
const CONVERT_JUMPSHIP_TO_SHIPYARD_COST = 16;

const COST = {
  JumpShip: 10,
  Striker: 2,
  Escort: 1,
  Blocker: 1,
  Mine: 1,
  Shipyard: 10,
  Lab: 3
};

const HITS = {
  JumpShip: 6,
  Striker: 1,
  Escort: 1,
  Blocker: 2,
  Mine: 1,
  Shipyard: 6,
  Lab: 1
};

function cargoSizeForUnitType(type) {
  if (type === 'Shipyard') return 8;
  if (type === 'JumpShip') return 99; // disallow
  return 1;
}
function cargoSizeForResourceAmount(amount) {
  return Math.max(0, Math.floor(Number(amount) || 0));
}
function isResourceCargo(entry) {
  return entry && typeof entry === 'object' && entry.kind === 'resource';
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}
function rollDie(sides) {
  const s = Math.max(2, Math.floor(Number(sides) || 2));
  return Math.floor(Math.random() * s) + 1;
}

function techMult(level) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  return 1 + 0.2 * lvl;
}
function techLevelOf(faction, tech, game) {
  return (game.techLevels?.[faction]?.[tech] ?? 0) | 0;
}
function techValue(faction, tech, baseCount, game) {
  return Math.floor((baseCount || 0) * techMult(techLevelOf(faction, tech, game)));
}
function shipyardSpendCap(faction, game) {
  return Math.floor(BASE_SHIPYARD_MAX_SPEND_PER_TURN * techMult(techLevelOf(faction, 'Shipyard', game)));
}
function jumpshipCapacity(faction, game) {
  return Math.floor(BASE_JUMPSHIP_CAPACITY * techMult(techLevelOf(faction, 'JumpShip', game)));
}

// =====================
// Game generator
// =====================
function createUnit(type, faction, systemId, nextIdRef) {
  const u = {
    id: nextIdRef.value++,
    type,
    faction,
    systemId,
    hitsRemaining: HITS[type] ?? 1,
    inTransit: null
  };
  if (type === 'JumpShip') u.cargo = [];
  if (type === 'Shipyard') u.buildQueue = [];
  if (type === 'Mine') u.mineCooldown = 1;
  return u;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeSystemId(prefix, n) {
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

function generateNewGame(cfg) {
  const factions = ['ithaxi', 'hive'];

  const mapW = Math.max(6, Math.min(50, Math.floor(Number(cfg.mapW) || 12)));
  const mapH = Math.max(6, Math.min(50, Math.floor(Number(cfg.mapH) || 12)));
  const neutralCount = Math.max(0, Math.min(200, Math.floor(Number(cfg.neutralCount) || 18)));

  const homeSysRes = Math.max(0, Math.min(500, Math.floor(Number(cfg.homeSysRes) || 10)));
  const playerRes = Math.max(0, Math.min(500, Math.floor(Number(cfg.playerRes) || 50)));

  const startUnits = {
    JumpShip: Math.max(0, Math.min(50, Math.floor(Number(cfg.uJumpShip) || 1))),
    Shipyard: Math.max(0, Math.min(50, Math.floor(Number(cfg.uShipyard) || 1))),
    Mine: Math.max(0, Math.min(200, Math.floor(Number(cfg.uMine) || 1))),
    Lab: Math.max(0, Math.min(50, Math.floor(Number(cfg.uLab) || 0))),
    Striker: Math.max(0, Math.min(200, Math.floor(Number(cfg.uStriker) || 1))),
    Escort: Math.max(0, Math.min(200, Math.floor(Number(cfg.uEscort) || 1))),
    Blocker: Math.max(0, Math.min(200, Math.floor(Number(cfg.uBlocker) || 0))),
  };

  const used = new Set();
  function reserve(x, y) {
    const k = `${x},${y}`;
    if (used.has(k)) return false;
    used.add(k);
    return true;
  }

  const ithHome = { id: 'ITH-HOME', x: 1, y: 1, owner: 'ithaxi', value: 6, resources: homeSysRes };
  const hiveHome = { id: 'HIVE-HOME', x: mapW - 2, y: mapH - 2, owner: 'hive', value: 6, resources: homeSysRes };

  reserve(ithHome.x, ithHome.y);
  reserve(hiveHome.x, hiveHome.y);

  const systems = [ithHome, hiveHome];

  let attempts = 0;
  let placed = 0;
  while (placed < neutralCount && attempts < neutralCount * 50) {
    attempts++;
    const x = randomInt(0, mapW - 1);
    const y = randomInt(0, mapH - 1);
    if (!reserve(x, y)) continue;
    placed++;
    systems.push({
      id: makeSystemId('SYS', placed),
      x, y,
      owner: null,
      value: randomInt(1, 12),
      resources: 0
    });
  }

  const nextIdRef = { value: 1 };
  const units = [];

  for (const f of factions) {
    const homeId = (f === 'ithaxi') ? 'ITH-HOME' : 'HIVE-HOME';
    for (const [type, count] of Object.entries(startUnits)) {
      for (let i = 0; i < count; i++) {
        units.push(createUnit(type, f, homeId, nextIdRef));
      }
    }
  }

  const techTemplate = { Striker: 0, Escort: 0, Blocker: 0, Mine: 0, Shipyard: 0, JumpShip: 0, Lab: 0 };

  return {
    turn: 1,
    nextUnitId: nextIdRef.value,
    lastTurnLog: [],
    gameOver: false,
    winner: null,

    ready: { ithaxi: false, hive: false }, // both must ready

    map: { w: mapW, h: mapH },

    players: {
      ithaxi: { faction: 'ithaxi', orders: [], resources: playerRes },
      hive: { faction: 'hive', orders: [], resources: playerRes },
    },

    techLevels: {
      ithaxi: { ...techTemplate },
      hive: { ...techTemplate },
    },

    researchOrders: {},

    systems,
    units
  };
}

// =====================
// Multi-game store (Option 2)
// =====================
const games = new Map(); // gameId -> { game, joinCodes, createdAt }

function randToken(len = 10) {
  // simple base36 token
  let out = '';
  while (out.length < len) out += Math.random().toString(36).slice(2);
  return out.slice(0, len);
}

function createGameRecord(cfg) {
  const gameId = randToken(10);
  const joinCodeIthaxi = randToken(12);
  const joinCodeHive = randToken(12);

  const rec = {
    game: generateNewGame(cfg || {}),
    joinCodes: { ithaxi: joinCodeIthaxi, hive: joinCodeHive },
    createdAt: Date.now()
  };

  games.set(gameId, rec);
  return { gameId, joinCodeIthaxi, joinCodeHive };
}

function getGameRecord(gameId) {
  return games.get(String(gameId || '').trim()) || null;
}

function factionFromCode(rec, code) {
  const c = String(code || '').trim();
  if (!c) return null;
  if (c === rec.joinCodes.ithaxi) return 'ithaxi';
  if (c === rec.joinCodes.hive) return 'hive';
  return null;
}

function requireAuth(req, res) {
  const gameId = String(req.body?.gameId ?? req.query?.gameId ?? req.params?.gameId ?? '').trim();
  const code = String(req.body?.code ?? req.query?.code ?? '').trim();

  const rec = getGameRecord(gameId);
  if (!rec) {
    res.status(404).json({ success: false, error: 'Game not found' });
    return null;
  }

  const faction = factionFromCode(rec, code);
  if (!faction) {
    res.status(403).json({ success: false, error: 'Invalid join code' });
    return null;
  }

  return { rec, game: rec.game, faction, gameId };
}

// =====================
// Helpers (work on a given game)
// =====================
function getSystem(game, id) { return game.systems.find(s => s.id === id); }
function findUnit(game, id) { return game.units.find(u => u.id === id); }

function ensureCargo(ship) { if (!Array.isArray(ship.cargo)) ship.cargo = []; }
function ensureBuildQueue(sy) { if (!Array.isArray(sy.buildQueue)) sy.buildQueue = []; }

function cargoUsed(game, ship) {
  ensureCargo(ship);
  let used = 0;
  for (const entry of ship.cargo) {
    if (typeof entry === 'number') {
      const cu = findUnit(game, entry);
      if (!cu) continue;
      used += cargoSizeForUnitType(cu.type);
    } else if (isResourceCargo(entry)) {
      used += cargoSizeForResourceAmount(entry.amount);
    }
  }
  return used;
}

function markMineArrivedIfMine(unit) {
  if (unit && unit.type === 'Mine') unit.mineCooldown = 1;
}

function keySysFaction(systemId, faction) { return `${systemId}|${faction}`; }

function factionsPresentInSystem(game, systemId) {
  const set = new Set();
  for (const u of game.units) if (u.systemId === systemId && u.faction) set.add(u.faction);
  return [...set];
}
function hasEnemyPresence(game, systemId, faction) {
  for (const u of game.units) {
    if (u.systemId !== systemId) continue;
    if (!u.faction) continue;
    if (u.faction !== faction) return true;
  }
  return false;
}

function autoUnloadHostileJumpShips(game, log) {
  for (const ship of game.units) {
    if (ship.type !== 'JumpShip') continue;
    if (!ship.systemId) continue;
    if (ship.inTransit) continue;
    ensureCargo(ship);
    if (ship.cargo.length === 0) continue;

    if (!hasEnemyPresence(game, ship.systemId, ship.faction)) continue;

    let unloadedUnits = 0;
    const keep = [];
    for (const entry of ship.cargo) {
      if (typeof entry === 'number') {
        const cu = findUnit(game, entry);
        if (cu) {
          cu.systemId = ship.systemId;
          cu.inTransit = null;
          markMineArrivedIfMine(cu);
          unloadedUnits++;
        }
      } else if (isResourceCargo(entry)) keep.push(entry);
    }
    ship.cargo = keep;

    if (unloadedUnits > 0) {
      log.push(`[AutoUnload ${ship.systemId}] JumpShip #${ship.id} in hostile system -> unloaded ${unloadedUnits} unit(s) (resources kept in cargo)`);
    }
  }
}

// Combat
function countUnits(game, systemId, faction, type) {
  return game.units.filter(u => u.systemId === systemId && u.faction === faction && u.type === type).length;
}
function computeOutgoingHits(game, systemId, faction) {
  const strikerCount = countUnits(game, systemId, faction, 'Striker');
  const effectiveStrikers = techValue(faction, 'Striker', strikerCount, game);
  return effectiveStrikers * 2;
}
function computeBlockCapacity(game, systemId, faction) {
  const escortCount = countUnits(game, systemId, faction, 'Escort');
  const blockerCount = countUnits(game, systemId, faction, 'Blocker');

  const effectiveEscorts = techValue(faction, 'Escort', escortCount, game);
  const effectiveBlockers = techValue(faction, 'Blocker', blockerCount, game);

  return {
    escorts: { count: escortCount, effective: effectiveEscorts, capacity: effectiveEscorts * 1 },
    blockers: { count: blockerCount, effective: effectiveBlockers, capacity: effectiveBlockers * 2 }
  };
}

function applyBlocksAndCasualties(game, systemId, faction, incomingHits) {
  // Escorts block first; blockers block second and are destroyed when used.
  // Casualty priority (rules):
  // STRIKERS > ESCORTS > JUMPSHIPS > MINES > LABS > SHIPYARDS
  const blocks = computeBlockCapacity(game, systemId, faction);

  let remaining = Math.max(0, incomingHits | 0);

  const cancelledByEscorts = Math.min(remaining, blocks.escorts.capacity);
  remaining -= cancelledByEscorts;

  const cancelledByBlockers = Math.min(remaining, blocks.blockers.capacity);
  remaining -= cancelledByBlockers;

  let blockersDestroyed = 0;
  if (cancelledByBlockers > 0) blockersDestroyed = Math.min(blocks.blockers.count, Math.ceil(cancelledByBlockers / 2));

  const destroyedIds = [];

  function destroySome(type, n) {
    if (n <= 0) return 0;
    const victims = game.units
      .filter(u => u.systemId === systemId && u.faction === faction && u.type === type)
      .sort((a, b) => a.id - b.id)
      .slice(0, n);
    for (const v of victims) destroyedIds.push(v.id);
    return victims.length;
  }

  if (blockersDestroyed > 0) destroySome('Blocker', blockersDestroyed);

  let hitsToApply = remaining;
  const order = ['Striker', 'Escort', 'JumpShip', 'Mine', 'Lab', 'Shipyard'];
  for (const t of order) {
    if (hitsToApply <= 0) break;
    const killed = destroySome(t, hitsToApply);
    hitsToApply -= killed;
  }

  if (destroyedIds.length > 0) game.units = game.units.filter(u => !destroyedIds.includes(u.id));

  return { incomingHits, cancelledByEscorts, cancelledByBlockers, blockersDestroyed, appliedHits: remaining, destroyedIds };
}

function resolveCombatInSystem(game, systemId, log) {
  const factions = factionsPresentInSystem(game, systemId);
  if (factions.length < 2) return;

  const a = factions[0];
  const b = factions[1];

  const hitsA = computeOutgoingHits(game, systemId, a);
  const hitsB = computeOutgoingHits(game, systemId, b);

  const resA = applyBlocksAndCasualties(game, systemId, a, hitsB);
  const resB = applyBlocksAndCasualties(game, systemId, b, hitsA);

  const destroyedAll = [...resA.destroyedIds, ...resB.destroyedIds];

  log.push(`[Combat ${systemId}] factions=${a} vs ${b} | hits: ${a}:${hitsA} ${b}:${hitsB} | destroyed: ${destroyedAll.length ? destroyedAll.join(',') : 'none'}`);
  log.push(`  - ${a} took ${hitsB} hits, blocked by escorts=${resA.cancelledByEscorts}, blockers=${resA.cancelledByBlockers} (blockersDestroyed=${resA.blockersDestroyed}), applied=${resA.appliedHits}, destroyed=${resA.destroyedIds.length ? resA.destroyedIds.join(',') : 'none'}`);
  log.push(`  - ${b} took ${hitsA} hits, blocked by escorts=${resB.cancelledByEscorts}, blockers=${resB.cancelledByBlockers} (blockersDestroyed=${resB.blockersDestroyed}), applied=${resB.appliedHits}, destroyed=${resB.destroyedIds.length ? resB.destroyedIds.join(',') : 'none'}`);
}

function resolveAllCombats(game, log) {
  for (const sys of game.systems) resolveCombatInSystem(game, sys.id, log);
}

// Research
function researchDieSides(targetLevel) {
  const lvl = Math.max(1, Math.floor(Number(targetLevel) || 1));
  return 6 + 2 * (lvl - 1);
}
function resolveResearch(game, log) {
  const byGroup = new Map();
  for (const u of game.units) {
    if (u.type !== 'Lab') continue;
    if (!u.systemId || !u.faction) continue;
    const k = keySysFaction(u.systemId, u.faction);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(u);
  }

  for (const [k, labs] of byGroup.entries()) {
    const [systemId, faction] = k.split('|');
    const order = game.researchOrders[k];
    if (!order || !order.tech || !order.targetLevel) continue;

    const tech = order.tech;
    const targetLevel = Math.max(1, Math.floor(order.targetLevel));

    const current = techLevelOf(faction, tech, game);
    if (targetLevel !== current + 1) {
      log.push(`[Research ${systemId}] ${faction} invalid target (have L${current}, asked L${targetLevel}) -> ignored`);
      continue;
    }

    const labCount = labs.length;
    const effectiveLabs = techValue(faction, 'Lab', labCount, game);
    const sides = researchDieSides(targetLevel);

    const rolls = [];
    let success = false;
    for (let i = 0; i < effectiveLabs; i++) {
      const r = rollDie(sides);
      rolls.push(r);
      if (r === 1) success = true;
    }

    if (success) {
      game.techLevels[faction][tech] = targetLevel;
      log.push(`[Research ${systemId}] ${faction} SUCCESS ${tech} -> L${targetLevel} | labs=${labCount} eff=${effectiveLabs} roll=d${sides} ${rolls.join(',')}`);
      delete game.researchOrders[k];
    } else {
      log.push(`[Research ${systemId}] ${faction} failed ${tech} -> L${targetLevel} | labs=${labCount} eff=${effectiveLabs} roll=d${sides} ${rolls.join(',')}`);
    }
  }
}

// Movement distance
function manhattanDistance(aSys, bSys) {
  return Math.abs((aSys?.x ?? 0) - (bSys?.x ?? 0)) + Math.abs((aSys?.y ?? 0) - (bSys?.y ?? 0));
}

// Game end
function checkGameOverAndSetWinner(game, log) {
  if (game.gameOver) return;

  const factions = ['ithaxi', 'hive'];
  const remaining = { ithaxi: 0, hive: 0 };

  for (const u of game.units) if (u.faction && remaining[u.faction] != null) remaining[u.faction]++;

  const alive = factions.filter(f => (remaining[f] || 0) > 0);

  if (alive.length === 1) {
    game.gameOver = true;
    game.winner = alive[0];
    log.push(`[Game] GAME OVER — winner=${game.winner}`);
  } else if (alive.length === 0) {
    game.gameOver = true;
    game.winner = null;
    log.push(`[Game] GAME OVER — draw (no units remain)`);
  }
}

// =====================
// Turn resolution (per game)
// =====================
function resolveTurnInternal(game) {
  if (game.gameOver) return;

  const log = [];
  game.lastTurnLog = log;

  // Snapshot system resources at start of turn
  const startResources = new Map();
  for (const sys of game.systems) startResources.set(sys.id, sys.resources);

  // 1) Move JumpShips in transit
  for (const u of game.units) {
    if (u.type === 'JumpShip' && u.inTransit) {
      u.systemId = u.inTransit;
      u.inTransit = null;
    }
  }

  // 2) Auto-unload units if in hostile system
  autoUnloadHostileJumpShips(game, log);

  // 3) Combat
  resolveAllCombats(game, log);

  // 3b) Check game end
  checkGameOverAndSetWinner(game, log);

  // 4) Research
  resolveResearch(game, log);

  // 5) Shipyard production (NO PARTIAL BUILDS)
  for (const sy of game.units) {
    if (sy.type !== 'Shipyard') continue;
    if (!sy.systemId) continue;

    ensureBuildQueue(sy);
    if (sy.buildQueue.length === 0) continue;

    const sysId = sy.systemId;
    const sys = getSystem(game, sysId);
    if (!sys) continue;

    let available = startResources.get(sysId) ?? 0;
    let spendLeft = shipyardSpendCap(sy.faction, game);

    let spent = 0;
    let built = 0;

    while (sy.buildQueue.length > 0) {
      const job = sy.buildQueue[0];
      const type = job.type;
      const cost = COST[type];

      if (!cost) { sy.buildQueue.shift(); continue; }
      if (cost > spendLeft) break;
      if (cost > available) break;

      available -= cost;
      spendLeft -= cost;
      spent += cost;

      // create new unit
      const nextIdRef = { value: game.nextUnitId };
      const nu = createUnit(type, sy.faction, sy.systemId, nextIdRef);
      game.nextUnitId = nextIdRef.value;
      game.units.push(nu);

      sy.buildQueue.shift();
      built++;
    }

    if (spent > 0) sys.resources = Math.max(0, sys.resources - spent);
    startResources.set(sysId, available);

    log.push(`[Shipyard ${sy.id} @ ${sysId}] built=${built}, spent=${spent}, queueLeft=${sy.buildQueue.length}`);
  }

  // 6) Mine cooldown tick
  for (const u of game.units) {
    if (u.type === 'Mine' && typeof u.mineCooldown === 'number' && u.mineCooldown > 0) u.mineCooldown -= 1;
  }

  // 7) Mining + Exhaustion
  for (const sys of game.systems) {
    const minesOperatingRaw = game.units.filter(u =>
      u.type === 'Mine' &&
      u.systemId === sys.id &&
      (u.mineCooldown || 0) <= 0
    ).length;

    const minesOperating = Math.min(minesOperatingRaw, Math.max(0, sys.value));

    // Mine tech currently tied to owner (as per your earlier "doesn't matter much")
    const produced = techValue((sys.owner || 'neutral'), 'Mine', minesOperating, game);
    if (produced > 0) sys.resources += produced;

    const roll = rollD20();
    const exhausted = produced > roll;
    if (exhausted && sys.value > 0) sys.value -= 1;

    log.push(`[Mining ${sys.id}] mines=${minesOperating}, produced=${produced}, roll=d20(${roll}) => ${exhausted ? 'EXHAUSTED (value-1)' : 'ok'} (value=${sys.value})`);
  }

  // 8) Player passive income (treasury)
  for (const p of Object.values(game.players)) p.resources += 2;

  // 9) Increment turn
  game.turn++;

  // turn ready resets each turn
  game.ready.ithaxi = false;
  game.ready.hive = false;
}

// =====================
// Fog-of-war masking (per game + faction)
// =====================
function computeVisibleSystemsForFaction(game, faction) {
  const vis = new Set();
  for (const u of game.units) {
    if (u.faction !== faction) continue;
    if (u.systemId) vis.add(u.systemId);
  }
  return vis;
}

function parseSystemIdFromLogLine(line) {
  const s = String(line ?? '');
  let m = s.match(/^\[(Combat|Mining|Research|AutoUnload)\s+([^\]\s]+)\]/);
  if (m) return m[2];

  m = s.match(/^\[Shipyard\s+\d+\s+@\s+([^\]\s]+)\]/);
  if (m) return m[1];

  return null;
}

function maskedStateForViewer(game, faction) {
  const vis = computeVisibleSystemsForFaction(game, faction);

  // Always show star positions + names.
  // Hide owner/resources/value unless you have units there.
  const systems = game.systems.map(sys => {
    const isVisible = vis.has(sys.id);

    const owner = isVisible ? (sys.owner ?? null) : null;
    const resources = isVisible ? sys.resources : null;
    const value = isVisible ? sys.value : null;

    return { ...sys, owner, resources, value };
  });

  // Units: show viewer units always; enemy units only in visible systems
  const units = game.units
    .filter(u => {
      if (u.faction === faction) return true;
      if (!u.faction) return false;
      if (!u.systemId) return false;
      return vis.has(u.systemId);
    })
    .map(u => ({ ...u }));

  // Turn log: only show system-scoped lines if visible
  const lastTurnLog = (game.lastTurnLog || []).filter(line => {
    const sysId = parseSystemIdFromLogLine(line);
    if (!sysId) return true;
    return vis.has(sysId);
  });

  return {
    turn: game.turn,
    gameOver: game.gameOver,
    winner: game.winner,
    ready: { ...game.ready },
    map: { ...game.map },
    players: game.players,
    techLevels: game.techLevels,
    systems,
    units,
    lastTurnLog
  };
}

// =====================
// Routes
// =====================

// Create a new game -> returns gameId + join links/codes
app.post('/games', (req, res) => {
  const cfg = req.body || {};
  const { gameId, joinCodeIthaxi, joinCodeHive } = createGameRecord(cfg);

  // For convenience, build relative join links
  const ithLink = `/?game=${encodeURIComponent(gameId)}&code=${encodeURIComponent(joinCodeIthaxi)}`;
  const hiveLink = `/?game=${encodeURIComponent(gameId)}&code=${encodeURIComponent(joinCodeHive)}`;

  res.json({
    success: true,
    gameId,
    join: {
      ithaxi: { code: joinCodeIthaxi, link: ithLink },
      hive: { code: joinCodeHive, link: hiveLink }
    }
  });
});

// View state (fogged) for a specific game + join code
app.get('/games/:gameId/state', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction, gameId } = auth;

  const state = maskedStateForViewer(game, faction);
  res.json({
    success: true,
    gameId,
    yourFaction: faction,
    ...state
  });
});

// Turn status
app.get('/games/:gameId/turn/status', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { game, faction, gameId } = auth;

  res.json({
    success: true,
    gameId,
    yourFaction: faction,
    turn: game.turn,
    gameOver: game.gameOver,
    winner: game.winner,
    ready: { ...game.ready }
  });
});

// Click ready; if both ready -> resolve immediately
app.post('/games/:gameId/turn/ready', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction, gameId } = auth;

  if (game.gameOver) {
    return res.json({ success: false, error: 'Game is over', gameId, turn: game.turn, winner: game.winner });
  }

  game.ready[faction] = true;
  const both = game.ready.ithaxi && game.ready.hive;

  if (both) {
    resolveTurnInternal(game);
    return res.json({
      success: true,
      gameId,
      resolved: true,
      turn: game.turn,
      ready: { ...game.ready },
      gameOver: game.gameOver,
      winner: game.winner
    });
  }

  res.json({ success: true, gameId, resolved: false, turn: game.turn, ready: { ...game.ready } });
});

// Resign
app.post('/games/:gameId/resign', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction, gameId } = auth;

  if (!game.gameOver) {
    game.gameOver = true;
    game.winner = (faction === 'ithaxi') ? 'hive' : 'ithaxi';
    game.lastTurnLog = game.lastTurnLog || [];
    game.lastTurnLog.push(`[Game] RESIGN — ${faction} resigned, winner=${game.winner}`);
  }

  res.json({ success: true, gameId, gameOver: game.gameOver, winner: game.winner });
});

// Move JumpShip (range-limited, systems only)
app.post('/games/:gameId/order/move', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction, gameId } = auth;
  const { unitId, toSystemId } = req.body || {};

  if (game.gameOver) return res.json({ success: false, error: 'Game is over' });

  const unit = game.units.find(u => u.id === unitId && u.faction === faction);
  if (!unit) return res.json({ success: false, error: 'Unit not found' });
  if (unit.type !== 'JumpShip') return res.json({ success: false, error: 'Only JumpShips can move' });

  const dest = getSystem(game, toSystemId);
  if (!dest) return res.json({ success: false, error: 'Destination system not found' });

  const from = getSystem(game, unit.systemId);
  if (!from) return res.json({ success: false, error: 'JumpShip is not currently in a system' });

  const dist = manhattanDistance(from, dest);
  if (dist > JUMPSHIP_MOVE_RANGE) {
    return res.json({ success: false, error: `Out of range: distance ${dist} > ${JUMPSHIP_MOVE_RANGE}` });
  }

  unit.inTransit = toSystemId;
  res.json({ success: true, distance: dist });
});

// Convert JumpShip -> Shipyard (cost 16 system resources)
app.post('/games/:gameId/order/convertToShipyard', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction, gameId } = auth;
  const { jumpShipId } = req.body || {};

  if (game.gameOver) return res.json({ success: false, error: 'Game is over' });

  const ship = game.units.find(u => u.id === jumpShipId && u.faction === faction && u.type === 'JumpShip');
  if (!ship) return res.json({ success: false, error: 'JumpShip not found' });
  if (ship.inTransit) return res.json({ success: false, error: 'Cannot convert while in transit' });
  if (!ship.systemId) return res.json({ success: false, error: 'JumpShip is not in a system' });

  const sys = getSystem(game, ship.systemId);
  if (!sys) return res.json({ success: false, error: 'System not found' });

  if (sys.resources < CONVERT_JUMPSHIP_TO_SHIPYARD_COST) {
    return res.json({ success: false, error: `Need ${CONVERT_JUMPSHIP_TO_SHIPYARD_COST} system resources (has ${sys.resources})` });
  }

  sys.resources -= CONVERT_JUMPSHIP_TO_SHIPYARD_COST;

  ship.type = 'Shipyard';
  ship.hitsRemaining = HITS.Shipyard;
  ship.cargo = undefined;
  ship.buildQueue = [];
  ship.inTransit = null;

  game.lastTurnLog = game.lastTurnLog || [];
  game.lastTurnLog.push(`[Shipyard ${ship.id} @ ${ship.systemId}] CONVERSION from JumpShip cost=${CONVERT_JUMPSHIP_TO_SHIPYARD_COST}`);

  return res.json({ success: true });
});

// Load UNIT into JumpShip
app.post('/games/:gameId/order/load', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction } = auth;
  const { unitId, jumpShipId } = req.body || {};

  if (game.gameOver) return res.json({ success: false, error: 'Game is over' });

  const unit = game.units.find(u => u.id === unitId && u.faction === faction);
  const ship = game.units.find(u => u.id === jumpShipId && u.faction === faction && u.type === 'JumpShip');

  if (!unit) return res.json({ success: false, error: 'Unit not found' });
  if (!ship) return res.json({ success: false, error: 'JumpShip not found' });

  if (!unit.systemId) return res.json({ success: false, error: 'Unit is not on a system' });
  if (!ship.systemId) return res.json({ success: false, error: 'JumpShip is not on a system' });
  if (ship.inTransit) return res.json({ success: false, error: 'Cannot load while in transit' });
  if (unit.systemId !== ship.systemId) return res.json({ success: false, error: 'Not in same system' });
  if (unit.type === 'JumpShip') return res.json({ success: false, error: 'Cannot load JumpShip into JumpShip' });

  ensureCargo(ship);

  const used = cargoUsed(game, ship);
  const size = cargoSizeForUnitType(unit.type);
  const cap = jumpshipCapacity(faction, game);

  if (used + size > cap) {
    return res.json({ success: false, error: `Not enough cargo space: used ${used}/${cap}, unit needs ${size}` });
  }

  ship.cargo.push(unit.id);
  unit.systemId = null;
  unit.inTransit = null;

  res.json({ success: true, used: cargoUsed(game, ship), capacity: cap });
});

// Load RESOURCES into JumpShip
app.post('/games/:gameId/order/loadResources', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction } = auth;
  const { jumpShipId, amount } = req.body || {};

  if (game.gameOver) return res.json({ success: false, error: 'Game is over' });

  const ship = game.units.find(u => u.id === jumpShipId && u.faction === faction && u.type === 'JumpShip');
  if (!ship) return res.json({ success: false, error: 'JumpShip not found' });
  if (ship.inTransit) return res.json({ success: false, error: 'Cannot load while in transit' });
  if (!ship.systemId) return res.json({ success: false, error: 'JumpShip not in a system' });

  const sys = getSystem(game, ship.systemId);
  if (!sys) return res.json({ success: false, error: 'System not found' });

  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (amt <= 0) return res.json({ success: false, error: 'Amount must be > 0' });
  if (sys.resources < amt) return res.json({ success: false, error: `Not enough resources in system (has ${sys.resources})` });

  const used = cargoUsed(game, ship);
  const cap = jumpshipCapacity(faction, game);
  if (used + amt > cap) return res.json({ success: false, error: `Not enough cargo space: used ${used}/${cap}, need ${amt}` });

  sys.resources -= amt;
  ensureCargo(ship);
  ship.cargo.push({ kind: 'resource', amount: amt });

  res.json({ success: true, used: cargoUsed(game, ship), capacity: cap, systemResources: sys.resources });
});

// Manual unload
app.post('/games/:gameId/order/unload', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction } = auth;
  const { jumpShipId, unitId, resourceIndex, all } = req.body || {};

  if (game.gameOver) return res.json({ success: false, error: 'Game is over' });

  const ship = game.units.find(u => u.id === jumpShipId && u.faction === faction && u.type === 'JumpShip');
  if (!ship) return res.json({ success: false, error: 'JumpShip not found' });
  if (ship.inTransit) return res.json({ success: false, error: 'Cannot unload while in transit' });
  if (!ship.systemId) return res.json({ success: false, error: 'JumpShip is not in a system' });

  const sys = getSystem(game, ship.systemId);
  if (!sys) return res.json({ success: false, error: 'System not found' });

  ensureCargo(ship);

  if (all) {
    for (const entry of ship.cargo) {
      if (typeof entry === 'number') {
        const cu = findUnit(game, entry);
        if (cu) { cu.systemId = ship.systemId; cu.inTransit = null; markMineArrivedIfMine(cu); }
      } else if (isResourceCargo(entry)) {
        sys.resources += cargoSizeForResourceAmount(entry.amount);
      }
    }
    ship.cargo = [];
    return res.json({ success: true });
  }

  if (unitId != null) {
    const u = findUnit(game, unitId);
    if (!u) return res.json({ success: false, error: 'Unit not found' });
    if (!ship.cargo.includes(u.id)) return res.json({ success: false, error: 'That unit is not in this cargo' });

    ship.cargo = ship.cargo.filter(e => e !== u.id);
    u.systemId = ship.systemId;
    u.inTransit = null;
    markMineArrivedIfMine(u);

    return res.json({ success: true });
  }

  if (resourceIndex != null) {
    const idx = Number(resourceIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= ship.cargo.length) return res.json({ success: false, error: 'Invalid resourceIndex' });
    const entry = ship.cargo[idx];
    if (!isResourceCargo(entry)) return res.json({ success: false, error: 'Cargo entry is not a resource bundle' });

    const amt = cargoSizeForResourceAmount(entry.amount);
    sys.resources += amt;
    ship.cargo.splice(idx, 1);

    return res.json({ success: true });
  }

  return res.json({ success: false, error: 'Provide unitId, resourceIndex, or all:true' });
});

// Queue production
app.post('/games/:gameId/order/produce', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction } = auth;
  const { shipyardId, units } = req.body || {};

  if (game.gameOver) return res.json({ success: false, error: 'Game is over' });

  const shipyard = game.units.find(u => u.id === shipyardId && u.faction === faction && u.type === 'Shipyard');
  if (!shipyard) return res.json({ success: false, error: 'Shipyard not found' });
  if (!Array.isArray(units)) return res.json({ success: false, error: 'units must be an array' });

  ensureBuildQueue(shipyard);

  for (const item of units) {
    const type = item?.type;
    const count = Math.max(0, Math.floor(Number(item?.count) || 0));
    if (!type || count <= 0) continue;
    if (!COST[type]) continue;
    for (let i = 0; i < count; i++) shipyard.buildQueue.push({ type });
  }

  res.json({ success: true, queued: shipyard.buildQueue.length });
});

// Queue research
app.post('/games/:gameId/order/research', (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { game, faction } = auth;
  const { labId, tech, targetLevel } = req.body || {};

  if (game.gameOver) return res.json({ success: false, error: 'Game is over' });

  const lab = game.units.find(u => u.id === labId && u.faction === faction && u.type === 'Lab');
  if (!lab) return res.json({ success: false, error: 'Lab not found' });
  if (!lab.systemId) return res.json({ success: false, error: 'Lab is not in a system' });

  const TECHS = ['Striker', 'Escort', 'Blocker', 'Mine', 'Shipyard', 'JumpShip', 'Lab'];
  if (!TECHS.includes(tech)) return res.json({ success: false, error: 'Invalid tech' });

  const current = techLevelOf(faction, tech, game);
  const tl = Math.max(1, Math.floor(Number(targetLevel) || 1));
  if (tl !== current + 1) return res.json({ success: false, error: `Target must be current+1 (have L${current}, want L${tl})` });

  const k = keySysFaction(lab.systemId, faction);
  game.researchOrders[k] = { tech, targetLevel: tl };

  res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
