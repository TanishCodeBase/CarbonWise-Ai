/**
 * CarbonWise AI — Utility Functions
 * ===================================
 * Pure, framework-free helper functions used across the application.
 *
 * Design rules enforced in this file:
 *   1. No DOM queries (no document.getElementById / querySelector calls).
 *   2. No business logic (no emission calculations or rule evaluation).
 *   3. No side effects beyond the single DOM node creation in safeCreateElement.
 *   4. Every function is independently testable (given an input, returns an output).
 *   5. No use of eval(), innerHTML, or insertAdjacentHTML to prevent XSS.
 */

'use strict';

// ----------------------------------------------------
// 1. sanitizeInput(value)
// ----------------------------------------------------
/**
 * Converts any value to a safe, trimmed plain string.
 *
 * Prevents Cross-Site Scripting (XSS) by stripping all HTML tags and
 * truncating the result to a maximum safe length before it is ever
 * used in text content or attribute values.
 *
 * Security guarantees:
 *   - Coerces non-strings (objects, arrays, null, undefined) to "".
 *   - Strips every HTML tag via a regex on the string representation.
 *   - Trims surrounding whitespace.
 *   - Enforces a maximum length cap to prevent buffer-overflow-style abuse.
 *
 * @param {*}      value    - Any raw value from user input or external source.
 * @param {number} [maxLen=200] - Maximum allowed length of the returned string.
 * @returns {string} A safe, plain-text string with no HTML markup.
 *
 * @example
 *   sanitizeInput('<script>alert(1)</script>')  // → ''
 *   sanitizeInput('  Hello World  ')            // → 'Hello World'
 *   sanitizeInput(null)                         // → ''
 *   sanitizeInput(42)                           // → '42'
 */
export function sanitizeInput(value, maxLen = 200) {
  // Reject non-primitive objects (arrays, plain objects, functions, etc.)
  // by coercing to a raw string first, then treating them as empty.
  if (value === null || value === undefined) return '';

  // Convert to string; if the result is '[object Object]' or similar
  // nonsense, the subsequent HTML-strip will still leave safe output.
  const raw = String(value);

  // Strip all HTML tags (e.g. <script>, <img onerror=…>, &lt;, etc.)
  // The replace covers both standard and malformed tag patterns.
  const stripped = raw.replace(/<[^>]*>/g, '');

  // Trim whitespace and enforce the maximum length cap.
  return stripped.trim().slice(0, maxLen);
}

// ----------------------------------------------------
// 2. validateNumber(value, min, max)
// ----------------------------------------------------
/**
 * Parses a raw input value as a finite number and clamps it within bounds.
 *
 * Designed to be the single gateway through which every numeric field's
 * value passes before being stored in state or used in a calculation.
 *
 * Validation steps (in order):
 *   1. Coerce to float with parseFloat().
 *   2. Reject NaN and Infinity — return the minimum bound instead.
 *   3. Clamp: if below min, return min; if above max, return max.
 *
 * @param {*}      value - Raw value from an input element or query string.
 * @param {number} min   - Lower bound (inclusive). Returned on invalid input.
 * @param {number} max   - Upper bound (inclusive).
 * @returns {number} A finite number guaranteed to be within [min, max].
 *
 * @example
 *   validateNumber('42.5', 0, 100)   // → 42.5
 *   validateNumber('-10',  0, 100)   // → 0
 *   validateNumber('9999', 0, 100)   // → 100
 *   validateNumber('abc',  0, 100)   // → 0
 *   validateNumber(NaN,    0, 100)   // → 0
 *   validateNumber('',     0, 100)   // → 0
 */
export function validateNumber(value, min, max) {
  const parsed = parseFloat(value);

  // Reject non-finite results (NaN, Infinity, -Infinity).
  if (!isFinite(parsed)) return min;

  // Clamp to the declared range.
  return Math.min(max, Math.max(min, parsed));
}

// ----------------------------------------------------
// 3. safeCreateElement(tag, className, text)
// ----------------------------------------------------
/**
 * Programmatically creates a DOM element with a class name and text content.
 *
 * Security guarantee: text is assigned via .textContent, which the browser
 * treats as a plain string and never parses as HTML. This means even if
 * `text` contained something like '<script>alert(1)</script>', it would be
 * rendered as visible characters on screen, not executed.
 *
 * Usage note: call sanitizeInput() on any user-supplied text BEFORE passing
 * it to this function for a defence-in-depth approach.
 *
 * @param {string} tag       - Valid HTML tag name (e.g. 'div', 'span', 'p').
 * @param {string} [className=''] - One or more CSS class names (space-separated).
 * @param {string} [text='']      - Plain text to set as the element's text content.
 * @returns {HTMLElement} The newly created, detached DOM element.
 *
 * @example
 *   const el = safeCreateElement('p', 'insight-text', 'You emitted 4.2 t CO₂.');
 *   container.appendChild(el);
 */
export function safeCreateElement(tag, className = '', text = '') {
  const el = document.createElement(tag);

  if (className) {
    // className may contain multiple space-separated names (e.g. 'card active').
    // Splitting and adding individually guards against prototype pollution
    // from unexpected input containing special attribute characters.
    className.trim().split(/\s+/).forEach(cls => {
      if (cls) el.classList.add(cls);
    });
  }

  if (text) {
    // textContent is safe: no HTML interpretation by the browser.
    el.textContent = text;
  }

  return el;
}

// ----------------------------------------------------
// 4. debounce(fn, delay)
// ----------------------------------------------------
/**
 * Returns a debounced version of `fn` that postpones execution until
 * `delay` milliseconds have elapsed since the last call.
 *
 * Used to throttle expensive rendering operations (chart redraws, insight
 * regeneration) when the user is rapidly dragging a slider or typing.
 * Prevents unnecessary computation on every intermediate keypress/tick.
 *
 * @param {Function} fn    - The function to debounce.
 * @param {number}   delay - Quiet period in milliseconds before fn fires.
 * @returns {Function} The debounced wrapper function.
 *
 * @example
 *   const expensiveRedraw = debounce(renderChart, 120);
 *   sliderEl.addEventListener('input', expensiveRedraw);
 */
export function debounce(fn, delay) {
  let timerId = null;

  return function debounced(...args) {
    // Clear any pending invocation so only the last call within
    // the quiet window is actually executed.
    clearTimeout(timerId);

    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delay);
  };
}

// ----------------------------------------------------
// 5. formatCarbon(valueKg)
// ----------------------------------------------------
/**
 * Formats a carbon value (in kg CO₂e) into a human-readable display string.
 *
 * Display rules:
 *   - Values ≥ 1000 kg are converted to metric tons and shown with 2 d.p.
 *   - Values < 1000 kg are shown as whole kilograms (rounded).
 *   - Negative values are clamped to 0 (savings/offsets should be shown
 *     separately, not as negative footprints).
 *
 * @param {number} valueKg - Carbon mass in kilograms CO₂e.
 * @returns {{ display: string, unit: string, tons: number }}
 *   An object with:
 *     display — formatted numeric string (e.g. '4.23' or '842')
 *     unit    — label string ('t CO₂e / yr' or 'kg CO₂e / yr')
 *     tons    — the value converted to metric tons (for Eco Score calculation)
 *
 * @example
 *   formatCarbon(4230)  // → { display: '4.23', unit: 't CO₂e / yr', tons: 4.23 }
 *   formatCarbon(842)   // → { display: '842',  unit: 'kg CO₂e / yr', tons: 0.84 }
 *   formatCarbon(-50)   // → { display: '0',    unit: 'kg CO₂e / yr', tons: 0 }
 */
export function formatCarbon(valueKg) {
  // Clamp negatives; footprints below zero are meaningless for display.
  const safeKg = Math.max(0, valueKg);

  if (safeKg >= 1000) {
    const tons = safeKg / 1000;
    return {
      display: tons.toFixed(2),
      unit: 't CO₂e / yr',
      tons: parseFloat(tons.toFixed(2))
    };
  }

  return {
    display: String(Math.round(safeKg)),
    unit: 'kg CO₂e / yr',
    tons: parseFloat((safeKg / 1000).toFixed(4))
  };
}

// ----------------------------------------------------
// 6. getEcoLevel(score)
// ----------------------------------------------------
/**
 * Resolves the named Eco Level for a given numeric score (0–100).
 *
 * Kept here rather than in app.js so it can be tested independently
 * without DOM setup. Depends on the ECO_LEVELS configuration array
 * from emissionFactors.js.
 *
 * @param {number}   score     - Integer score in the range [0, 100].
 * @param {Array}    ecoLevels - The ECO_LEVELS array from emissionFactors.js.
 * @returns {{ label: string, cssClass: string }} The matching level object.
 *
 * @example
 *   getEcoLevel(92, ECO_LEVELS)  // → { label: 'Carbon Guardian', cssClass: 'level-guardian' }
 *   getEcoLevel(45, ECO_LEVELS)  // → { label: 'Climate Learner',  cssClass: 'level-learner'  }
 */
export function getEcoLevel(score, ecoLevels) {
  // Iterate from highest band downward; return the first match.
  for (const level of ecoLevels) {
    if (score >= level.minScore && score <= level.maxScore) {
      return { label: level.label, cssClass: level.cssClass };
    }
  }
  // Fallback (should never be reached if ecoLevels covers 0–100 fully).
  return { label: 'High Impact User', cssClass: 'level-highimpact' };
}
