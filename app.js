// ===== Draft sequence: standard MLBB ranked/tournament draft (10 bans, 10 picks) =====
// Phase 1: Ban x6 (alternating, Blue starts) -> Pick x6 (1-2-2-1)
// Phase 2: Ban x4 (alternating, Red starts) -> Pick x4 (1-2-1, Red starts)
const DRAFT_SEQUENCE = [
  { phase: "ban", side: "blue" }, { phase: "ban", side: "red" },
  { phase: "ban", side: "blue" }, { phase: "ban", side: "red" },
  { phase: "ban", side: "blue" }, { phase: "ban", side: "red" },
  { phase: "pick", side: "blue" }, { phase: "pick", side: "red" },
  { phase: "pick", side: "red" }, { phase: "pick", side: "blue" },
  { phase: "pick", side: "blue" }, { phase: "pick", side: "red" },
  { phase: "ban", side: "red" }, { phase: "ban", side: "blue" },
  { phase: "ban", side: "red" }, { phase: "ban", side: "blue" },
  { phase: "pick", side: "red" }, { phase: "pick", side: "blue" },
  { phase: "pick", side: "blue" }, { phase: "pick", side: "red" },
];

const state = {
  step: 0,
  yourSide: "blue", // which side is "you" — toggle in settings
  bans: { blue: [], red: [] },
  picks: { blue: [], red: [] },
  roleFilter: "all",
  search: "",
  timerSeconds: 0,
  timerInterval: null,
};

const takenHeroes = () => new Set([
  ...state.bans.blue, ...state.bans.red, ...state.picks.blue, ...state.picks.red
]);

function currentAction() {
  return DRAFT_SEQUENCE[state.step] || null;
}

function isDraftDone() {
  return state.step >= DRAFT_SEQUENCE.length;
}

// ===== Rendering =====
function render() {
  renderHeader();
  renderTeams();
  renderHeroGrid();
  renderSuggestions();
  document.getElementById("side-toggle-label").textContent = cap(state.yourSide);
}

function sideLabel(side) {
  return side === state.yourSide ? `${cap(side)} (You)` : `${cap(side)} (Enemy)`;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderHeader() {
  const el = document.getElementById("phase-banner");
  const action = currentAction();
  if (!action) {
    el.innerHTML = `<div class="phase-done">Draft complete — good luck! 🎮</div>`;
    document.getElementById("undo-btn").disabled = state.step === 0;
    stopTimer();
    return;
  }
  const isYou = action.side === state.yourSide;
  el.className = `phase-banner ${action.side} ${action.phase}`;
  el.innerHTML = `
    <div class="phase-row">
      <span class="phase-tag">${action.phase === "ban" ? "BAN" : "PICK"}</span>
      <span class="phase-side">${sideLabel(action.side)}</span>
      ${isYou ? '<span class="you-flag">YOUR TURN</span>' : ""}
    </div>
    <div class="phase-progress">Step ${state.step + 1} / ${DRAFT_SEQUENCE.length}</div>
  `;
  document.getElementById("undo-btn").disabled = state.step === 0;
}

function renderTeams() {
  ["blue", "red"].forEach(side => {
    const banRow = document.getElementById(`bans-${side}`);
    const pickRow = document.getElementById(`picks-${side}`);
    banRow.innerHTML = state.bans[side].map(h => slotHtml(h, "ban")).join("") +
      emptySlots(6 - state.bans[side].length, "ban");
    pickRow.innerHTML = state.picks[side].map(h => slotHtml(h, "pick")).join("") +
      emptySlots(5 - state.picks[side].length, "pick");
    document.getElementById(`label-${side}`).textContent = sideLabel(side);
  });
  renderCompCheck();
}

function slotHtml(name, kind) {
  const hero = HERO_BY_NAME[name];
  const tier = hero ? hero.tier : "";
  return `<div class="slot filled ${kind}" title="${name}">
    <span class="slot-name">${name}</span>
    ${tier ? `<span class="slot-tier tier-${tier}">${tier}</span>` : ""}
  </div>`;
}
function emptySlots(n, kind) {
  if (n <= 0) return "";
  return Array.from({ length: n }).map(() => `<div class="slot empty ${kind}"></div>`).join("");
}

function renderCompCheck() {
  const el = document.getElementById("comp-check");
  const yourPicks = state.picks[state.yourSide].map(n => HERO_BY_NAME[n]).filter(Boolean);
  const rolesFilled = new Set(yourPicks.map(h => h.role));
  const missing = ROLES.filter(r => !rolesFilled.has(r));
  const hasTank = yourPicks.some(h => h.type.includes("Tank"));
  let msg = "";
  if (yourPicks.length === 0) {
    msg = "No picks locked yet.";
  } else {
    msg = missing.length
      ? `Still open: ${missing.join(", ")}.`
      : "All 5 roles covered.";
    if (yourPicks.length >= 3 && !hasTank) {
      msg += " ⚠️ No frontline/tank locked yet — risky into any dive comp.";
    }
  }
  el.textContent = msg;
}

function renderHeroGrid() {
  const grid = document.getElementById("hero-grid");
  const taken = takenHeroes();
  const q = state.search.trim().toLowerCase();
  const list = HERO_DB
    .filter(h => state.roleFilter === "all" || h.role === state.roleFilter)
    .filter(h => !q || h.name.toLowerCase().includes(q))
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name));

  const action = currentAction();
  const disabled = !action;

  grid.innerHTML = list.map(h => {
    const isTaken = taken.has(h.name);
    return `
      <button class="hero-card tier-${h.tier} ${isTaken ? "taken" : ""}"
        data-name="${h.name}" ${isTaken || disabled ? "disabled" : ""}>
        <span class="hero-tier-badge tier-${h.tier}">${h.tier}</span>
        <span class="hero-name">${h.name}</span>
        <span class="hero-role">${h.role}</span>
        ${h.proBan ? `<span class="hero-proban">🔥 ${h.banRate}% pro ban</span>` : ""}
      </button>`;
  }).join("");

  grid.querySelectorAll(".hero-card").forEach(btn => {
    btn.addEventListener("click", () => commitAction(btn.dataset.name));
  });
}

function tierRank(t) { return { S: 0, A: 1, B: 2, C: 3 }[t] ?? 4; }

function commitAction(name) {
  const action = currentAction();
  if (!action) return;
  if (action.phase === "ban") state.bans[action.side].push(name);
  else state.picks[action.side].push(name);
  state.step += 1;
  resetTimer();
  render();
}

function undoAction() {
  if (state.step === 0) return;
  state.step -= 1;
  const action = DRAFT_SEQUENCE[state.step];
  if (action.phase === "ban") state.bans[action.side].pop();
  else state.picks[action.side].pop();
  resetTimer();
  render();
}

// ===== Suggestions panel: priority bans/picks + counters + bait =====
function renderSuggestions() {
  const el = document.getElementById("suggestions");
  const action = currentAction();
  const taken = takenHeroes();

  if (!action) {
    el.innerHTML = `<p class="suggest-empty">No more suggestions — draft's done.</p>`;
    return;
  }

  const available = HERO_DB.filter(h => !taken.has(h.name));
  let html = "";

  if (action.phase === "ban") {
    const topBans = available
      .filter(h => h.proBan)
      .sort((a, b) => b.banRate - a.banRate)
      .slice(0, 5);
    html += `<h3>Priority bans still open</h3>`;
    html += topBans.length
      ? `<ul class="suggest-list">${topBans.map(h => `<li><strong>${h.name}</strong> — ${h.banRate}% pro ban rate. ${h.notes}</li>`).join("")}</ul>`
      : `<p class="suggest-empty">All the heavily-contested meta bans are already gone — this is a good phase for a counter-ban or comfort-ban instead.</p>`;
  } else {
    // Pick phase: recommend by tier + role gaps for the side on the clock
    const side = action.side;
    const yourExisting = state.picks[side].map(n => HERO_BY_NAME[n]).filter(Boolean);
    const rolesFilled = new Set(yourExisting.map(h => h.role));
    const openRoles = ROLES.filter(r => !rolesFilled.has(r));
    const bestAvailable = available
      .filter(h => openRoles.length === 0 || openRoles.includes(h.role))
      .sort((a, b) => tierRank(a.tier) - tierRank(b.tier))
      .slice(0, 5);
    html += `<h3>Best value picks for ${sideLabel(side)}</h3>`;
    html += `<ul class="suggest-list">${bestAvailable.map(h => `<li><strong>${h.name}</strong> <span class="tier-tag tier-${h.tier}">${h.tier}</span> — ${h.role}. ${h.notes}</li>`).join("")}</ul>`;
  }

  // Counter-pick helper: last hero the enemy locked
  const enemySide = state.yourSide === "blue" ? "red" : "blue";
  const enemyPicks = state.picks[enemySide];
  if (enemyPicks.length) {
    const lastEnemy = HERO_BY_NAME[enemyPicks[enemyPicks.length - 1]];
    if (lastEnemy && lastEnemy.counters && lastEnemy.counters.length) {
      const openCounters = lastEnemy.counters.filter(c => {
        const base = c.split(" ")[0]; // handles multi-word notes like "Tanks with silence"
        return !taken.has(c) || !HERO_BY_NAME[c];
      });
      html += `<h3>Counters to their ${lastEnemy.name}</h3>`;
      html += `<ul class="suggest-list">${lastEnemy.counters.map(c => `<li>${c}</li>`).join("")}</ul>`;
    }
  }

  // Bait assistant — most useful heading into Ban Phase 2 / Pick Phase 2
  const baitCandidates = available.filter(h => h.bait);
  if (baitCandidates.length && (state.step >= 12)) {
    html += `<h3>🎣 Bait watch</h3>`;
    html += `<ul class="suggest-list bait-list">${baitCandidates.slice(0, 3).map(h => `<li><strong>${h.name}</strong> — ${h.bait}</li>`).join("")}</ul>`;
  }
  if (state.step === 16 || state.step === 17) {
    html += `<div class="bait-callout">Double-pick window: ${sideLabel("blue")} locks two heroes back-to-back right after this. If a strong hero is still open, letting the enemy take a lesser one here can set up your two-for-one.</div>`;
  }

  el.innerHTML = html;
}

// ===== Timer =====
function resetTimer() {
  stopTimer();
  state.timerSeconds = 30;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timerSeconds -= 1;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) stopTimer();
  }, 1000);
}
function stopTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
}
function updateTimerDisplay() {
  const el = document.getElementById("timer");
  el.textContent = state.timerSeconds > 0 ? state.timerSeconds : "--";
  el.classList.toggle("timer-low", state.timerSeconds <= 10 && state.timerSeconds > 0);
}

// ===== Controls =====
function resetDraft() {
  state.step = 0;
  state.bans = { blue: [], red: [] };
  state.picks = { blue: [], red: [] };
  resetTimer();
  render();
}

function init() {
  document.getElementById("search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderHeroGrid();
  });
  document.querySelectorAll(".role-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".role-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.roleFilter = tab.dataset.role;
      renderHeroGrid();
    });
  });
  document.getElementById("undo-btn").addEventListener("click", undoAction);
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Reset the whole draft?")) resetDraft();
  });
  document.getElementById("side-toggle").addEventListener("click", () => {
    state.yourSide = state.yourSide === "blue" ? "red" : "blue";
    render();
  });

  resetTimer();
  render();

  if (window.navigator && navigator.serviceWorker && typeof navigator.serviceWorker.register === "function") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
