const SUITS = [
  { key: "s", symbol: "♠", red: false },
  { key: "h", symbol: "♥", red: true },
  { key: "d", symbol: "♦", red: true },
  { key: "c", symbol: "♣", red: false },
];
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const RANK_VALUE = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const RANGE_DATA = {
  UTG: { pct: 15, label: "타이트", threshold: 31 },
  UTG1: { pct: 17, label: "타이트", threshold: 29 },
  LJ: { pct: 19, label: "선별적", threshold: 28 },
  HJ: { pct: 20, label: "선별적", threshold: 27 },
  CO: { pct: 28, label: "넓게", threshold: 22 },
  BTN: { pct: 45, label: "가장 넓게", threshold: 15 },
  SB: { pct: 36, label: "공격적", threshold: 18 },
  BB: { pct: 0, label: "오픈 없음", threshold: 99 },
};
const ACTION_TIGHTEN = { folded: 0, limp: 2, raise: 10, threebet: 18, allin: 22 };
const ACTION_RANGE = { folded: 100, limp: 42, raise: 22, threebet: 9, allin: 7, checked: 100, bet: 48 };
const GTO_OPEN_RANGES = {
  deep:     { UTG: 14, UTG1: 16, LJ: 19, HJ: 22, CO: 30, BTN: 48, SB: 42, BB: 0 },
  standard: { UTG: 15, UTG1: 17, LJ: 20, HJ: 23, CO: 31, BTN: 49, SB: 43, BB: 0 },
  medium:   { UTG: 17, UTG1: 19, LJ: 22, HJ: 25, CO: 34, BTN: 52, SB: 46, BB: 0 },
  short:    { UTG: 19, UTG1: 21, LJ: 24, HJ: 28, CO: 37, BTN: 55, SB: 50, BB: 0 },
  push:     { UTG: 17, UTG1: 19, LJ: 22, HJ: 26, CO: 34, BTN: 48, SB: 55, BB: 0 },
};
const POSITION_BY_PLAYERS = {
  2: ["BTN", "BB"], 3: ["BTN", "SB", "BB"], 4: ["CO", "BTN", "SB", "BB"],
  5: ["HJ", "CO", "BTN", "SB", "BB"], 6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  7: ["UTG", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
  8: ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
};
const POSITION_LABEL = { UTG: "UTG", UTG1: "UTG+1", LJ: "LJ", HJ: "HJ", CO: "CO", BTN: "BTN", SB: "SB", BB: "BB" };
const ACTION_OPTIONS = {
  preflop: [
    ["folded", "모두 폴드 · 내가 선행"], ["limp", "림퍼 있음"], ["raise", "오픈 레이즈"],
    ["threebet", "3-bet을 맞음"], ["allin", "상대 올인"],
  ],
  postflop: [
    ["checked", "상대 체크 · 내가 베팅 가능"], ["bet", "상대 베팅"], ["raise", "내 베팅에 상대 레이즈"], ["allin", "상대 올인"],
  ],
};
const state = { hole: [null, null], board: [null, null, null, null, null], activeSlot: null, equity: null };

const $ = (id) => document.getElementById(id);
const allCards = SUITS.flatMap(s => RANKS.map(rank => ({ rank, suit: s.key, symbol: s.symbol, red: s.red, id: rank + s.key })));

function renderRanges() {
  const selected = state.hole.every(Boolean) ? handNotation(state.hole) : "";
  const cells = [];
  RANKS.forEach((rowRank, row) => RANKS.forEach((colRank, col) => {
    const notation = row === col ? rowRank + colRank : row < col ? rowRank + colRank + "s" : colRank + rowRank + "o";
    const cards = notationCards(notation);
    const policy = preflopPolicy(cards);
    const primary = policy[0];
    const mixed = policy.length > 1 && policy[1].frequency >= 20;
    const kind = mixed ? "mix" : actionKind(primary.code);
    cells.push(`<div class="range-item ${kind} ${notation === selected ? "selected" : ""}" aria-label="${notation}: ${policy.map(p => `${p.label} ${p.frequency}%`).join(", ")}">${notation}</div>`);
  }));
  $("positionRanges").innerHTML = cells.join("");
  const target = currentOpenRange();
  $("rangeFootnote").textContent = `${$("position").selectedOptions[0].text} · ${stackProfile().name} · 기준 참가 범위 약 ${target.toFixed(0)}%. 셀은 가장 높은 빈도의 액션을 표시합니다.`;
}

function updateActiveRange() { renderRanges(); }

function updatePositionOptions() {
  const select = $("position");
  const previous = select.value;
  const players = Number($("players").value);
  const positions = POSITION_BY_PLAYERS[players] || POSITION_BY_PLAYERS[6];
  select.innerHTML = positions.map(position => `<option value="${position}">${players === 2 && position === "BTN" ? "BTN / SB" : POSITION_LABEL[position]}</option>`).join("");
  select.value = positions.includes(previous) ? previous : positions[0];
}

function renderSlots() {
  document.querySelectorAll("[data-slot]").forEach(button => {
    const [group, index] = button.dataset.slot.split("-");
    const card = state[group][Number(index)];
    button.className = "card-slot" + (card ? (card.red ? " red" : "") : " empty");
    button.innerHTML = card ? `${card.rank}<small>${card.symbol}</small>` : "+";
    button.setAttribute("aria-label", card ? `${card.rank}${card.symbol}, 클릭하여 변경` : "카드 선택");
  });
}

function streetInfo() {
  const count = state.board.filter(Boolean).length;
  if (count === 0) return { key: "preflop", ko: "프리플랍", en: "PREFLOP", valid: true };
  if (count === 3) return { key: "flop", ko: "플랍", en: "FLOP", valid: true };
  if (count === 4) return { key: "turn", ko: "턴", en: "TURN", valid: true };
  if (count === 5) return { key: "river", ko: "리버", en: "RIVER", valid: true };
  return { key: "incomplete", ko: "보드 입력 중", en: "BOARD", valid: false };
}

function updateActionOptions() {
  const street = streetInfo();
  const type = street.key === "preflop" ? "preflop" : "postflop";
  const select = $("villainAction");
  const old = select.value;
  select.innerHTML = ACTION_OPTIONS[type].map(([value, text]) => `<option value="${value}">${text}</option>`).join("");
  if ([...select.options].some(o => o.value === old)) select.value = old;
}

function updateStreetUI(analysis = null) {
  const street = streetInfo();
  $("streetLabel").textContent = street.ko;
  $("streetPill").textContent = street.en;
  $("streetTitle").textContent = `${street.ko} 분석`;
  updateActionOptions();
  if (!street.valid) {
    $("fiveCardRule").textContent = "플랍은 커뮤니티 카드 3장부터";
    $("streetHand").textContent = "입력 중";
    $("outsValue").textContent = "—"; $("improveValue").textContent = "—"; $("drawValue").textContent = "—";
    $("streetHint").textContent = "플랍 카드 3장을 모두 선택하면 정확한 분석이 시작됩니다.";
    return;
  }
  if (street.key === "preflop") {
    $("fiveCardRule").textContent = "홀카드 2장으로 시작합니다";
    $("streetHand").textContent = "프리플랍";
    $("outsValue").textContent = "—"; $("improveValue").textContent = "—"; $("drawValue").textContent = "—";
    $("streetHint").textContent = "커뮤니티 카드 3장을 입력하면 플랍 분석으로 전환됩니다.";
    return;
  }
  if (!analysis) return;
  $("fiveCardRule").textContent = "7장 중 가장 강한 5장으로 판정";
  $("streetHand").textContent = analysis.name;
  $("outsValue").textContent = street.key === "river" ? "없음" : `${analysis.outs}장`;
  $("improveLabel").textContent = street.key === "flop" ? "리버까지 개선 확률" : street.key === "turn" ? "리버 개선 확률" : "쇼다운";
  $("improveValue").textContent = street.key === "river" ? "보드 완성" : `${analysis.improveChance.toFixed(1)}%`;
  $("drawValue").textContent = analysis.draw;
  $("streetHint").textContent = analysis.hint;
}

function renderPicker() {
  const used = new Set([...state.hole, ...state.board].filter(Boolean).map(c => c.id));
  $("cardGrid").innerHTML = allCards.map(card =>
    `<button class="pick-card ${card.red ? "red" : ""}" data-card="${card.id}" ${used.has(card.id) ? "disabled" : ""}>${card.rank}<br>${card.symbol}</button>`
  ).join("");
}

function openPicker(slot) {
  state.activeSlot = slot;
  $("pickerTitle").textContent = slot.startsWith("hole") ? "내 홀카드" : "커뮤니티 카드";
  renderPicker();
  $("cardPicker").showModal();
}

function chooseCard(id) {
  const card = allCards.find(c => c.id === id);
  const [group, index] = state.activeSlot.split("-");
  state[group][Number(index)] = card;
  renderSlots();
  $("cardPicker").close();
  if (state.hole.every(Boolean)) calculate();
}

function combinations(arr, count) {
  const result = [];
  function walk(start, picked) {
    if (picked.length === count) { result.push(picked.slice()); return; }
    for (let i = start; i <= arr.length - (count - picked.length); i++) {
      picked.push(arr[i]); walk(i + 1, picked); picked.pop();
    }
  }
  walk(0, []);
  return result;
}

function evaluateFive(cards) {
  const values = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const counts = {};
  values.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts).map(([v, n]) => ({ v: Number(v), n })).sort((a, b) => b.n - a.n || b.v - a.v);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const unique = [...new Set(values)];
  if (unique[0] === 14) unique.push(1);
  let straightHigh = 0;
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) { straightHigh = unique[i]; break; }
  }
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0].n === 4) return [7, groups[0].v, groups[1].v];
  if (groups[0].n === 3 && groups[1].n === 2) return [6, groups[0].v, groups[1].v];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0].n === 3) return [3, groups[0].v, ...groups.slice(1).map(g => g.v).sort((a, b) => b - a)];
  if (groups[0].n === 2 && groups[1].n === 2) {
    const pairs = [groups[0].v, groups[1].v].sort((a, b) => b - a);
    return [2, ...pairs, groups.find(g => g.n === 1).v];
  }
  if (groups[0].n === 2) return [1, groups[0].v, ...groups.slice(1).map(g => g.v).sort((a, b) => b - a)];
  return [0, ...values];
}

function compareRanks(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

function evaluate(cards) {
  let best = null;
  combinations(cards, 5).forEach(combo => {
    const rank = evaluateFive(combo);
    if (!best || compareRanks(rank, best) > 0) best = rank;
  });
  return best;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function rangeEstimate() {
  const action = $("villainAction").value;
  const stack = Math.max(1, Number($("stack").value) || 100);
  let pct = ACTION_RANGE[action] || 28;
  if (action === "allin" && stack <= 15) pct *= 1.8;
  return Math.max(3, Math.min(100, pct));
}

function rankScalar(rank) {
  return rank.reduce((sum, value, index) => sum + value / Math.pow(15, index), 0);
}

function sampleOpponentHand(deck, board, isPrimary) {
  const street = streetInfo().key;
  const action = $("villainAction").value;
  if (!isPrimary || action === "folded" || action === "checked" || action === "limp") return [deck.pop(), deck.pop()];

  const rangePct = rangeEstimate();
  const candidates = [];
  const sampleCount = street === "preflop"
    ? Math.max(2, Math.round(100 / Math.max(7, rangePct)))
    : ({ bet: 2, raise: 4, allin: 6 }[action] || 2);
  const limit = Math.min(sampleCount, Math.floor(deck.length / 2));
  for (let i = 0; i < limit; i++) {
    const a = deck[i * 2], b = deck[i * 2 + 1];
    const strength = street === "preflop" ? preflopScore([a, b]) : rankScalar(evaluate([a, b, ...board]));
    candidates.push({ a, b, strength, index: i });
  }
  candidates.sort((x, y) => y.strength - x.strength);
  const chosen = candidates[0];
  deck.splice(chosen.index * 2, 2);
  return [chosen.a, chosen.b];
}

function monteCarlo(iterations = 2600) {
  const known = [...state.hole, ...state.board].filter(Boolean);
  const remaining = allCards.filter(c => !known.some(k => k.id === c.id));
  const missingBoard = 5 - state.board.filter(Boolean).length;
  const opponentCount = Number($("players").value) - 1;
  let shares = 0;

  for (let n = 0; n < iterations; n++) {
    const deck = shuffle(remaining.slice());
    const board = [...state.board.filter(Boolean), ...deck.splice(0, missingBoard)];
    const heroRank = evaluate([...state.hole, ...board]);
    let bestOppRank = null;
    let tiedOpponents = 0;
    let heroLost = false;

    for (let o = 0; o < opponentCount; o++) {
      const opponentHand = sampleOpponentHand(deck, board, o === 0);
      const oppRank = evaluate([...opponentHand, ...board]);
      const comparison = compareRanks(oppRank, heroRank);
      if (comparison > 0) { heroLost = true; break; }
      if (comparison === 0) tiedOpponents++;
      if (!bestOppRank || compareRanks(oppRank, bestOppRank) > 0) bestOppRank = oppRank;
    }
    if (!heroLost) shares += 1 / (tiedOpponents + 1);
  }
  return shares / iterations * 100;
}

function preflopScore(cards) {
  const [a, b] = cards.slice().sort((x, y) => RANK_VALUE[y.rank] - RANK_VALUE[x.rank]);
  const high = RANK_VALUE[a.rank], low = RANK_VALUE[b.rank];
  const basePoints = { 14: 10, 13: 8, 12: 7, 11: 6, 10: 5, 9: 4.5, 8: 4, 7: 3.5, 6: 3, 5: 2.5, 4: 2, 3: 1.5, 2: 1 };
  let score = basePoints[high];
  if (a.rank === b.rank) return Math.max(5, score * 2) + high / 100;
  if (a.suit === b.suit) score += 2;
  const gap = high - low;
  if (gap === 2) score -= 1;
  else if (gap === 3) score -= 2;
  else if (gap === 4) score -= 4;
  else if (gap >= 5) score -= 5;
  if (gap <= 2 && high < 12) score += 1;
  if (high === 14 && low <= 5 && a.suit === b.suit) score += 2;
  return score + low / 100;
}

let comboScoreDistribution = null;
function handPercentile(cards) {
  if (!comboScoreDistribution) {
    comboScoreDistribution = combinations(allCards, 2).map(preflopScore).sort((a, b) => b - a);
  }
  const score = preflopScore(cards);
  const stronger = comboScoreDistribution.filter(value => value > score + .001).length;
  const equal = comboScoreDistribution.filter(value => Math.abs(value - score) <= .001).length;
  return (stronger + equal / 2) / comboScoreDistribution.length * 100;
}

function handNotation(cards) {
  const ordered = cards.slice().sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  if (ordered[0].rank === ordered[1].rank) return ordered[0].rank + ordered[1].rank;
  return ordered[0].rank + ordered[1].rank + (ordered[0].suit === ordered[1].suit ? "s" : "o");
}

function notationCards(notation) {
  const pair = notation.length === 2;
  const suited = notation.endsWith("s");
  return [
    { rank: notation[0], suit: "s" },
    { rank: notation[1], suit: pair || !suited ? "h" : "s" },
  ];
}

function currentOpenRange() {
  const zone = stackProfile().key;
  const position = $("position").value;
  const base = GTO_OPEN_RANGES[zone][position] ?? 20;
  const players = Number($("players").value);
  if (players === 2 && position === "BTN") return zone === "push" ? 72 : 88;
  if (players === 3 && position === "BTN") return zone === "push" ? 55 : 62;
  const tableAdjustment = position === "BTN" || position === "SB" ? Math.max(0, 6 - players) * 1.5 : 0;
  return Math.min(70, base + tableAdjustment);
}

function boundaryFrequency(percentile, cutoff, width = 4) {
  if (percentile <= cutoff - width / 2) return 100;
  if (percentile >= cutoff + width / 2) return 0;
  return Math.round((cutoff + width / 2 - percentile) / width * 100);
}

function normalizePolicy(entries) {
  const filtered = entries.filter(e => e.frequency > 0);
  const total = filtered.reduce((sum, e) => sum + e.frequency, 0) || 1;
  const normalized = filtered.map(e => ({ ...e, frequency: Math.round(e.frequency / total * 100) }));
  const difference = 100 - normalized.reduce((sum, e) => sum + e.frequency, 0);
  if (normalized.length) normalized[0].frequency += difference;
  return normalized.sort((a, b) => b.frequency - a.frequency);
}

function preflopPolicy(cards) {
  const percentile = handPercentile(cards);
  const target = currentOpenRange();
  const action = $("villainAction").value;
  const zone = stackProfile().key;
  if (action === "folded") {
    if (Number($("players").value) === 2 && $("position").value === "BTN" && zone !== "push") {
      if (percentile <= 42) return [{ code: "RAISE", label: "레이즈", frequency: 100 }];
      if (percentile <= 52) return normalizePolicy([{ code: "RAISE", label: "레이즈", frequency: 55 }, { code: "LIMP", label: "림프", frequency: 45 }]);
      const limp = boundaryFrequency(percentile, 88, 8);
      return normalizePolicy([{ code: "LIMP", label: "림프", frequency: limp }, { code: "FOLD", label: "폴드", frequency: 100 - limp }]);
    }
    const raise = boundaryFrequency(percentile, target, 5);
    return normalizePolicy([{ code: zone === "push" ? "ALL-IN" : "RAISE", label: zone === "push" ? "올인" : "레이즈", frequency: raise }, { code: "FOLD", label: "폴드", frequency: 100 - raise }]);
  }
  if (action === "limp") {
    const raiseCut = target * .72;
    const callCut = Math.min(72, target * 1.55);
    if (percentile <= raiseCut - 2) return [{ code: zone === "push" ? "ALL-IN" : "RAISE", label: zone === "push" ? "올인" : "레이즈", frequency: 100 }];
    if (percentile <= raiseCut + 2) {
      const raise = boundaryFrequency(percentile, raiseCut, 4);
      return normalizePolicy([{ code: "RAISE", label: "레이즈", frequency: raise }, { code: "CALL", label: "콜", frequency: 100 - raise }]);
    }
    const call = boundaryFrequency(percentile, callCut, 5);
    return normalizePolicy([{ code: "CALL", label: "콜", frequency: call }, { code: "FOLD", label: "폴드", frequency: 100 - call }]);
  }
  if (action === "raise") {
    const continueCut = Math.max(8, target * (zone === "short" || zone === "push" ? .62 : .5));
    const reraiseCut = continueCut * .34;
    if (percentile <= reraiseCut) return normalizePolicy([{ code: zone === "push" ? "ALL-IN" : "RAISE", label: zone === "push" ? "올인" : "3-bet", frequency: 82 }, { code: "CALL", label: "콜", frequency: 18 }]);
    const call = boundaryFrequency(percentile, continueCut, 4);
    return normalizePolicy([{ code: "CALL", label: "콜", frequency: call }, { code: "FOLD", label: "폴드", frequency: 100 - call }]);
  }
  if (action === "threebet") {
    const continueCut = Math.max(5, target * .23);
    const fourBetCut = continueCut * .42;
    if (percentile <= fourBetCut) return normalizePolicy([{ code: zone === "push" || zone === "short" ? "ALL-IN" : "RAISE", label: zone === "push" || zone === "short" ? "올인" : "4-bet", frequency: 78 }, { code: "CALL", label: "콜", frequency: 22 }]);
    const call = boundaryFrequency(percentile, continueCut, 3);
    return normalizePolicy([{ code: "CALL", label: "콜", frequency: call }, { code: "FOLD", label: "폴드", frequency: 100 - call }]);
  }
  const callCut = zone === "push" ? Math.max(9, target * .42) : Math.max(5, target * .25);
  const call = boundaryFrequency(percentile, callCut, 3);
  return normalizePolicy([{ code: "CALL", label: "콜", frequency: call }, { code: "FOLD", label: "폴드", frequency: 100 - call }]);
}

function actionKind(code) {
  if (["BET", "RAISE", "ALL-IN"].includes(code)) return "raise";
  if (["CALL", "CHECK", "LIMP"].includes(code)) return "call";
  return "fold";
}

function handGrade(score) {
  if (score >= 18) return "S · 프리미엄";
  if (score >= 12) return "A · 매우 강함";
  if (score >= 9) return "B · 강함";
  if (score >= 7) return "C · 플레이 가능";
  if (score >= 5) return "D · 제한적";
  return "F · 약함";
}

function handName(rank) {
  return ["하이 카드", "원 페어", "투 페어", "트리플", "스트레이트", "플러시", "풀하우스", "포카드", "스트레이트 플러시"][rank[0]];
}

function postflopAnalysis() {
  const board = state.board.filter(Boolean);
  const known = [...state.hole, ...board];
  const current = evaluate(known);
  const remaining = allCards.filter(c => !known.some(k => k.id === c.id));
  // 아웃츠는 단순 키커 변화가 아니라 족보 등급(하이카드→페어 등)이
  // 실제로 상승하는 카드만 센다. 한 카드가 여러 드로우를 완성해도 한 번만 포함된다.
  const improving = remaining.filter(card => {
    const nextRank = evaluate([...known, card]);
    const boardPairOnly = current[0] === 0 && nextRank[0] === 1 && board.some(b => b.rank === card.rank) && !state.hole.some(h => h.rank === card.rank);
    return !boardPairOnly && nextRank[0] > current[0];
  });
  let improveChance = 0;
  if (board.length === 3) {
    let improved = 0, total = 0;
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        total++;
        const future = [remaining[i], remaining[j]];
        const boardPairOnly = current[0] === 0 && future.every(card => board.some(b => b.rank === card.rank) && !state.hole.some(h => h.rank === card.rank));
        if (!boardPairOnly && evaluate([...known, ...future])[0] > current[0]) improved++;
      }
    }
    improveChance = improved / total * 100;
  } else if (board.length === 4) {
    improveChance = improving.length / remaining.length * 100;
  }
  const suitCounts = {};
  known.forEach(c => suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1);
  const maxSuit = Math.max(...Object.values(suitCounts));
  const values = [...new Set(known.map(c => RANK_VALUE[c.rank]))];
  if (values.includes(14)) values.push(1);
  let fourStraight = false;
  for (let high = 14; high >= 5; high--) {
    const window = [high, high - 1, high - 2, high - 3, high - 4];
    if (window.filter(v => values.includes(v)).length === 4) fourStraight = true;
  }
  const draws = [];
  if (maxSuit === 4 && current[0] < 5) draws.push("플러시 드로우");
  if (fourStraight && current[0] < 4) draws.push("스트레이트 드로우");
  if (!draws.length && maxSuit === 3 && board.length === 3) draws.push("백도어 가능");
  const draw = draws.length ? draws.join(" + ") : (current[0] >= 1 ? "메이드 핸드" : "뚜렷한 드로우 없음");
  const hint = board.length === 5
    ? "리버가 완성되었습니다. 상대 범위 대비 쇼다운 승률과 팟 오즈를 비교하세요."
    : `남은 ${remaining.length}장 중 다음 한 장에서 현재 족보보다 개선되는 카드는 ${improving.length}장입니다.`;
  return { rank: current, name: handName(current), outs: improving.length, improveChance, draw, hint };
}

function decide(equity, required, score, postflop = null) {
  const action = $("villainAction").value;
  const position = $("position").value;
  const call = Math.max(0, Number($("callAmount").value) || 0);
  const stack = Math.max(1, Number($("stack").value) || 100);
  if (postflop) {
    const edge = equity - required;
    const made = postflop.rank[0];
    const latePosition = ["CO", "BTN"].includes(position);
    let result;
    if (action === "checked") {
      if (equity >= 65 || made >= 3) result = ["BET", "밸류 베팅", "강한 메이드 핸드와 승률 우위로 팟을 키울 수 있습니다.", "↑"];
      else if (equity >= 48 && (postflop.outs >= 8 || latePosition)) result = ["BET", "세미 블러프 베팅", "충분한 에퀴티와 폴드 에퀴티를 함께 노릴 수 있습니다.", "↑"];
      else result = ["CHECK", "체크", "얇은 밸류보다 팟을 통제하고 다음 카드를 보는 편이 안정적입니다.", "→"];
    } else if (action === "bet" || action === "raise") {
      if (equity >= 72 && made >= 2) result = ["RAISE", "밸류 레이즈", "현재 승률과 완성 족보가 강해 추가 밸류를 얻을 수 있습니다.", "↑"];
      else if (edge >= 5) result = ["CALL", "콜", "예상 승률이 팟 오즈의 손익분기점을 충분히 넘습니다.", "✓"];
      else if (edge >= 0 && call <= stack * .1) result = ["CALL", "마지널 콜", "수학적으로는 가능하지만 우위가 작아 다음 거리에서 신중해야 합니다.", "✓"];
      else result = ["FOLD", "폴드", "상대 베팅 크기에 비해 현재 에퀴티가 부족합니다.", "×"];
    } else {
      if (edge >= 7 && (made >= 2 || equity >= 60)) result = ["CALL", "올인 콜", "쇼다운 승률이 필요한 기준을 의미 있게 넘습니다.", "✓"];
      else result = ["FOLD", "올인 폴드", "현재 패와 드로우를 감안해도 올인 콜 기준에 미치지 못합니다.", "×"];
    }
    return { code: result[0], label: result[1], headline: result[2], icon: result[3], inRange: null };
  }
  const threshold = RANGE_DATA[position].threshold + (ACTION_TIGHTEN[action] || 0);
  const inRange = score >= threshold;
  const edge = equity - required;
  let result;

  if (action === "folded" || action === "limp") {
    if (inRange && score >= threshold + 12) result = ["RAISE", "레이즈", "강한 범위로 밸류를 확보하세요.", "↑"];
    else if (inRange) result = ["RAISE", action === "limp" ? "아이솔레이션 레이즈" : "오픈 레이즈", "포지션 기본 범위 안에 있어 주도권을 잡기 좋습니다.", "↑"];
    else result = ["FOLD", "폴드", "현재 포지션의 기본 참가 범위보다 약합니다.", "×"];
  } else if (action === "raise" || action === "threebet") {
    if (score >= threshold + 12 && equity > required + 12) result = ["RE-RAISE", "리레이즈", "범위 상단이며 충분한 에퀴티 우위가 있습니다.", "↑"];
    else if (edge >= 5 && inRange) result = ["CALL", "콜", "필요 승률을 여유 있게 넘고 방어 범위 안에 있습니다.", "✓"];
    else if (edge >= 0 && call <= stack * .12) result = ["CALL", "신중한 콜", "수학적으로는 콜 가능하지만 우위가 작아 포스트플랍 주의가 필요합니다.", "✓"];
    else result = ["FOLD", "폴드", "상대의 강한 액션에 비해 승률 또는 핸드 범위가 부족합니다.", "×"];
  } else {
    if (edge >= 8 && (call <= stack * .55 || equity >= 58)) result = ["CALL", "올인 콜", "필요 승률보다 예상 승률이 충분히 높습니다.", "✓"];
    else result = ["FOLD", "올인 폴드", "분산이 큰 상황이며 현재 추정 승률이 손익분기점을 넘지 못합니다.", "×"];
  }
  return { code: result[0], label: result[1], headline: result[2], icon: result[3], inRange, threshold };
}

function updatePotOdds() {
  const pot = Math.max(0, Number($("pot").value) || 0);
  const noCallNeeded = ["folded", "checked"].includes($("villainAction").value);
  const call = noCallNeeded ? 0 : Math.max(0, Number($("callAmount").value) || 0);
  const required = call === 0 ? 0 : call / (pot + call) * 100;
  $("potOddsValue").textContent = required.toFixed(1) + "%";
  $("oddsBar").style.width = Math.min(100, required) + "%";
  $("potOddsNote").textContent = call ? `${call}BB 콜 / 최종 팟 ${pot + call}BB` : "체크 가능 · 콜 비용 없음";
  return required;
}

function stackProfile() {
  const stack = Math.max(1, Number($("stack").value) || 100);
  if (stack <= 10) return { key: "push", name: "푸시/폴드", advice: "작은 SPR: 선제 올인과 강한 콜 범위가 중요합니다", realization: .98 };
  if (stack <= 20) return { key: "short", name: "숏 스택", advice: "레이즈 후 커밋되기 쉬워 프리플랍 선택이 중요합니다", realization: .94 };
  if (stack <= 40) return { key: "medium", name: "미들 스택", advice: "탑페어 가치가 높고 큰 블러프는 줄어듭니다", realization: .9 };
  if (stack <= 100) return { key: "standard", name: "스탠다드", advice: "밸류와 드로우의 균형을 잡기 좋은 구간입니다", realization: .86 };
  return { key: "deep", name: "딥 스택", advice: "넛 우위와 포지션이 더 중요해집니다", realization: .8 };
}

function updateStackZone() {
  const stack = Math.max(1, Number($("stack").value) || 100);
  const zone = stackProfile();
  $("stackZone").textContent = `${zone.name} · ${stack}BB`;
  $("stackAdvice").textContent = zone.advice;
}

function estimateFoldProbability(street, aggressiveRisk) {
  const pot = Math.max(1, Number($("pot").value) || 1);
  const risk = Math.max(.01, aggressiveRisk);
  // 균형 상태에서 제로 에퀴티 블러프를 무차별하게 만드는 총 폴드 빈도.
  let equilibriumFold = risk / (pot + risk);
  if (street === "preflop") equilibriumFold *= .9;
  if (Number($("players").value) > 2) equilibriumFold *= .82;
  return Math.max(.08, Math.min(.72, equilibriumFold));
}

function actionEVs(equity, street) {
  const e = equity / 100;
  const pot = Math.max(0, Number($("pot").value) || 0);
  const call = Math.max(0, Number($("callAmount").value) || 0);
  const stack = Math.max(1, Number($("stack").value) || 100);
  const customRisk = Math.min(stack, Math.max(.5, Number($("raiseSize").value) || 0));
  const rake = $("gameType").value === "cash" ? Math.max(0, Math.min(10, Number($("rake").value) || 0)) / 100 : 0;
  const action = $("villainAction").value;
  const facingBet = ["bet", "raise", "threebet", "allin"].includes(action) && call > 0;
  const canCall = facingBet || (action === "limp" && call > 0);
  const offersShove = stack <= 40 || action === "allin" || stackProfile().key === "push";
  const rows = [];
  const add = (code, label, ev, detail, size = null) => rows.push({ code, label, ev, detail, size });

  if (canCall) add("FOLD", "폴드", 0, "추가 투자 없음");
  if (canCall) {
    const callRisk = Math.min(call, stack);
    const callEV = e * (pot + callRisk) * (1 - rake) - callRisk;
    add("CALL", callRisk >= stack ? "올인 콜" : "콜", callEV, `손익분기 ${((callRisk / (pot + callRisk)) * 100).toFixed(1)}%`, callRisk);
  }

  if (action === "checked") {
    const checkEV = e * pot * (1 - rake) * stackProfile().realization;
    add("CHECK", "체크", checkEV, `에퀴티 실현율 ${(stackProfile().realization * 100).toFixed(0)}%`);
  }
  if (street === "preflop" && action === "limp" && call === 0) {
    const checkEV = e * pot * (1 - rake) * stackProfile().realization;
    add("CHECK", "체크", checkEV, "BB에서 추가 비용 없이 플랍 확인");
  }
  if (street === "preflop" && action === "folded" && Number($("players").value) === 2 && $("position").value === "BTN") {
    const limpCost = Math.min(.5, stack);
    const limpEV = e * (pot + limpCost) * (1 - rake) * stackProfile().realization - limpCost;
    add("LIMP", "림프", limpEV, `0.5BB 추가 · 실현율 ${(stackProfile().realization * 100).toFixed(0)}%`, limpCost);
  }
  if (street === "preflop" && (action === "folded" || (action === "limp" && !canCall))) add("FOLD", "폴드", 0, "블라인드 외 추가 투자 없음");

  const addAggressive = (risk) => {
    if (risk <= 0 || risk >= stack || action === "allin") return;
    const fold = estimateFoldProbability(street, risk);
    const opponentCall = facingBet ? Math.max(0, risk - call) : risk;
    const showdownEV = e * (pot + risk + opponentCall) * (1 - rake) - risk;
    const aggressiveEV = fold * pot + (1 - fold) * showdownEV;
    const label = facingBet ? "레이즈" : (street === "preflop" ? "레이즈" : "베팅");
    const aggressiveCode = facingBet || street === "preflop" ? "RAISE" : "BET";
    add(aggressiveCode, `${label} ${risk.toFixed(1).replace(".0", "")}BB`, aggressiveEV, `균형 폴드 ${(fold * 100).toFixed(0)}%`, risk);
  };

  if (street === "preflop") {
    const openSize = stack <= 20 ? 2 : 2.5;
    const sizes = facingBet
      ? [Math.min(stack, Math.max(customRisk, call * 2.5)), Math.min(stack, call * 3)]
      : action === "limp" ? [Math.min(stack, Math.max(3.5, customRisk))] : [Math.min(stack, openSize)];
    [...new Set(sizes.map(v => Number(v.toFixed(1))))].forEach(size => addAggressive(size));
  } else if (action !== "allin") {
    const basePot = Math.max(1, pot);
    const sizes = facingBet
      ? [Math.min(stack, Math.max(customRisk, call * 2.5)), Math.min(stack, call * 3.5)]
      : [Math.min(stack, basePot * .33), Math.min(stack, basePot * .67), Math.min(stack, basePot), customRisk];
    [...new Set(sizes.map(v => Number(v.toFixed(1))))].forEach(size => addAggressive(size));
  }

  if (offersShove) {
    const shoveRisk = stack;
    const fold = action === "allin" ? 0 : estimateFoldProbability(street, shoveRisk) * .8;
    const opponentCall = facingBet ? Math.max(0, shoveRisk - call) : shoveRisk;
    const showdownEV = e * (pot + shoveRisk + opponentCall) * (1 - rake) - shoveRisk;
    add("ALL-IN", "올인", fold * pot + (1 - fold) * showdownEV, `폴드 추정 ${(fold * 100).toFixed(0)}%`, shoveRisk);
  }

  const unique = rows.filter((row, index) => rows.findIndex(other => other.code === row.code && other.label === row.label) === index);
  return unique.sort((a, b) => b.ev - a.ev);
}

function assignGtoFrequencies(rows, street) {
  rows.forEach(row => row.frequency = 0);
  const desired = street === "preflop" ? preflopPolicy(state.hole) : null;
  const pot = Math.max(1, Number($("pot").value) || 1);

  if (desired) {
    desired.forEach(strategy => {
      let candidates = rows.filter(row => row.code === strategy.code);
      if (!candidates.length && strategy.code === "ALL-IN") candidates = rows.filter(row => row.code === "RAISE");
      if (!candidates.length && strategy.code === "RAISE") candidates = rows.filter(row => row.code === "ALL-IN");
      if (!candidates.length) return;
      const bestEV = Math.max(...candidates.map(row => row.ev));
      const temperature = Math.max(.2, pot * .035);
      const weights = candidates.map(row => Math.exp((row.ev - bestEV) / temperature));
      const total = weights.reduce((sum, value) => sum + value, 0);
      candidates.forEach((row, index) => row.frequency += strategy.frequency * weights[index] / total);
    });
  } else {
    const bestEV = rows[0]?.ev ?? 0;
    const temperature = Math.max(.22, pot * .055);
    const weights = rows.map(row => row.ev < bestEV - temperature * 7 ? 0 : Math.exp((row.ev - bestEV) / temperature));
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    rows.forEach((row, index) => row.frequency = weights[index] / total * 100);
  }

  const rounded = rows.map(row => Math.round(row.frequency));
  const difference = 100 - rounded.reduce((sum, value) => sum + value, 0);
  if (rows.length) rows[0].frequency = rounded[0] + difference;
  rows.slice(1).forEach((row, index) => row.frequency = rounded[index + 1]);
  rows.sort((a, b) => b.frequency - a.frequency || b.ev - a.ev);
  return rows;
}

function renderEVs(rows, iterations) {
  const best = rows[0];
  $("mixBar").innerHTML = rows.filter(row => row.frequency >= 2).map(row => {
    const kind = actionKind(row.code);
    const cssKind = kind === "raise" ? "raise" : row.code === "CHECK" ? "check" : kind;
    return `<div class="mix-segment ${cssKind}" style="width:${row.frequency}%" aria-label="${row.label} ${row.frequency}%">${row.frequency >= 9 ? `${row.label} ${row.frequency}%` : ""}</div>`;
  }).join("");
  $("evTable").innerHTML = rows.map((row, index) => `
    <div class="ev-row ${index === 0 ? "best" : ""}">
      <div><span>${row.code}</span><strong>${row.label}</strong><small>GTO 빈도 ${row.frequency}% · ${row.detail}</small></div>
      <b class="${row.ev >= 0 ? "positive" : "negative"}">${row.ev >= 0 ? "+" : ""}${row.ev.toFixed(2)} BB</b>
      <i style="width:${Math.max(3, Math.min(100, 50 + row.ev * 8))}%"></i>
    </div>`).join("");
  const fold = best ? estimateFoldProbability(streetInfo().key, best.size || 0) : 0;
  $("rangeEstimate").textContent = `상위 ${rangeEstimate().toFixed(0)}% · 균형 범위`;
  $("foldEstimate").textContent = best && ["BET", "RAISE", "ALL-IN"].includes(best.code) ? `MDF ${(100 - fold * 100).toFixed(0)}%` : "해당 없음";
  $("simulationCount").textContent = `${iterations.toLocaleString()}회`;
}

function calculate() {
  const required = updatePotOdds();
  updateActiveRange();
  const street = streetInfo();
  updateStreetUI();
  if (!state.hole.every(Boolean) || !street.valid) return;

  $("calculateBtn").textContent = "계산 중…";
  requestAnimationFrame(() => setTimeout(() => {
    const players = Number($("players").value);
    const iterations = players >= 7 ? 1600 : players >= 5 ? 2100 : 3200;
    const equity = monteCarlo(iterations);
    state.equity = equity;
    const score = preflopScore(state.hole);
    const postflop = street.key === "preflop" ? null : postflopAnalysis();
    const evRows = assignGtoFrequencies(actionEVs(equity, street.key), street.key);
    const best = evRows[0];
    const second = evRows[1];
    const decision = {
      code: best.code,
      label: best.label,
      headline: `균형 전략에서 ${best.frequency}% · EV ${best.ev >= 0 ? "+" : ""}${best.ev.toFixed(2)}BB`,
      icon: ["BET", "RAISE", "ALL-IN"].includes(best.code) ? "↑" : best.code === "FOLD" ? "×" : best.code === "CHECK" ? "→" : "✓",
      inRange: street.key === "preflop" ? handPercentile(state.hole) <= currentOpenRange() : null,
    };
    const edge = equity - required;
    const board = state.board.filter(Boolean);
    const currentRank = board.length >= 3 ? evaluate([...state.hole, ...board]) : null;

    $("equityValue").textContent = equity.toFixed(1) + "%";
    $("equityBar").style.width = equity + "%";
    $("equityNote").textContent = `${players}인 · 상대 액션 범위 반영`;
    $("edgeValue").textContent = (edge >= 0 ? "+" : "") + edge.toFixed(1) + "%p";
    $("edgeValue").className = edge >= 0 ? "positive" : "negative";
    $("edgeNote").textContent = edge >= 0 ? "수학적 콜 기준 충족" : "수학적 콜 기준 미달";

    $("actionLabel").textContent = decision.code;
    $("actionHeadline").textContent = decision.label;
    $("actionExplanation").textContent = `${decision.headline}. ${best.detail}. 상대 범위와 폴드 확률은 입력한 액션·성향·인원에 따라 추정됩니다.`;
    $("actionIcon").textContent = decision.icon;
    const frequencyGap = second ? best.frequency - second.frequency : best.frequency;
    $("confidenceBadge").textContent = best.frequency >= 90 ? "순수 전략" : frequencyGap >= 40 ? "주력 전략" : "혼합 전략";
    $("handGrade").textContent = postflop ? `${postflop.name} · ${postflop.draw}` : handGrade(score);
    $("rangeStatus").textContent = postflop ? (edge >= 0 ? "팟 오즈 충족" : "팟 오즈 미달") : (decision.inRange ? "기본 범위 안" : "기본 범위 밖");
    $("madeHand").textContent = currentRank ? handName(currentRank) : "프리플랍";
    updateStreetUI(postflop);
    renderEVs(evRows, iterations);
    $("modelBadge").textContent = $("gameType").selectedOptions[0].text.replace("캐시게임 · ", "GTO 근사 · ").replace("토너먼트 · ", "GTO 근사 · ");
    $("heroAction").textContent = decision.label;
    $("heroReason").textContent = `예상 승률 ${equity.toFixed(1)}% · 필요 승률 ${required.toFixed(1)}%`;
    $("calculateBtn").innerHTML = `다시 분석하기 <span>→</span>`;
  }, 30));
}

function reset() {
  state.hole = [null, null]; state.board = [null, null, null, null, null]; state.equity = null;
  $("position").value = "BTN"; $("players").value = "2"; $("villainAction").value = "folded";
  $("gameType").value = "cash"; $("rake").value = "0";
  $("pot").value = "6"; $("callAmount").value = "2"; $("stack").value = "100"; $("raiseSize").value = "4";
  updatePositionOptions();
  renderSlots(); updateActiveRange(); updatePotOdds();
  updateStreetUI();
  updateStackZone();
  $("equityValue").textContent = "—"; $("equityBar").style.width = "0";
  $("edgeValue").textContent = "—"; $("edgeValue").className = "";
  $("actionLabel").textContent = "홀카드를 선택해 주세요"; $("actionHeadline").textContent = "상황에 맞는 액션을 계산합니다.";
  $("actionExplanation").textContent = "추천은 균형 프리플랍 범위, 쇼다운 에퀴티, MDF, 액션 EV와 유효 스택을 함께 반영합니다.";
  $("actionIcon").textContent = "?"; $("confidenceBadge").textContent = "분석 대기";
  $("handGrade").textContent = "—"; $("rangeStatus").textContent = "—"; $("madeHand").textContent = "—";
  $("heroAction").textContent = "카드를 선택하세요"; $("heroReason").textContent = "홀카드 2장을 먼저 입력해 주세요.";
  $("evTable").innerHTML = '<div class="ev-empty">카드를 선택하면 가능한 액션의 EV를 비교합니다.</div>';
  $("mixBar").innerHTML = "";
  $("rangeEstimate").textContent = "—"; $("foldEstimate").textContent = "—"; $("simulationCount").textContent = "—";
}

document.querySelectorAll("[data-slot]").forEach(btn => btn.addEventListener("click", () => openPicker(btn.dataset.slot)));
$("cardGrid").addEventListener("click", e => { const btn = e.target.closest("[data-card]"); if (btn) chooseCard(btn.dataset.card); });
$("closePicker").addEventListener("click", () => $("cardPicker").close());
$("calculateBtn").addEventListener("click", calculate);
$("resetBtn").addEventListener("click", reset);
["position", "players", "gameType", "rake", "villainAction", "pot", "callAmount", "stack", "raiseSize"].forEach(id => {
  $(id).addEventListener("change", () => { if (id === "players") updatePositionOptions(); updatePotOdds(); updateActiveRange(); updateStackZone(); if (state.hole.every(Boolean)) calculate(); });
});

updatePositionOptions();
renderRanges();
renderSlots();
updatePotOdds();
updateStreetUI();
updateStackZone();

let deferredInstallPrompt = null;
const installButton = $("installBtn");
const installDialog = $("installDialog");

function openInstallGuide() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isFile = location.protocol === "file:";
  let steps;
  if (isFile) {
    steps = [
      "현재 파일 주소는 이 PC에서만 열립니다.",
      "같은 Wi-Fi 테스트는 start-mobile.cmd를 실행한 뒤 표시되는 모바일 주소로 접속하세요.",
      "홈 화면 설치와 오프라인 기능은 HTTPS 웹주소로 배포한 뒤 사용할 수 있습니다."
    ];
  } else if (isIOS) {
    steps = [
      "Safari 하단의 공유 버튼을 누르세요.",
      "메뉴에서 ‘홈 화면에 추가’를 선택하세요.",
      "오른쪽 위 ‘추가’를 누르면 앱처럼 실행됩니다."
    ];
  } else {
    steps = [
      "브라우저 메뉴(⋮)를 여세요.",
      "‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.",
      "설치를 확인하면 홈 화면에서 전체 화면으로 실행됩니다."
    ];
  }
  $("installGuide").innerHTML = steps.map((step, index) => `<div class="install-step"><b>${index + 1}</b><span>${step}</span></div>`).join("") +
    (isFile ? '<p class="install-note">파일을 휴대폰으로 복사하는 방식보다 HTTPS 배포를 권장합니다.</p>' : "");
  installDialog.showModal();
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.textContent = "앱 설치";
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    openInstallGuide();
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

$("closeInstallDialog").addEventListener("click", () => installDialog.close());
window.addEventListener("appinstalled", () => { installButton.hidden = true; });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
