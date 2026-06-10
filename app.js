/**
 * CarbonWise AI — Main Application Controller
 * =============================================
 * Phase 6: Full integration of all engine modules, state management,
 * DOM orchestration, localStorage persistence, and test/health display.
 *
 * Architecture:
 *   - appState   : Single source of truth for all runtime data.
 *   - elements   : Cached DOM references, queried exactly once on startup.
 *   - Event model: Delegated listeners on container elements, not individual fields.
 *   - Rendering  : All DOM mutations go through safeCreateElement() or textContent.
 *                  innerHTML is never used with user-sourced data.
 *
 * Entry point: initializeApp() fires after DOMContentLoaded.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import {
  calculateTransportFootprint,
  calculateEnergyFootprint,
  calculateDietFootprint,
  calculateWasteFootprint,
  calculateTotalFootprint,
  calculateEcoScore
} from './engine/calculations.js';

import {
  generateRecommendations,
  generateCarbonInsight
} from './engine/recommendations.js';

import {
  sanitizeInput,
  validateNumber,
  formatCarbon,
  safeCreateElement,
  debounce,
  getEcoLevel
} from './engine/utils.js';

import {
  runTests,
  generateSystemHealth
} from './tests/test.js';

import {
  INPUT_BOUNDS,
  ECO_LEVELS
} from './config/emissionFactors.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. CENTRALIZED APPLICATION STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single source of truth for the entire application.
 * All reads and writes flow through this object — never the DOM directly.
 * @type {Object}
 */
const appState = {
  /** Raw user inputs collected from the questionnaire form. */
  inputs: {
    // Transport
    carKm:             0,
    fuelEfficiency:    12,
    fuelType:          'gasoline',
    transitKm:         0,
    flightHoursShort:  0,
    flightHoursLong:   0,
    // Energy
    electricityKwh:    0,
    gasKwh:            0,
    cleanEnergyOffset: 0,
    // Diet
    dietType:          'average-meat',
    foodWaste:         0,
    // Waste
    recyclingRate:     0
  },

  /** Simulation override percentages (0–100) for each action slider. */
  simulations: {
    transportReduce:      0,
    cleanEnergyIncrease:  0,
    meatfreeDays:         0,
    recyclingIncrease:    0
  },

  /** Computed footprint results (populated by updateDashboard). */
  results: {
    footprint:           null,   // Object from calculateTotalFootprint()
    ecoScore:            null,   // Object from calculateEcoScore()
    recommendations:     [],     // Array from generateRecommendations()
    insight:             null    // Object from generateCarbonInsight()
  },

  /** Previous assessment loaded from localStorage for delta comparison. */
  previousAssessment: null,

  /** UI-only state that does not affect calculations. */
  ui: {
    isDarkMode:       true,
    isHighContrast:   false,
    isTestPanelOpen:  false
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. DOM CACHE — queried exactly once, never re-queried
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cached references to every interactive and output DOM node.
 * Use this object everywhere; never call document.getElementById again.
 * @type {Object}
 */
const elements = {
  // ── Layout
  body:                  document.body,

  // ── Theme Controls
  themeToggle:           document.getElementById('theme-toggle'),
  contrastToggle:        document.getElementById('contrast-toggle'),

  // ── System Health Pill (header)
  healthPill:            document.getElementById('header-health-status'),

  // ── Input Form (delegation target)
  form:                  document.getElementById('calculator-form'),

  // ── Footprint Output
  metricTotalVal:        document.getElementById('metric-total-value'),
  metricUnit:            document.querySelector('#metric-total-value + .metric-unit'),
  footprintDesc:         document.getElementById('footprint-level-desc'),

  // ── Eco Score Output
  ecoScoreVal:           document.getElementById('eco-score-value'),
  ecoLevelBadge:         document.getElementById('eco-level-badge'),

  // ── Personalized Insight
  insightText:           document.getElementById('insight-text'),

  // ── Chart container (SVG — phase 7)
  svgChart:              document.getElementById('dashboard-svg'),

  // ── Simulator Controls (delegation target wrapper)
  simulatorList:         document.getElementById('simulator-list'),

  // ── Simulator value labels
  valTransportReduce:    document.getElementById('val-sim-transport-reduce'),
  valCleanEnergy:        document.getElementById('val-sim-clean-energy'),
  valMeatlessDays:       document.getElementById('val-sim-meatless-days'),
  valRecyclingIncrease:  document.getElementById('val-sim-recycling-increase'),

  // ── Projected output card
  projectedTotalVal:     document.getElementById('projected-total-val'),
  projectedSavingsVal:   document.getElementById('projected-savings-val'),
  projectedScoreVal:     document.getElementById('projected-score-val'),

  // ── Recommendations area (will be injected into dashboard panel)
  recommendationsList:   document.getElementById('recommendations-list'),

  // ── Testing & Health Drawer
  btnToggleTests:        document.getElementById('btn-toggle-tests'),
  testPanelBody:         document.getElementById('test-panel-body'),
  btnRunTests:           document.getElementById('btn-run-tests'),
  testLog:               document.getElementById('test-log'),
  testPassedCount:       document.getElementById('test-passed-count'),
  testFailedCount:       document.getElementById('test-failed-count'),
  testLatencyVal:        document.getElementById('test-latency-val'),

  // ── Health Check Status Icons
  statusCalc:            document.getElementById('status-calculations'),
  statusInputs:          document.getElementById('status-inputs'),
  statusRecs:            document.getElementById('status-recommendations'),
  statusA11y:            document.getElementById('status-accessibility'),
  statusSecurity:        document.getElementById('status-security'),

  // ── Previous Assessment section
  previousSection:       document.getElementById('previous-assessment-section')
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOCAL STORAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'carbonwise_last_assessment';

/**
 * Serialises the current inputs and results to localStorage.
 * Wraps JSON.stringify in a try/catch to handle storage quota errors.
 */
function saveAssessmentToStorage() {
  try {
    const payload = {
      savedAt:  new Date().toISOString(),
      inputs:   { ...appState.inputs },
      totalKg:  appState.results.footprint?.totalKg  ?? 0,
      totalTons: appState.results.footprint?.totalTons ?? 0,
      ecoScore: appState.results.ecoScore?.score      ?? null
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable (private browsing quota); fail silently.
  }
}

/**
 * Loads a previous assessment from localStorage.
 * Returns null if nothing is stored or the data is malformed.
 * @returns {Object|null}
 */
function loadAssessmentFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Minimal structural validation before trusting stored data
    if (typeof parsed.totalKg !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. INPUT COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads every input field from the questionnaire form, validates numeric
 * values against their configured bounds, and writes the cleaned values
 * back into appState.inputs.
 *
 * Called once on startup and again via the debounced form listener.
 */
function collectInputs() {
  const f = elements.form;
  if (!f) return;

  // ── Transport
  appState.inputs.carKm            = validateNumber(f.carKm?.value,            INPUT_BOUNDS.carKm.min,            INPUT_BOUNDS.carKm.max);
  appState.inputs.fuelEfficiency   = validateNumber(f.fuelEfficiency?.value,   INPUT_BOUNDS.fuelEfficiency.min,   INPUT_BOUNDS.fuelEfficiency.max)  || 12;
  appState.inputs.fuelType         = sanitizeInput(f.fuelType?.value)          || 'gasoline';
  appState.inputs.transitKm        = validateNumber(f.transitKm?.value,        INPUT_BOUNDS.transitKm.min,        INPUT_BOUNDS.transitKm.max);
  appState.inputs.flightHoursShort = validateNumber(f.flightHoursShort?.value, INPUT_BOUNDS.flightHoursShort.min, INPUT_BOUNDS.flightHoursShort.max);
  appState.inputs.flightHoursLong  = validateNumber(f.flightHoursLong?.value,  INPUT_BOUNDS.flightHoursLong.min,  INPUT_BOUNDS.flightHoursLong.max);

  // ── Energy
  appState.inputs.electricityKwh   = validateNumber(f.electricityKwh?.value,   INPUT_BOUNDS.electricityKwh.min,   INPUT_BOUNDS.electricityKwh.max);
  appState.inputs.gasKwh           = validateNumber(f.gasKwh?.value,           INPUT_BOUNDS.gasKwh.min,           INPUT_BOUNDS.gasKwh.max);
  appState.inputs.cleanEnergyOffset = validateNumber(f.cleanEnergyOffset?.value, INPUT_BOUNDS.cleanEnergyOffset.min, INPUT_BOUNDS.cleanEnergyOffset.max);

  // ── Diet
  appState.inputs.dietType         = sanitizeInput(f.dietType?.value)          || 'average-meat';
  appState.inputs.foodWaste        = validateNumber(f.foodWaste?.value,        INPUT_BOUNDS.foodWaste.min,        INPUT_BOUNDS.foodWaste.max);

  // ── Waste
  appState.inputs.recyclingRate    = validateNumber(f.recyclingRate?.value,     INPUT_BOUNDS.recyclingRate.min,    INPUT_BOUNDS.recyclingRate.max);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SIMULATION INPUT COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads all four simulator range sliders and writes their 0–100 values
 * into appState.simulations, then updates the visible percentage labels.
 */
function collectSimulationInputs() {
  const sliders = elements.simulatorList?.querySelectorAll('input[type="range"]');
  if (!sliders) return;

  sliders.forEach(slider => {
    const val = validateNumber(slider.value, 0, 100);
    switch (slider.id) {
      case 'sim-transport-reduce':    appState.simulations.transportReduce     = val; break;
      case 'sim-clean-energy':        appState.simulations.cleanEnergyIncrease = val; break;
      case 'sim-meatless-days':       appState.simulations.meatfreeDays        = val; break;
      case 'sim-recycling-increase':  appState.simulations.recyclingIncrease   = val; break;
    }
  });

  // Refresh visible labels and aria-valuetext for screen reader context
  if (elements.valTransportReduce)   elements.valTransportReduce.textContent  = `${appState.simulations.transportReduce}%`;
  if (elements.valCleanEnergy)       elements.valCleanEnergy.textContent      = `${appState.simulations.cleanEnergyIncrease}%`;
  if (elements.valMeatlessDays)      elements.valMeatlessDays.textContent     = `${appState.simulations.meatfreeDays}%`;
  if (elements.valRecyclingIncrease) elements.valRecyclingIncrease.textContent = `${appState.simulations.recyclingIncrease}%`;

  // aria-valuetext: announces the full label + value to screen readers instead
  // of only the raw numeric value (e.g. "40" becomes "Reduce driving distance: 40%")
  const sliderLabels = {
    'sim-transport-reduce':   'Reduce driving distance',
    'sim-clean-energy':       'Increase clean energy adoption',
    'sim-meatless-days':      'Introduce meat-free days',
    'sim-recycling-increase': 'Improve recycling rate'
  };
  sliders.forEach(slider => {
    const label = sliderLabels[slider.id];
    if (label) slider.setAttribute('aria-valuetext', `${label}: ${validateNumber(slider.value, 0, 100)}%`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PROJECTED FOOTPRINT (Simulation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a simulated copy of the current inputs adjusted by slider percentages,
 * then runs the full calculation pipeline to produce a projected footprint.
 *
 * Each slider models one independent habit reduction applied as a percentage
 * of the relevant input value.
 *
 * @returns {{ footprint: Object, ecoScore: Object }}
 */
function computeProjectedFootprint() {
  const s = appState.simulations;
  const i = appState.inputs;

  // Build a projected input copy — real inputs are never mutated
  const projectedInputs = {
    ...i,
    // Reduce car driving by transportReduce %
    carKm:             i.carKm * (1 - s.transportReduce / 100),
    // Boost clean energy adoption by cleanEnergyIncrease % (capped at 100%)
    cleanEnergyOffset: Math.min(100, i.cleanEnergyOffset + s.cleanEnergyIncrease),
    // Model meatless days as moving diet one tier greener, scaled by slider
    // (approximated: 1% reduction per slider % as a continuous proxy)
    foodWaste:         i.foodWaste * (1 - s.meatfreeDays / 100),
    // Improve recycling rate by recyclingIncrease % (capped at 100%)
    recyclingRate:     Math.min(100, i.recyclingRate + s.recyclingIncrease)
  };

  const footprint = calculateTotalFootprint(projectedInputs);
  const ecoScore  = calculateEcoScore(footprint.totalTons);
  return { footprint, ecoScore };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DASHBOARD RENDERING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the total footprint metric card (top-left of analysis panel).
 * @param {Object} footprint - Result from calculateTotalFootprint().
 */
function renderFootprintCard(footprint) {
  if (!footprint) return;
  const formatted = formatCarbon(footprint.totalKg);

  if (elements.metricTotalVal) {
    elements.metricTotalVal.textContent = formatted.display;
  }
  if (elements.metricUnit) {
    elements.metricUnit.textContent = formatted.unit;
  }

  // Status description based on raw ton value
  const tons = footprint.totalTons;
  let desc = '';
  if (tons <= 2)       desc = '🌱 Excellent — well below global average';
  else if (tons <= 5)  desc = '✅ Good — near or below average';
  else if (tons <= 9)  desc = '⚠️ Moderate — room for improvement';
  else if (tons <= 14) desc = '🔴 High — significantly above average';
  else                 desc = '🚨 Very High — urgent action recommended';

  if (elements.footprintDesc) {
    elements.footprintDesc.textContent = desc;
  }
}

/**
 * Renders the Eco Score card with score value and level badge.
 * @param {Object} ecoScore - Result from calculateEcoScore().
 */
function renderEcoScoreCard(ecoScore) {
  if (!ecoScore) return;

  if (elements.ecoScoreVal) {
    elements.ecoScoreVal.textContent = String(ecoScore.score);
  }

  if (elements.ecoLevelBadge) {
    elements.ecoLevelBadge.textContent = ecoScore.level;
    // Remove all existing level-* classes before applying the new one
    elements.ecoLevelBadge.className = `level-badge ${ecoScore.cssClass}`;
  }
}

/**
 * Renders the personalised carbon insight paragraph.
 * @param {Object} insight - Result from generateCarbonInsight().
 */
function renderInsightCard(insight) {
  if (!insight || !elements.insightText) return;

  if (insight.percentage === 0) {
    elements.insightText.textContent = 'Complete the lifestyle questionnaire to receive targeted insights.';
    elements.insightText.className   = 'insight-text-placeholder';
  } else {
    elements.insightText.textContent = insight.insight;
    elements.insightText.className   = 'insight-text-content';
  }
}

/**
 * Renders the sorted recommendation cards using safeCreateElement() exclusively.
 * Falls back to an empty-state message when no recommendations are active.
 * @param {Array} recommendations - Array from generateRecommendations().
 */
function renderRecommendationsList(recommendations) {
  const container = elements.recommendationsList;
  if (!container) return;

  // Clear existing cards safely (no innerHTML wipe)
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (!recommendations || recommendations.length === 0) {
    const empty = safeCreateElement('p', 'rec-empty-state', 'No recommendations at this time — great work!');
    container.appendChild(empty);
    return;
  }

  // Render top 5 recommendations to avoid overwhelming the panel
  const topRecs = recommendations.slice(0, 5);

  topRecs.forEach((rec, index) => {
    const card   = safeCreateElement('article', 'rec-card');
    card.setAttribute('aria-label', `Recommendation ${index + 1}: ${rec.title}`);

    // Header row: title + impact badge
    const header = safeCreateElement('div', 'rec-header');
    const title  = safeCreateElement('h4', 'rec-title', rec.title);
    const impact = safeCreateElement('span', `rec-badge impact-${rec.impact.toLowerCase()}`, rec.impact);
    header.appendChild(title);
    header.appendChild(impact);

    // Description
    const desc = safeCreateElement('p', 'rec-desc', rec.description);

    // Meta row: savings + difficulty
    const meta      = safeCreateElement('div', 'rec-meta');
    const savingsFmt = formatCarbon(rec.estimatedSavingsKg);
    const savings   = safeCreateElement('span', 'rec-savings',    `💚 Save ~${savingsFmt.display} ${savingsFmt.unit}`);
    const difficulty = safeCreateElement('span', `rec-difficulty diff-${rec.difficulty.toLowerCase()}`, `⚙️ ${rec.difficulty}`);
    meta.appendChild(savings);
    meta.appendChild(difficulty);

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(meta);
    container.appendChild(card);
  });
}

/**
 * Renders the projected footprint summary card below the simulator sliders.
 * Shows projected total, annual savings delta, and projected Eco Score.
 * @param {Object} current   - Current footprint result.
 * @param {Object} projected - Projected footprint result.
 * @param {Object} projEco   - Projected eco score result.
 */
function renderProjectedCard(current, projected, projEco) {
  if (!current || !projected) return;

  const savingsKg = Math.max(0, current.totalKg - projected.totalKg);
  const fmtProj   = formatCarbon(projected.totalKg);
  const fmtSaving = formatCarbon(savingsKg);

  if (elements.projectedTotalVal) {
    elements.projectedTotalVal.textContent = `${fmtProj.display} ${fmtProj.unit}`;
  }
  if (elements.projectedSavingsVal) {
    elements.projectedSavingsVal.textContent = savingsKg > 0
      ? `−${fmtSaving.display} ${fmtSaving.unit}`
      : 'No change yet';
  }
  if (elements.projectedScoreVal && projEco) {
    elements.projectedScoreVal.textContent = `${projEco.score} / 100`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SVG DONUT CHART — ISOLATED CHART MODULE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chart geometry constants.
 * Changing CX/CY/R/STROKE_W here adjusts the entire chart automatically.
 */
const CHART = {
  NS:          'http://www.w3.org/2000/svg',
  CX:          160,
  CY:          160,
  R:           110,    // Main ring radius
  STROKE_W:    36,     // Donut ring width
  R_PROJ:      155,    // Projected ring radius (outer, thinner)
  STROKE_PROJ: 6       // Projected ring stroke width
};
CHART.CIRCUMFERENCE      = 2 * Math.PI * CHART.R;
CHART.CIRCUMFERENCE_PROJ = 2 * Math.PI * CHART.R_PROJ;

/** Category definitions: display order, key, label, and colour token. */
const CHART_CATEGORIES = [
  { key: 'transport', label: 'Transport', color: 'hsl(199, 89%, 48%)' },
  { key: 'energy',    label: 'Energy',    color: 'hsl(38,  92%, 50%)' },
  { key: 'diet',      label: 'Diet',      color: 'hsl(142, 72%, 45%)' },
  { key: 'waste',     label: 'Waste',     color: 'hsl(350, 89%, 60%)' }
];

/**
 * Builds the static SVG skeleton once on page load.
 * Creates one <circle> per category (stroke-dasharray technique),
 * a background track ring, a projected arc ring, and centre text nodes.
 * Subsequent updates only mutate attributes — no DOM nodes are destroyed.
 */
function initDonutChart() {
  const svg = elements.svgChart;
  if (!svg) return;

  const { NS, CX, CY, R, STROKE_W, R_PROJ, STROKE_PROJ, CIRCUMFERENCE } = CHART;

  // ── Clear the static placeholder content from index.html
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // ── Accessibility: title + desc (linked via aria-labelledby / aria-describedby)
  svg.setAttribute('role',             'img');
  svg.setAttribute('aria-labelledby',  'chart-svg-title');
  svg.setAttribute('aria-describedby', 'chart-svg-desc');

  const titleEl = document.createElementNS(NS, 'title');
  titleEl.id          = 'chart-svg-title';
  titleEl.textContent = 'Carbon Footprint Breakdown Chart';
  svg.appendChild(titleEl);

  const descEl = document.createElementNS(NS, 'desc');
  descEl.id          = 'chart-svg-desc';
  descEl.textContent = 'Donut chart showing emission distribution. Enter lifestyle data to populate.';
  svg.appendChild(descEl);

  // ── Background track ring (subtle, non-interactive)
  const track = document.createElementNS(NS, 'circle');
  track.setAttribute('cx',           CX);
  track.setAttribute('cy',           CY);
  track.setAttribute('r',            R);
  track.setAttribute('fill',         'none');
  track.setAttribute('stroke',       'rgba(255,255,255,0.06)');
  track.setAttribute('stroke-width', STROKE_W);
  track.setAttribute('aria-hidden',  'true');
  svg.appendChild(track);

  // ── One segment circle per category (stacked, each starts empty)
  CHART_CATEGORIES.forEach(cat => {
    const circle = document.createElementNS(NS, 'circle');
    circle.id = `seg-${cat.key}`;
    circle.setAttribute('cx',              CX);
    circle.setAttribute('cy',              CY);
    circle.setAttribute('r',              R);
    circle.setAttribute('fill',           'none');
    circle.setAttribute('stroke',         cat.color);
    circle.setAttribute('stroke-width',   STROKE_W);
    circle.setAttribute('stroke-linecap', 'butt');
    // Start collapsed: dasharray = 0 full-circumference
    circle.setAttribute('stroke-dasharray',  `0 ${CIRCUMFERENCE}`);
    circle.setAttribute('stroke-dashoffset', '0');
    // Positioned at top (−90°) so chart grows clockwise from 12 o'clock
    circle.setAttribute('transform',     `rotate(-90, ${CX}, ${CY})`);
    circle.setAttribute('aria-hidden',   'true');
    // CSS transition for smooth 0.5s updates on every recalculation
    circle.style.transition = 'stroke-dasharray 0.5s ease, transform 0.5s ease';
    svg.appendChild(circle);
  });

  // ── Projected arc ring — outer, dashed, cyan — hidden until simulation active
  const projRing = document.createElementNS(NS, 'circle');
  projRing.id = 'seg-projected';
  projRing.setAttribute('cx',              CX);
  projRing.setAttribute('cy',              CY);
  projRing.setAttribute('r',              R_PROJ);
  projRing.setAttribute('fill',           'none');
  projRing.setAttribute('stroke',         'hsla(199, 100%, 70%, 0.75)');
  projRing.setAttribute('stroke-width',   STROKE_PROJ);
  projRing.setAttribute('stroke-linecap', 'round');
  projRing.setAttribute('stroke-dasharray', `0 ${CHART.CIRCUMFERENCE_PROJ}`);
  projRing.setAttribute('transform',      `rotate(-90, ${CX}, ${CY})`);
  projRing.setAttribute('aria-hidden',    'true');
  projRing.style.opacity    = '0';
  projRing.style.transition = 'stroke-dasharray 0.4s ease, opacity 0.3s ease';
  svg.appendChild(projRing);

  // ── Centre text group
  const centerGroup = document.createElementNS(NS, 'g');
  centerGroup.setAttribute('aria-hidden', 'true');

  const centerValue = document.createElementNS(NS, 'text');
  centerValue.id = 'chart-center-value';
  centerValue.setAttribute('x',                  CX);
  centerValue.setAttribute('y',                  CY - 14);
  centerValue.setAttribute('text-anchor',        'middle');
  centerValue.setAttribute('dominant-baseline',  'middle');
  centerValue.setAttribute('class',              'chart-center-value');
  centerValue.textContent = '--';

  const centerUnit = document.createElementNS(NS, 'text');
  centerUnit.id = 'chart-center-unit';
  centerUnit.setAttribute('x',                  CX);
  centerUnit.setAttribute('y',                  CY + 14);
  centerUnit.setAttribute('text-anchor',        'middle');
  centerUnit.setAttribute('dominant-baseline',  'middle');
  centerUnit.setAttribute('class',              'chart-center-unit');
  centerUnit.textContent = 't CO\u2082e/yr';

  centerGroup.appendChild(centerValue);
  centerGroup.appendChild(centerUnit);
  svg.appendChild(centerGroup);
}

/**
 * Updates the donut chart and legend on every dashboard recalculation.
 * Only mutates SVG element attributes — no nodes are created or removed,
 * keeping DOM churn at zero and enabling CSS transitions to animate smoothly.
 *
 * @param {Object}      footprintData  - Result from calculateTotalFootprint().
 * @param {Object|null} projectedData  - Result from computeProjectedFootprint(), or null.
 */
function renderDonutChart(footprintData, projectedData) {
  if (!elements.svgChart) return;

  const { CX, CY, CIRCUMFERENCE, CIRCUMFERENCE_PROJ } = CHART;
  const breakdown = footprintData?.breakdown ?? { transport: 0, energy: 0, diet: 0, waste: 0 };
  const totalKg   = footprintData?.totalKg   ?? 0;

  let accumulatedDeg = 0; // tracks angular offset for each segment

  CHART_CATEGORIES.forEach(cat => {
    const segEl = document.getElementById(`seg-${cat.key}`);
    if (!segEl) return;

    const catKg    = breakdown[cat.key] ?? 0;
    const fraction = totalKg > 0 ? catKg / totalKg : 0;
    const dashLen  = fraction * CIRCUMFERENCE;
    // Gap = remaining circumference ensures no bleed into next segment
    const dashGap  = CIRCUMFERENCE - dashLen;

    segEl.setAttribute('stroke-dasharray', `${dashLen.toFixed(2)} ${dashGap.toFixed(2)}`);
    // Each segment is rotated to start where the previous one ended
    const rotation = -90 + accumulatedDeg;
    segEl.setAttribute('transform', `rotate(${rotation.toFixed(2)}, ${CX}, ${CY})`);

    accumulatedDeg += fraction * 360;
  });

  // ── Centre text
  const centerValue = document.getElementById('chart-center-value');
  const centerUnit  = document.getElementById('chart-center-unit');
  if (centerValue && centerUnit) {
    if (totalKg > 0) {
      const fmt = formatCarbon(totalKg);
      centerValue.textContent = fmt.display;
      centerUnit.textContent  = fmt.unit;
    } else {
      centerValue.textContent = '--';
      centerUnit.textContent  = 't CO\u2082e/yr';
    }
  }

  // ── Projected ring
  const projRing = document.getElementById('seg-projected');
  if (projRing) {
    const projKg = projectedData?.totalKg ?? totalKg;
    const hasSimulation = projKg < totalKg - 0.5; // only show ring if meaningful reduction exists

    if (hasSimulation && totalKg > 0) {
      const projFraction = projKg / totalKg;
      const projDashLen  = projFraction * CIRCUMFERENCE_PROJ;
      projRing.setAttribute('stroke-dasharray', `${projDashLen.toFixed(2)} ${(CIRCUMFERENCE_PROJ - projDashLen).toFixed(2)}`);
      projRing.style.opacity = '1';
    } else {
      projRing.style.opacity = '0';
    }
  }

  // ── Accessible description update
  const descEl = document.getElementById('chart-svg-desc');
  if (descEl && totalKg > 0) {
    const parts = CHART_CATEGORIES.map(cat => {
      const pct = Math.round(((breakdown[cat.key] ?? 0) / totalKg) * 100);
      return `${cat.label}: ${pct}%`;
    }).join(', ');
    const fmt = formatCarbon(totalKg);
    descEl.textContent = `Emission breakdown — ${parts}. Total: ${fmt.display} ${fmt.unit}.`;
  }

  // ── Legend percentages
  renderChartLegend(breakdown, totalKg);
}

/**
 * Updates the chart legend list items with live percentage values.
 * Matches each legend item by its category class (col-transport, etc.).
 * Mutates textContent only — no nodes created.
 *
 * @param {{ transport: number, energy: number, diet: number, waste: number }} breakdown
 * @param {number} totalKg
 */
function renderChartLegend(breakdown, totalKg) {
  const legendEl = document.getElementById('chart-legend');
  if (!legendEl) return;

  CHART_CATEGORIES.forEach(cat => {
    // Find the legend item containing a dot with the matching category class
    const dot = legendEl.querySelector(`.col-${cat.key}`);
    if (!dot) return;
    const li = dot.closest('li');
    if (!li) return;

    const catKg = breakdown[cat.key] ?? 0;
    const pct   = totalKg > 0 ? Math.round((catKg / totalKg) * 100) : 0;

    // Preserve the colour dot, replace trailing text node with label + %
    // Find or create the text span next to the dot
    let textSpan = li.querySelector('.legend-label');
    if (!textSpan) {
      textSpan = document.createElement('span');
      textSpan.className = 'legend-label';
      li.appendChild(textSpan);
    }
    textSpan.textContent = ` ${cat.label} ${pct}%`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. PREVIOUS ASSESSMENT COMPARISON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the Previous vs Current assessment comparison block.
 * Creates the entire node tree using safeCreateElement — no innerHTML.
 * @param {Object} previous - Stored assessment from localStorage.
 * @param {Object} current  - Current footprint result.
 */
function renderPreviousAssessment(previous, current) {
  const section = elements.previousSection;
  if (!section) return;

  // Clear previous render
  while (section.firstChild) section.removeChild(section.firstChild);

  if (!previous || !current) return;

  const prevTons    = previous.totalTons ?? 0;
  const currentTons = current.totalTons  ?? 0;
  if (prevTons === 0 && currentTons === 0) return;

  const deltaTons    = currentTons - prevTons;
  const deltaPercent = prevTons > 0
    ? Math.round((deltaTons / prevTons) * 100)
    : 0;

  const isImprovement = deltaTons < 0;
  const arrow   = isImprovement ? '▼' : deltaTons > 0 ? '▲' : '→';
  const trendCls = isImprovement ? 'delta-positive' : deltaTons > 0 ? 'delta-negative' : 'delta-neutral';

  const heading  = safeCreateElement('h4', 'prev-heading', '📊 Assessment History');
  const grid     = safeCreateElement('div', 'prev-grid');

  // Previous block
  const prevBlock = safeCreateElement('div', 'prev-block');
  const prevLabel = safeCreateElement('span', 'prev-label', 'Previous Assessment');
  const prevDate  = safeCreateElement('span', 'prev-date', new Date(previous.savedAt).toLocaleDateString());
  const prevVal   = safeCreateElement('span', 'prev-value', `${prevTons.toFixed(2)} t CO₂e`);
  prevBlock.appendChild(prevLabel);
  prevBlock.appendChild(prevDate);
  prevBlock.appendChild(prevVal);

  // Current block
  const currBlock = safeCreateElement('div', 'prev-block');
  const currLabel = safeCreateElement('span', 'prev-label', 'Current Assessment');
  const currVal   = safeCreateElement('span', 'prev-value', `${currentTons.toFixed(2)} t CO₂e`);
  currBlock.appendChild(currLabel);
  currBlock.appendChild(currVal);

  // Delta block
  const deltaBlock = safeCreateElement('div', `prev-block delta-block ${trendCls}`);
  const deltaLabel = safeCreateElement('span', 'prev-label', 'Change');
  const deltaVal   = safeCreateElement('span', 'prev-delta', `${arrow} ${Math.abs(deltaPercent)}%`);
  deltaBlock.appendChild(deltaLabel);
  deltaBlock.appendChild(deltaVal);

  grid.appendChild(prevBlock);
  grid.appendChild(currBlock);
  grid.appendChild(deltaBlock);

  section.appendChild(heading);
  section.appendChild(grid);
  section.hidden = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. MASTER UPDATE ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The central pipeline triggered whenever inputs or simulator sliders change.
 *
 * Pipeline order:
 *   1. Collect & validate raw inputs → appState.inputs
 *   2. Run all calculation functions → appState.results
 *   3. Render each output card
 *   4. Compute and render projected footprint from simulator
 *   5. Persist the current assessment to localStorage
 *   6. Render previous vs. current comparison
 */
function updateDashboard() {
  collectInputs();

  // ── Run the full calculation pipeline
  const footprint         = calculateTotalFootprint(appState.inputs);
  const ecoScore          = calculateEcoScore(footprint.totalTons);
  const recommendations   = generateRecommendations(appState.inputs, footprint);
  // Pass pre-computed recommendations to avoid running the 16-rule scan twice
  const insight           = generateCarbonInsight(appState.inputs, footprint, recommendations);

  // ── Persist to state
  appState.results.footprint       = footprint;
  appState.results.ecoScore        = ecoScore;
  appState.results.recommendations = recommendations;
  appState.results.insight         = insight;

  // ── Render outputs
  renderFootprintCard(footprint);
  renderEcoScoreCard(ecoScore);
  renderInsightCard(insight);
  renderRecommendationsList(recommendations);

  // ── Projected footprint from simulator state
  const { footprint: projFootprint, ecoScore: projEco } = computeProjectedFootprint();
  renderProjectedCard(footprint, projFootprint, projEco);

  // ── SVG Donut Chart (phase 7) — always updated after projections are ready
  renderDonutChart(footprint, projFootprint);

  // ── Persist and show history comparison
  const previousAssessment = appState.previousAssessment;
  saveAssessmentToStorage();
  renderPreviousAssessment(previousAssessment, footprint);
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SYSTEM HEALTH UI RENDERER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a health result object and updates the five checklist icons in the
 * diagnostics drawer, plus the header health pill.
 *
 * @param {{ status: string, checks: Array<{ label: string, passed: boolean }> }} health
 */
function updateSystemHealth(health) {
  if (!health) return;

  // Map check labels to their corresponding DOM status icon elements
  const checkMap = {
    'Calculations Verified':   elements.statusCalc,
    'Inputs Validated':        elements.statusInputs,
    'Recommendations Working': elements.statusRecs,
    'Accessibility Passed':    elements.statusA11y,
    'Security Checks Passed':  elements.statusSecurity
  };

  health.checks.forEach(check => {
    const el = checkMap[check.label];
    if (!el) return;
    el.textContent  = check.passed ? '✓' : '✗';
    el.className    = `check-icon ${check.passed ? 'check-passed' : 'check-failed'}`;
  });

  // Update the header pill
  if (elements.healthPill) {
    const isExcellent = health.status === 'Excellent';
    elements.healthPill.textContent = `🧠 System Health: ${health.status}`;
    elements.healthPill.className   = `health-pill ${isExcellent ? 'health-excellent' : 'health-warning'}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. TESTING PANEL RENDERER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the full test suite and renders pass/fail counts, latency,
 * and a grouped log of every test result into the diagnostics drawer.
 * Then derives and renders the system health status from the same results.
 */
function updateTestingPanel() {
  const testResults  = runTests();
  const health       = generateSystemHealth(testResults);

  // Update summary counts
  if (elements.testPassedCount) elements.testPassedCount.textContent = String(testResults.passed);
  if (elements.testFailedCount) elements.testFailedCount.textContent = String(testResults.failed);
  if (elements.testLatencyVal)  elements.testLatencyVal.textContent  = `${testResults.executionTime} ms`;

  // Render per-test log lines using textContent (no HTML injection)
  if (elements.testLog) {
    const lines = testResults.results.map(r => r.message).join('\n');
    elements.testLog.textContent = lines;
  }

  // Update health checks from the same run
  updateSystemHealth(health);
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. TEST TRAY TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wires up the expand/collapse behaviour for the diagnostics drawer.
 * Updates aria-expanded and aria-hidden attributes on toggle.
 */
function initTestTray() {
  if (!elements.btnToggleTests || !elements.testPanelBody) return;

  elements.btnToggleTests.addEventListener('click', () => {
    const isOpen = appState.ui.isTestPanelOpen;
    appState.ui.isTestPanelOpen = !isOpen;

    elements.btnToggleTests.setAttribute('aria-expanded', String(!isOpen));
    elements.testPanelBody.setAttribute('aria-hidden',    String(isOpen));
    elements.testPanelBody.classList.toggle('expanded', !isOpen);

    const icon = elements.btnToggleTests.querySelector('.icon-toggle');
    if (icon) icon.textContent = isOpen ? '▲' : '▼';
  });

  // Manual re-run button
  if (elements.btnRunTests) {
    elements.btnRunTests.addEventListener('click', updateTestingPanel);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. THEME & ACCESSIBILITY CONTROLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wires up the dark/light mode and high contrast toggle buttons.
 * Each button manages aria-pressed to communicate state to assistive technology.
 */
function initThemeControls() {
  // Dark mode is the default (set in index.html via class)
  elements.body.classList.remove('light-mode');

  if (elements.themeToggle) {
    elements.themeToggle.setAttribute('aria-pressed', 'true');

    elements.themeToggle.addEventListener('click', () => {
      const nowDark = elements.body.classList.toggle('dark-mode');
      elements.body.classList.toggle('light-mode', !nowDark);
      appState.ui.isDarkMode = nowDark;
      elements.themeToggle.setAttribute('aria-pressed', String(nowDark));
      elements.themeToggle.textContent = nowDark ? '🌙 Dark Mode' : '☀️ Light Mode';
    });
  }

  if (elements.contrastToggle) {
    elements.contrastToggle.setAttribute('aria-pressed', 'false');

    elements.contrastToggle.addEventListener('click', () => {
      const isHC = elements.body.classList.toggle('high-contrast');
      appState.ui.isHighContrast = isHC;
      elements.contrastToggle.setAttribute('aria-pressed', String(isHC));
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. EVENT DELEGATION — FORM INPUTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single delegated listener on the form container handles all input and
 * change events from every field.  Debounced to 180 ms to keep updates
 * smooth when the user types rapidly or drags a native number spinner.
 */
function initFormListeners() {
  if (!elements.form) return;

  const debouncedUpdate = debounce(updateDashboard, 180);

  // 'input' fires on every keystroke for text/number fields
  elements.form.addEventListener('input', debouncedUpdate);

  // 'change' fires on blur / select changes — catches drop-downs reliably
  elements.form.addEventListener('change', debouncedUpdate);

  // Reset button: clear appState.inputs and re-render
  elements.form.addEventListener('reset', () => {
    // Let the browser clear the form fields, then re-collect on next tick
    setTimeout(() => {
      updateDashboard();
    }, 0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. EVENT DELEGATION — SIMULATOR SLIDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single delegated listener on the simulator list wrapper handles all
 * range slider interactions without needing individual per-slider listeners.
 */
function initSimulatorListeners() {
  if (!elements.simulatorList) return;

  const debouncedProjection = debounce(() => {
    collectSimulationInputs();
    const { footprint: projFootprint, ecoScore: projEco } = computeProjectedFootprint();
    renderProjectedCard(appState.results.footprint, projFootprint, projEco);
    // Update projected ring on the donut chart in real-time as slider moves
    renderDonutChart(appState.results.footprint, projFootprint);
  }, 60); // shorter debounce for snappy slider feedback

  elements.simulatorList.addEventListener('input', (e) => {
    if (e.target.type !== 'range') return;
    debouncedProjection();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. RECOMMENDATIONS LIST INJECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures a recommendations list container exists inside the dashboard panel.
 * Called once at startup; injects the element if index.html doesn't already
 * include one (forward-compatibility guard).
 */
function ensureRecommendationsContainer() {
  if (elements.recommendationsList) return;

  // Find the dashboard panel's last card (insight card) and append after it
  const insightCard = elements.insightText?.closest('.data-card');
  if (!insightCard) return;

  const recSection = safeCreateElement('section', 'data-card rec-section');
  recSection.setAttribute('aria-labelledby', 'rec-heading');
  recSection.id = 'recommendations-panel';

  const heading = safeCreateElement('h3', '', '🎯 Top Recommendations');
  heading.id = 'rec-heading';
  recSection.appendChild(heading);

  const list = safeCreateElement('div', 'recommendations-list');
  list.id = 'recommendations-list';
  // aria-live: announces newly generated recommendation cards to screen readers
  list.setAttribute('aria-live', 'polite');
  list.setAttribute('aria-atomic', 'false');
  recSection.appendChild(list);

  insightCard.insertAdjacentElement('afterend', recSection);

  // Update the cache reference
  elements.recommendationsList = list;
}

/**
 * Ensures a previous-assessment container exists in the dashboard panel.
 * Injected dynamically so index.html remains clean and layout-agnostic.
 */
function ensurePreviousAssessmentContainer() {
  if (elements.previousSection) return;

  const scoreCard = elements.ecoLevelBadge?.closest('.data-card');
  if (!scoreCard) return;

  const section = safeCreateElement('div', 'data-card prev-assessment-card');
  section.id     = 'previous-assessment-section';
  section.hidden = true;
  section.setAttribute('aria-live', 'polite');

  scoreCard.insertAdjacentElement('afterend', section);
  elements.previousSection = section;
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. ENTRY POINT — initializeApp()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bootstraps the entire application.
 *
 * Execution sequence:
 *   1. Load previous assessment from localStorage.
 *   2. Initialise theme and accessibility controls.
 *   3. Inject dynamic containers not present in the static HTML.
 *   4. Bind delegated form and simulator listeners.
 *   5. Wire up the diagnostics tray toggle.
 *   6. Run the automated test suite and render its results.
 *   7. Run an initial dashboard calculation with default state.
 */
function initializeApp() {
  // 1. Restore previous assessment for delta comparison
  appState.previousAssessment = loadAssessmentFromStorage();

  // 2. Accessibility & theme controls
  initThemeControls();

  // 3. Inject containers that are created at runtime
  ensureRecommendationsContainer();
  ensurePreviousAssessmentContainer();

  // 4. Build the SVG donut chart skeleton (must run before first updateDashboard)
  initDonutChart();

  // 5. Delegated event listeners
  initFormListeners();
  initSimulatorListeners();

  // 6. Diagnostics tray
  initTestTray();

  // 7. Run tests once at startup; results go to the health panel
  updateTestingPanel();

  // 8. Initial render with zero/default inputs
  updateDashboard();

  console.info('CarbonWise AI — initialised successfully.');
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initializeApp);
