/**
 * ============================================================
 * EUROVISION TOOLS — script.js
 * Namespace: EurovisionApp
 * Architecture: Module pattern with clean public API
 * ============================================================
 */

'use strict';

/* ── Utility helpers ─────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const on = (el, ev, fn, opts) => el?.addEventListener(ev, fn, opts);
const off = (el, ev, fn) => el?.removeEventListener(ev, fn);

/** Debounce: delay fn execution until after `delay`ms of no calls */
function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** Throttle: call fn at most once per `limit`ms */
function throttle(fn, limit = 100) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn.apply(this, args); }
  };
}

/** Clamp a value between min and max */
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/** Format a number with locale separators */
const fmt = (n) => new Intl.NumberFormat().format(n);

/** Deep clone a plain object/array */
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Generate a random ID */
const uid = () => Math.random().toString(36).slice(2, 9);

/** Sleep (Promise-based) */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ─────────────────────────────────────────────────────────── */
/*  MAIN APP NAMESPACE                                          */
/* ─────────────────────────────────────────────────────────── */
const EurovisionApp = (() => {

  /* ── State ─────────────────────────────────────────────── */
  const state = {
    lang: 'en',
    bingoCards: {},          // { cardId: Set<cellIndex> }
    scores: {},              // { countryId: points }
    forecast: {},            // { countryId: { prior, posterior, evidence } }
    toastQueue: [],
    countdownTarget: null,   // Date object for finale
    bingoWinLines: [],       // Detected win lines
  };

  /* ── i18n Strings (base EN + stubs for ES/DE) ──────────── */
  const i18n = {
    en: {
      bingo_progress: 'cells marked',
      bingo_win: '🎉 BINGO! You completed a line!',
      bingo_full: '🏆 FULL HOUSE! Amazing!',
      score_updated: 'Scores updated!',
      copied: 'Copied to clipboard!',
      share_text: 'Check out my Eurovision scorecard!',
      total_label: 'TOTAL POINTS',
      countdown_days: 'days',
      countdown_hours: 'hrs',
      countdown_mins: 'min',
      countdown_secs: 'sec',
    },
    es: {
      bingo_progress: 'celdas marcadas',
      bingo_win: '🎉 ¡BINGO! ¡Completaste una línea!',
      bingo_full: '🏆 ¡PLENO! ¡Increíble!',
      score_updated: '¡Puntuaciones actualizadas!',
      copied: '¡Copiado al portapapeles!',
      share_text: '¡Mira mi tarjeta de puntuación de Eurovision!',
      total_label: 'PUNTUACIÓN TOTAL',
      countdown_days: 'días',
      countdown_hours: 'h',
      countdown_mins: 'min',
      countdown_secs: 'seg',
    },
    de: {
      bingo_progress: 'Felder markiert',
      bingo_win: '🎉 BINGO! Du hast eine Reihe vervollständigt!',
      bingo_full: '🏆 VOLLTREFFER! Fantastisch!',
      score_updated: 'Punkte aktualisiert!',
      copied: 'In die Zwischenablage kopiert!',
      share_text: 'Schau dir meine Eurovision-Punktekarte an!',
      total_label: 'GESAMTPUNKTE',
      countdown_days: 'Tage',
      countdown_hours: 'Std',
      countdown_mins: 'Min',
      countdown_secs: 'Sek',
    },
  };

  /** Translate a key for the active language */
  const t = (key) => (i18n[state.lang] || i18n.en)[key] || key;

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Progress Bar                                    */
  /* ─────────────────────────────────────────────────────── */
  const ProgressBar = (() => {
    let bar;
    let current = 0;
    let timer;

    function init() {
      bar = document.createElement('div');
      bar.id = 'progress-bar';
      document.body.prepend(bar);
      start();
    }

    function start() {
      current = 0;
      bar.style.opacity = '1';
      bar.classList.remove('done');
      tick();
    }

    function tick() {
      // Simulate staggered loading progress
      const targets = [20, 40, 60, 75, 85, 92];
      let i = 0;

      function step() {
        if (i >= targets.length) return;
        const t = targets[i++];
        current = t;
        bar.style.width = current + '%';
        timer = setTimeout(step, 300 + Math.random() * 400);
      }
      step();
    }

    function complete() {
      clearTimeout(timer);
      current = 100;
      bar.style.width = '100%';
      setTimeout(() => bar.classList.add('done'), 300);
    }

    return { init, complete };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Toast Notifications                             */
  /* ─────────────────────────────────────────────────────── */
  const Toast = (() => {
    let container;

    const ICONS = {
      success: '✅',
      warning: '⚠️',
      error:   '❌',
      info:    'ℹ️',
    };

    function init() {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    /**
     * Show a toast notification
     * @param {string} msg     - Message text
     * @param {object} options - { type, title, duration }
     */
    function show(msg, { type = 'info', title = '', duration = 3500 } = {}) {
      const toast = document.createElement('div');
      toast.className = `toast toast--${type}`;
      toast.innerHTML = `
        <span class="toast__icon" aria-hidden="true">${ICONS[type]}</span>
        <div class="toast__body">
          ${title ? `<div class="toast__title">${title}</div>` : ''}
          <div class="toast__msg">${msg}</div>
        </div>
        <button class="toast__close" aria-label="Close">✕</button>
      `;

      const closeBtn = toast.querySelector('.toast__close');
      on(closeBtn, 'click', () => remove(toast));

      container.appendChild(toast);

      // Auto-remove
      const timer = setTimeout(() => remove(toast), duration);
      toast._timer = timer;

      return toast;
    }

    function remove(toast) {
      clearTimeout(toast._timer);
      toast.classList.add('removing');
      on(toast, 'animationend', () => toast.remove(), { once: true });
    }

    return { init, show };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Bingo                                           */
  /* ─────────────────────────────────────────────────────── */
  const Bingo = (() => {

    // Standard 5×5 win patterns (indices 0–24)
    const WIN_PATTERNS = (() => {
      const p = [];
      // Rows
      for (let r = 0; r < 5; r++) p.push([0,1,2,3,4].map(c => r * 5 + c));
      // Columns
      for (let c = 0; c < 5; c++) p.push([0,1,2,3,4].map(r => r * 5 + c));
      // Diagonals
      p.push([0,6,12,18,24]);
      p.push([4,8,12,16,20]);
      return p;
    })();

    /**
     * Toggle a bingo cell's active state
     * Persists to localStorage, updates progress, checks for wins
     */
    function toggleCell(cell) {
      if (cell.classList.contains('free-space')) return;

      const grid   = cell.closest('.bingo-grid');
      const cardId = grid?.dataset.cardId || 'default';
      const cells  = $$('.bingo-cell', grid);
      const idx    = cells.indexOf(cell);

      // Toggle state
      cell.classList.toggle('active');

      // Sync state Set
      if (!state.bingoCards[cardId]) state.bingoCards[cardId] = new Set();
      if (cell.classList.contains('active')) {
        state.bingoCards[cardId].add(idx);
      } else {
        state.bingoCards[cardId].delete(idx);
        cell.classList.remove('win-line');
      }

      // Persist
      saveToStorage();

      // Update progress UI
      updateProgress(grid, cardId);

      // Check wins
      checkWins(grid, cardId, cells);

      // Haptic feedback on mobile
      if (navigator.vibrate) navigator.vibrate(30);
    }

    function checkWins(grid, cardId, cells) {
      const active = state.bingoCards[cardId] || new Set();
      const newWins = [];

      WIN_PATTERNS.forEach(pattern => {
        const isWin = pattern.every(i =>
          cells[i]?.classList.contains('active') ||
          cells[i]?.classList.contains('free-space')
        );
        if (isWin) newWins.push(pattern);
      });

      const prevCount = state.bingoWinLines.length;
      state.bingoWinLines = newWins;

      if (newWins.length > prevCount) {
        // New win detected
        const isFullHouse = newWins.length >= 12; // All possible lines
        const msg = isFullHouse ? t('bingo_full') : t('bingo_win');

        newWins.forEach(pattern =>
          pattern.forEach(i => cells[i]?.classList.add('win-line'))
        );

        Toast.show(msg, { type: 'success', title: 'BINGO!', duration: 5000 });
        Confetti.burst();
      } else if (newWins.length < prevCount) {
        // Line removed — clear win-line classes then re-apply remaining
        cells.forEach(c => c.classList.remove('win-line'));
        newWins.forEach(pattern =>
          pattern.forEach(i => cells[i]?.classList.add('win-line'))
        );
      }
    }

    function updateProgress(grid, cardId) {
      const cells   = $$('.bingo-cell:not(.free-space)', grid);
      const active  = state.bingoCards[cardId]?.size || 0;
      const total   = cells.length;
      const pct     = total > 0 ? Math.round((active / total) * 100) : 0;

      const wrapper = grid.closest('.bingo-wrapper');
      if (!wrapper) return;

      const fill    = $('.bingo-progress__bar-fill', wrapper);
      const count   = $('.bingo-progress__count',    wrapper);
      const pctEl   = $('.bingo-progress__pct',      wrapper);

      if (fill)  fill.style.width = pct + '%';
      if (count) count.textContent = active;
      if (pctEl) pctEl.textContent = pct + '%';
    }

    function saveToStorage() {
      try {
        const serialized = {};
        Object.entries(state.bingoCards).forEach(([id, set]) => {
          serialized[id] = [...set];
        });
        localStorage.setItem('esc_bingo', JSON.stringify(serialized));
      } catch (e) { /* storage full or private mode */ }
    }

    function loadFromStorage() {
      try {
        const raw = localStorage.getItem('esc_bingo');
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.entries(data).forEach(([id, arr]) => {
          state.bingoCards[id] = new Set(arr);
        });
      } catch (e) { /* corrupt data */ }
    }

    function restoreGrids() {
      $$('.bingo-grid').forEach(grid => {
        const cardId = grid.dataset.cardId || 'default';
        const cells  = $$('.bingo-cell', grid);
        const saved  = state.bingoCards[cardId];
        if (!saved) return;

        cells.forEach((cell, i) => {
          if (saved.has(i) && !cell.classList.contains('free-space')) {
            cell.classList.add('active');
          }
        });
        updateProgress(grid, cardId);
        checkWins(grid, cardId, cells);
      });
    }

    function resetCard(cardId = 'default') {
      state.bingoCards[cardId] = new Set();
      state.bingoWinLines = [];
      saveToStorage();

      $$('.bingo-grid').forEach(grid => {
        if ((grid.dataset.cardId || 'default') !== cardId) return;
        $$('.bingo-cell', grid).forEach(c => {
          c.classList.remove('active', 'win-line');
        });
        updateProgress(grid, cardId);
      });
    }

    function init() {
      loadFromStorage();
      restoreGrids();

      // Delegate click handling for all bingo cells
      on(document, 'click', (e) => {
        const cell = e.target.closest('.bingo-cell');
        if (cell) toggleCell(cell);
      });

      // Reset buttons
      on(document, 'click', (e) => {
        const btn = e.target.closest('[data-bingo-reset]');
        if (btn) {
          const cardId = btn.dataset.bingoReset || 'default';
          resetCard(cardId);
          Toast.show('Card cleared!', { type: 'info' });
        }
      });
    }

    return { init, toggleCell, resetCard };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Score Calculator                               */
  /* ─────────────────────────────────────────────────────── */
  const ScoreCalc = (() => {

    // Official Eurovision point values
    const VALID_SCORES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 12]);

    /** Sum all .score-input values and render to #total-score */
    function recalculate() {
      const inputs  = $$('.score-input');
      let total     = 0;
      let hasErrors = false;

      inputs.forEach(input => {
        const raw = parseInt(input.value, 10);
        const val = isNaN(raw) ? 0 : raw;

        // Validate against official scale
        if (input.value !== '' && !VALID_SCORES.has(val) && val !== 0) {
          input.style.borderColor = 'var(--clr-pink)';
          hasErrors = true;
        } else {
          input.style.borderColor = '';
        }

        total += Math.max(0, val);
        state.scores[input.dataset.country || input.name || uid()] = val;
      });

      renderTotal(total);

      // Check uniqueness constraint (each score 1–12 should appear once)
      const usedScores = inputs
        .map(i => parseInt(i.value, 10))
        .filter(v => !isNaN(v) && v > 0);

      const dupes = usedScores.filter((v, i) => usedScores.indexOf(v) !== i);
      if (dupes.length > 0) {
        Toast.show(`Duplicate scores: ${dupes.join(', ')}`, {
          type: 'warning', title: 'Check scores'
        });
      }

      return total;
    }

    function renderTotal(total) {
      const el = $('#total-score');
      if (!el) return;

      const prev = parseInt(el.textContent, 10) || 0;
      animateCounter(el, prev, total, 600);
    }

    /** Smooth number animation for counter */
    function animateCounter(el, from, to, duration) {
      const start    = performance.now();
      const delta    = to - from;

      function frame(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = fmt(Math.round(from + delta * ease));
        if (progress < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    /** Score pill click → assign value to the row's score-input */
    function handlePillClick(pill) {
      const val  = parseInt(pill.dataset.score, 10);
      const row  = pill.closest('tr, .vote-row, [data-country]');
      const input = row ? $('input[type="number"], .score-input', row) : null;

      // Deselect other pills in same row
      if (row) {
        $$('.score-pill', row).forEach(p => p.classList.remove('selected'));
      }

      pill.classList.add('selected');

      if (input) {
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      recalculate();
    }

    function init() {
      // Listen on score inputs (debounced)
      const debouncedRecalc = debounce(recalculate, 300);
      on(document, 'input', (e) => {
        if (e.target.matches('.score-input')) debouncedRecalc();
      });

      // Score pill clicks
      on(document, 'click', (e) => {
        const pill = e.target.closest('.score-pill');
        if (pill) handlePillClick(pill);
      });

      // Initial calculation on load
      recalculate();
    }

    return { init, recalculate, animateCounter };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Probability Engine                              */
  /*  Uses Bayesian updating + Gaussian approximation        */
  /* ─────────────────────────────────────────────────────── */
  const ProbabilityEngine = (() => {

    /**
     * Gaussian (normal) PDF
     * @param {number} x    - Value
     * @param {number} mu   - Mean
     * @param {number} sigma- Std deviation
     */
    function gaussianPDF(x, mu, sigma) {
      if (sigma <= 0) return 0;
      const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
      const exp   = Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
      return coeff * exp;
    }

    /**
     * Gaussian CDF approximation (Abramowitz & Stegun)
     * Returns P(X ≤ x) for N(mu, sigma²)
     */
    function gaussianCDF(x, mu = 0, sigma = 1) {
      const z = (x - mu) / (sigma * Math.SQRT2);
      return 0.5 * (1 + erf(z));
    }

    /** Error function approximation */
    function erf(z) {
      const t   = 1 / (1 + 0.3275911 * Math.abs(z));
      const poly = t * (0.254829592
                 + t * (-0.284496736
                 + t * (1.421413741
                 + t * (-1.453152027
                 + t * 1.061405429))));
      const result = 1 - poly * Math.exp(-z * z);
      return z >= 0 ? result : -result;
    }

    /**
     * Normalize an array of values to sum to 1 (probability simplex)
     */
    function softmax(values) {
      const max  = Math.max(...values);
      const exps = values.map(v => Math.exp(v - max)); // numerical stability
      const sum  = exps.reduce((a, b) => a + b, 0);
      return exps.map(v => v / sum);
    }

    /**
     * Bayesian prior update using likelihood evidence
     *
     * Formula:
     *   posterior_i = prior_i × L(evidence | H_i) / Z
     * where Z = Σ prior_j × L(evidence | H_j) is the normalizing constant.
     *
     * @param {number[]} priors     - Prior probabilities P(H_i), must sum to 1
     * @param {number[]} likelihoods- P(evidence | H_i) for each hypothesis
     * @returns {number[]}            Posterior probabilities
     */
    function bayesianUpdate(priors, likelihoods) {
      if (priors.length !== likelihoods.length) {
        throw new Error('Priors and likelihoods must have the same length');
      }

      const unnormalized = priors.map((p, i) => p * likelihoods[i]);
      const Z = unnormalized.reduce((a, b) => a + b, 0);

      if (Z === 0) return priors; // No update possible

      return unnormalized.map(v => v / Z);
    }

    /**
     * Main calculation function: estimate win probabilities for all contestants
     *
     * Model:
     * 1. Start with equal or user-provided priors
     * 2. Update using jury score evidence (Gaussian likelihood centered on mean)
     * 3. Update using televote evidence
     * 4. Update using historical country performance (beta prior)
     * 5. Update using bookmaker odds (if provided)
     * 6. Apply recency weight for rehearsal scores
     * 7. Output sorted posteriors
     *
     * @param {Array<{
     *   id: string,
     *   name: string,
     *   juryScore?: number,
     *   televoteScore?: number,
     *   bookmakerOdds?: number,
     *   historicalWins?: number,
     *   rehearsalRating?: number,
     *   semifinalPosition?: number
     * }>} contestants
     *
     * @param {object} options
     * @param {number} options.juryWeight        - 0–1, default 0.5
     * @param {number} options.televoteWeight    - 0–1, default 0.5
     * @param {number} options.bookmakerWeight   - 0–1, trust in bookmaker data
     * @param {number} options.historicalWeight  - 0–1, weight of past wins
     *
     * @returns {Array<{ id, name, probability, rank, trend }>}
     */
    function calculateProbability(contestants, options = {}) {
      const {
        juryWeight        = 0.5,
        televoteWeight    = 0.5,
        bookmakerWeight   = 0.3,
        historicalWeight  = 0.1,
      } = options;

      if (!contestants || contestants.length === 0) return [];

      const n = contestants.length;

      // ── Step 1: Equal priors ─────────────────────────────
      let priors = new Array(n).fill(1 / n);

      // ── Step 2: Jury score evidence ──────────────────────
      const jurys = contestants.map(c => c.juryScore ?? 0);
      if (jurys.some(v => v > 0)) {
        const juryMu    = jurys.reduce((a, b) => a + b, 0) / n;
        const juryVar   = jurys.reduce((a, v) => a + (v - juryMu) ** 2, 0) / n;
        const jurySigma = Math.sqrt(juryVar) || 1;

        const juryLikelihoods = jurys.map(s => gaussianPDF(s, juryMu + jurySigma, jurySigma));
        priors = bayesianUpdate(priors, juryLikelihoods.map((l, i) =>
          Math.max(l, 1e-10) ** juryWeight
        ));
      }

      // ── Step 3: Televote evidence ────────────────────────
      const tvotes = contestants.map(c => c.televoteScore ?? 0);
      if (tvotes.some(v => v > 0)) {
        const tvMu    = tvotes.reduce((a, b) => a + b, 0) / n;
        const tvVar   = tvotes.reduce((a, v) => a + (v - tvMu) ** 2, 0) / n;
        const tvSigma = Math.sqrt(tvVar) || 1;

        const tvLikelihoods = tvotes.map(s => gaussianPDF(s, tvMu + tvSigma, tvSigma));
        priors = bayesianUpdate(priors, tvLikelihoods.map(l =>
          Math.max(l, 1e-10) ** televoteWeight
        ));
      }

      // ── Step 4: Bookmaker odds → implied probability ─────
      const odds = contestants.map(c => c.bookmakerOdds ?? 0);
      if (odds.some(v => v > 0)) {
        // Convert decimal odds to implied probability; 0 → uniform
        const implied = odds.map(o => o > 1 ? 1 / o : 1 / n);
        // Normalize to remove overround (vig)
        const impliedSum = implied.reduce((a, b) => a + b, 0);
        const impliedNorm = implied.map(v => v / impliedSum);

        priors = bayesianUpdate(priors, impliedNorm.map(l =>
          Math.max(l, 1e-10) ** bookmakerWeight
        ));
      }

      // ── Step 5: Historical performance ───────────────────
      const wins = contestants.map(c => c.historicalWins ?? 0);
      if (wins.some(v => v > 0)) {
        // Beta distribution mean: (α+1) / (α+β+2) with weak prior
        const totalContests = 68; // Eurovision editions as of 2024
        const histProbs = wins.map(w => (w + 0.5) / (totalContests + 1));
        const histSum   = histProbs.reduce((a, b) => a + b, 0);
        const histNorm  = histProbs.map(v => v / histSum);

        priors = bayesianUpdate(priors, histNorm.map(l =>
          Math.max(l, 1e-10) ** historicalWeight
        ));
      }

      // ── Step 6: Semifinal position bonus ─────────────────
      const positions = contestants.map(c => c.semifinalPosition ?? null);
      if (positions.some(v => v !== null)) {
        const posLikelihoods = positions.map(pos => {
          if (pos === null) return 1;           // no data → neutral
          if (pos === 1)    return 1.4;         // won semi → big boost
          if (pos <= 3)     return 1.2;
          if (pos <= 5)     return 1.1;
          return Math.max(0.7, 1 - pos * 0.02);
        });
        priors = bayesianUpdate(priors, posLikelihoods);
      }

      // ── Step 7: Rehearsal rating ──────────────────────────
      const rehearsals = contestants.map(c => c.rehearsalRating ?? 0);
      if (rehearsals.some(v => v > 0)) {
        const rMax   = Math.max(...rehearsals) || 1;
        const rNorm  = rehearsals.map(v => v / rMax);
        priors = bayesianUpdate(priors, rNorm.map(l => Math.max(l, 1e-10) ** 0.2));
      }

      // ── Step 8: Renormalize & build result ───────────────
      const probSum = priors.reduce((a, b) => a + b, 0);
      const final   = priors.map(p => p / probSum);

      const results = contestants.map((c, i) => ({
        id:          c.id || String(i),
        name:        c.name,
        probability: Math.round(final[i] * 1000) / 10, // e.g., 12.4%
        rawProb:     final[i],
        rank:        0,     // filled below
        trend:       'flat',
      }));

      // Sort by probability descending
      results.sort((a, b) => b.rawProb - a.rawProb);
      results.forEach((r, i) => { r.rank = i + 1; });

      // Store in state for UI
      results.forEach(r => {
        const prev = state.forecast[r.id]?.probability;
        if (prev !== undefined) {
          r.trend = r.probability > prev + 0.5 ? 'up'
                  : r.probability < prev - 0.5 ? 'down'
                  : 'flat';
        }
        state.forecast[r.id] = { probability: r.probability };
      });

      return results;
    }

    /**
     * Render probability results into a .forecast-list container
     * @param {HTMLElement} container
     * @param {Array} results - output of calculateProbability()
     */
    function renderForecast(container, results) {
      if (!container) return;
      container.innerHTML = '';

      results.forEach((r, i) => {
        const item = document.createElement('div');
        item.className = `forecast-item${r.rank <= 3 ? ' top-3' : ''}${r.rank === 1 ? ' top-1' : ''}`;
        item.dataset.country = r.id;

        const trendClass  = `trend--${r.trend}`;
        const trendSymbol = r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '—';
        const barWidth    = Math.min(r.probability * 2, 100); // scale for bar

        item.innerHTML = `
          <div class="rank">${r.rank}</div>
          <div class="bar-wrapper">
            <div class="bar-label">${r.name}</div>
            <div class="bar-track">
              <div class="bar-fill" style="width: 0%" data-target="${barWidth}"></div>
            </div>
          </div>
          <div class="probability">${r.probability}%</div>
          <div class="trend ${trendClass}">${trendSymbol}</div>
        `;

        container.appendChild(item);

        // Animate bar with stagger
        setTimeout(() => {
          const fill = item.querySelector('.bar-fill');
          if (fill) fill.style.width = barWidth + '%';
        }, 100 + i * 60);
      });
    }

    return { calculateProbability, renderForecast, bayesianUpdate, gaussianCDF };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Countdown Timer                                 */
  /* ─────────────────────────────────────────────────────── */
  const Countdown = (() => {
    let interval;

    function init(targetDate) {
      state.countdownTarget = targetDate instanceof Date ? targetDate : new Date(targetDate);
      const containers = $$('[data-countdown]');
      if (!containers.length) return;

      render(containers);
      interval = setInterval(() => render(containers), 1000);
    }

    function getTimeLeft() {
      const now   = Date.now();
      const diff  = state.countdownTarget - now;
      if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0, expired: true };

      return {
        days:  Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        mins:  Math.floor((diff % 3600000)  / 60000),
        secs:  Math.floor((diff % 60000)    / 1000),
        expired: false,
      };
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function render(containers) {
      const time = getTimeLeft();

      containers.forEach(container => {
        const d = $('[data-countdown-days]',  container);
        const h = $('[data-countdown-hours]', container);
        const m = $('[data-countdown-mins]',  container);
        const s = $('[data-countdown-secs]',  container);

        if (d) updateUnit(d, pad(time.days));
        if (h) updateUnit(h, pad(time.hours));
        if (m) updateUnit(m, pad(time.mins));
        if (s) updateUnit(s, pad(time.secs));

        if (time.expired) {
          container.classList.add('countdown--expired');
          clearInterval(interval);
        }
      });
    }

    function updateUnit(el, newVal) {
      if (el.textContent === newVal) return;
      el.dataset.prev = el.textContent;
      el.textContent  = newVal;
    }

    return { init, getTimeLeft };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Confetti                                        */
  /* ─────────────────────────────────────────────────────── */
  const Confetti = (() => {
    let canvas, ctx, particles = [], animId;

    const COLORS = ['#ff2d78', '#ffe600', '#00f5ff', '#bf00ff', '#00ff88', '#fff'];

    function init() {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti-canvas';
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
      resize();
      on(window, 'resize', throttle(resize, 200));
    }

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function createParticle() {
      return {
        x:      Math.random() * canvas.width,
        y:      -10,
        vx:     (Math.random() - 0.5) * 4,
        vy:     Math.random() * 4 + 2,
        color:  COLORS[Math.floor(Math.random() * COLORS.length)],
        size:   Math.random() * 8 + 4,
        rot:    Math.random() * 360,
        rotV:   (Math.random() - 0.5) * 6,
        shape:  Math.random() > 0.5 ? 'rect' : 'circle',
        life:   1,
        decay:  Math.random() * 0.008 + 0.004,
      };
    }

    function burst(count = 120) {
      if (!canvas) init();
      particles = [];

      for (let i = 0; i < count; i++) {
        const p = createParticle();
        // Spread from center-top
        p.x  = canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.5;
        p.vy = Math.random() * 6 + 3;
        p.vx = (Math.random() - 0.5) * 8;
        particles.push(p);
      }

      cancelAnimationFrame(animId);
      animate();

      // Auto-stop after 5s
      setTimeout(stop, 5000);
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles = particles.filter(p => p.life > 0.01);

      particles.forEach(p => {
        p.x   += p.vx;
        p.y   += p.vy;
        p.vy  += 0.08; // gravity
        p.rot += p.rotV;
        p.life -= p.decay;

        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      if (particles.length > 0) {
        animId = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    function stop() {
      cancelAnimationFrame(animId);
      particles = [];
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return { init, burst, stop };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Navigation                                      */
  /* ─────────────────────────────────────────────────────── */
  const Nav = (() => {

    function init() {
      // Hamburger toggle
      const hamburger  = $('.hamburger');
      const mobileNav  = $('.mobile-nav');

      if (hamburger && mobileNav) {
        on(hamburger, 'click', () => {
          hamburger.classList.toggle('open');
          mobileNav.classList.toggle('open');
          hamburger.setAttribute('aria-expanded',
            hamburger.classList.contains('open'));
        });

        // Close on outside click
        on(document, 'click', (e) => {
          if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
            hamburger.classList.remove('open');
            mobileNav.classList.remove('open');
          }
        });

        // Close on nav link click
        $$('a', mobileNav).forEach(a => {
          on(a, 'click', () => {
            hamburger.classList.remove('open');
            mobileNav.classList.remove('open');
          });
        });
      }

      // Highlight active nav link
      const currentPath = window.location.pathname;
      $$('.header__nav a, .mobile-nav a').forEach(a => {
        if (a.getAttribute('href') === currentPath ||
            currentPath.endsWith(a.getAttribute('href'))) {
          a.classList.add('active');
        }
      });

      // Language switcher
      on(document, 'click', (e) => {
        const btn = e.target.closest('.lang-switcher button');
        if (!btn) return;
        const lang = btn.dataset.lang;
        if (lang) switchLang(lang);
      });
    }

    function switchLang(lang) {
      if (!['en', 'es', 'de'].includes(lang)) return;
      state.lang = lang;

      // Update switcher UI
      $$('.lang-switcher button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
      });

      // Redirect to language folder
      const currentPath = window.location.pathname;
      const filename = currentPath.split('/').pop() || 'index.html';

      let newPath;
      if (lang === 'en') {
        newPath = '/' + filename;
      } else {
        newPath = `/${lang}/${filename}`;
      }

      if (currentPath !== newPath) {
        window.location.href = newPath;
      }
    }

    return { init, switchLang };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Tabs                                            */
  /* ─────────────────────────────────────────────────────── */
  const Tabs = (() => {
    function init() {
      on(document, 'click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;

        const tabList  = btn.closest('.tab-list');
        const tabs     = tabList?.closest('.tabs');
        if (!tabs) return;

        const target   = btn.dataset.tab;
        const panels   = $$('.tab-panel', tabs);
        const buttons  = $$('.tab-btn', tabs);

        buttons.forEach(b => b.classList.toggle('active', b === btn));
        panels.forEach(p => p.classList.toggle('active', p.dataset.tab === target));
      });
    }
    return { init };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Clipboard / Share                               */
  /* ─────────────────────────────────────────────────────── */
  const Share = (() => {
    function copy(text) {
      navigator.clipboard?.writeText(text).then(() => {
        Toast.show(t('copied'), { type: 'success' });
      }).catch(() => {
        // Fallback for older browsers
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
        Toast.show(t('copied'), { type: 'success' });
      });
    }

    async function shareNative(data) {
      if (navigator.share) {
        try {
          await navigator.share(data);
        } catch (e) {
          if (e.name !== 'AbortError') copy(data.url || data.text);
        }
      } else {
        copy(data.url || data.text);
      }
    }

    function init() {
      on(document, 'click', (e) => {
        const btn = e.target.closest('[data-copy]');
        if (btn) {
          copy(btn.dataset.copy || window.location.href);
        }

        const shareBtn = e.target.closest('[data-share]');
        if (shareBtn) {
          shareNative({
            title: 'Eurovision Tools',
            text:  t('share_text'),
            url:   window.location.href,
          });
        }
      });
    }

    return { init, copy, shareNative };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Scroll Animations (Intersection Observer)       */
  /* ─────────────────────────────────────────────────────── */
  const ScrollAnim = (() => {
    function init() {
      if (!('IntersectionObserver' in window)) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      // Observe elements with animation classes
      $$('.anim-fade-up, .anim-fade-in, .anim-scale-in, .anim-slide-r, [data-animate]')
        .forEach(el => {
          el.classList.add('pre-anim'); // hide before trigger
          observer.observe(el);
        });
    }
    return { init };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Particles (hero background)                     */
  /*  - Respects prefers-reduced-motion                       */
  /*  - Pauses via IntersectionObserver when out of viewport  */
  /*  - Lower count on mobile to reduce paint cost            */
  /* ─────────────────────────────────────────────────────── */
  const Particles = (() => {
    function init() {
      const hero = $('.particles');
      if (!hero) return;

      // Respect OS-level reduced-motion setting — skip entirely.
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;

      const count  = window.innerWidth < 768 ? 8 : 18;
      const colors = ['var(--clr-pink)', 'var(--clr-cyan)', 'var(--clr-yellow)'];

      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';

        const size  = Math.random() * 4 + 2;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left  = Math.random() * 100;
        const dur   = Math.random() * 10 + 8;
        const delay = Math.random() * -20;

        p.style.cssText = `
          left: ${left}%;
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          box-shadow: 0 0 ${size * 3}px ${color};
          animation-duration: ${dur}s;
          animation-delay: ${delay}s;
        `;

        hero.appendChild(p);
      }

      // Pause the whole particles layer when the hero is off-screen
      // so we don't burn GPU cycles animating invisible elements.
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            hero.style.animationPlayState =
              e.isIntersecting ? 'running' : 'paused';
            $$('.particle', hero).forEach(p => {
              p.style.animationPlayState =
                e.isIntersecting ? 'running' : 'paused';
            });
          });
        }, { threshold: 0 });
        io.observe(hero);
      }
    }
    return { init };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  MODULE: Modal                                           */
  /* ─────────────────────────────────────────────────────── */
  const Modal = (() => {
    function open(id) {
      const overlay = $(`#${id}, [data-modal="${id}"]`);
      if (overlay) {
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        on(overlay, 'click', handleOutsideClick);
      }
    }

    function close(id) {
      const overlays = id
        ? [$(`#${id}, [data-modal="${id}"]`)]
        : $$('.modal-overlay.open');

      overlays.forEach(overlay => {
        if (!overlay) return;
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        off(overlay, 'click', handleOutsideClick);
      });
    }

    function handleOutsideClick(e) {
      if (e.target.classList.contains('modal-overlay')) close();
    }

    function init() {
      on(document, 'click', (e) => {
        const openBtn  = e.target.closest('[data-modal-open]');
        const closeBtn = e.target.closest('[data-modal-close]');

        if (openBtn)  open(openBtn.dataset.modalOpen);
        if (closeBtn) close(closeBtn.dataset.modalClose);
      });

      // ESC key
      on(document, 'keydown', (e) => {
        if (e.key === 'Escape') close();
      });
    }

    return { init, open, close };
  })();

  /* ─────────────────────────────────────────────────────── */
  /*  INIT — Bootstrap all modules                            */
  /* ─────────────────────────────────────────────────────── */
  function init() {
    // Detect language from path
    const path = window.location.pathname;
    if (path.includes('/es/')) state.lang = 'es';
    else if (path.includes('/de/')) state.lang = 'de';

    // Sync lang switcher button
    $$('.lang-switcher button').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === state.lang);
    });

    // Boot modules
    ProgressBar.init();
    Toast.init();
    Confetti.init();
    Nav.init();
    Tabs.init();
    Bingo.init();
    ScoreCalc.init();
    Share.init();
    Modal.init();
    Particles.init();
    ScrollAnim.init();

    // Eurovision 2025 Grand Final date (Basel, Switzerland)
    // Saturday, May 17, 2025 — 21:00 CEST
    Countdown.init(new Date('2026-05-16T21:00:00+02:00'));

    // Mark page as loaded
    window.addEventListener('load', () => {
      ProgressBar.complete();
      document.body.classList.add('loaded');
    });

    // Expose forecast engine on window for HTML pages to use
    window.calculateProbability = ProbabilityEngine.calculateProbability;
    window.renderForecast = ProbabilityEngine.renderForecast;
  }

  /* ─────────────────────────────────────────────────────── */
  /*  PUBLIC API                                              */
  /* ─────────────────────────────────────────────────────── */
  return {
    init,
    state,
    t,
    Toast,
    Confetti,
    Bingo,
    ScoreCalc,
    ProbabilityEngine,
    Countdown,
    Nav,
    Modal,
    Share,
  };

})(); // end EurovisionApp

/* ── Boot ────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', EurovisionApp.init);
} else {
  EurovisionApp.init();
}

/* ── Global convenience exports ─────────────────────────── */
window.EurovisionApp = EurovisionApp;


 

 
/* ══════════════════════════════════════════════════════════
   TICKET GENERATOR MODULE
   Namespace: TicketGen
   Dependencies: Fabric.js v5
═══════════════════════════════════════════════════════════ */
 
const TicketGen = (() => {
 
  /* ── Canvas dimensions ─────────────────────────────────
     Display size.
     Download uses multiplier 2.5 → ~2250 × 937 px           */
  const W = 900;
  const H = 375;
  const STUB_X = 718; // main body / stub split
 
  /* ── Photo circle geometry ────────────────────────────── */
  const PHOTO = { cx: 165, cy: 198, r: 115 };
 
  /* ── Show type data ───────────────────────────────────── */
  const SHOWS = {
    GF:     { label: 'GRAND FINAL',        date: '16 MAY 2026 · SAT' },
    SF1:    { label: 'SEMI-FINAL 1',        date: '12 MAY 2026 · TUE' },
    SF2:    { label: 'SEMI-FINAL 2',        date: '14 MAY 2026 · THU' },
    GF_P:   { label: 'GF PREVIEW',          date: '16 MAY 2026 · SAT' },
    SF1_AF: { label: 'SF1 AFTERNOON',       date: '12 MAY 2026 · TUE' },
    SF2_AF: { label: 'SF2 AFTERNOON',       date: '14 MAY 2026 · THU' },
  };
 
  /* ── State ────────────────────────────────────────────── */
  let fc = null;              // Fabric.Canvas instance
  let photoFabricImg = null;  // loaded FabricImage
  let rendering = false;
 
  const state = {
    showKey:   'GF',
    name:      '',
    block:     'A',
    row:       'F',
    seat:      '14',
    ticketNum: '001234',
  };
 
  /* ── Seat randomiser ───────────────────────────────────── */
  function randSeat() {
    const blks = 'ABCDEF';
    const rows = 'ABCDEFGHIJKLMNOPQRST';
    state.block    = blks[Math.floor(Math.random() * blks.length)];
    state.row      = rows[Math.floor(Math.random() * rows.length)];
    state.seat     = String(Math.floor(Math.random() * 40) + 1).padStart(2, '0');
    state.ticketNum = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
    // sync display spans
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('tg-disp-block', state.block);
    set('tg-disp-row',   state.row);
    set('tg-disp-seat',  state.seat);
  }
 
  /* ── Fabric.js drawing helpers ─────────────────────────── */
 
  const addRect = (opts) => {
    const o = new fabric.Rect({ selectable:false, evented:false, strokeWidth:0, ...opts });
    fc.add(o); return o;
  };
  const addEllipse = (opts) => {
    const o = new fabric.Ellipse({ selectable:false, evented:false, strokeWidth:0, stroke:null, ...opts });
    fc.add(o); return o;
  };
  const addCircle = (opts) => {
    const o = new fabric.Circle({ selectable:false, evented:false, ...opts });
    fc.add(o); return o;
  };
  const addLine = (pts, opts) => {
    const o = new fabric.Line(pts, { selectable:false, evented:false, ...opts });
    fc.add(o); return o;
  };
  const addText = (str, opts) => {
    const o = new fabric.Text(String(str), { selectable:false, evented:false, ...opts });
    fc.add(o); return o;
  };
 
  /* ── DRAW: Background ─────────────────────────────────── */
  function drawBackground() {
    // Main body — deep navy
    addRect({ left:0, top:0, width: STUB_X, height: H, fill: '#070b30' });
    // Stub — slightly lighter
    addRect({ left: STUB_X, top:0, width: W - STUB_X, height: H, fill: '#0c1040' });
  }
 
  /* ── DRAW: Decorative colour orbs ────────────────────── */
  function drawOrbs() {
    // Hot pink / magenta (dominant, lower-left)
    addEllipse({ left:-90, top:130, rx:220, ry:185, fill:'rgba(225,35,115,0.55)', angle: -15 });
    // Magenta lighter (upper sweep)
    addEllipse({ left:-30, top:20,  rx:150, ry:110, fill:'rgba(255,70,175,0.28)', angle: 20 });
    // Cyan / teal (upper-left)
    addEllipse({ left:50,  top:-50, rx:170, ry:120, fill:'rgba(0,205,240,0.28)', angle: -10 });
    // Deep purple (centre)
    addEllipse({ left:200, top:180, rx:140, ry:105, fill:'rgba(105,25,205,0.32)', angle: 5 });
    // Orange accent
    addEllipse({ left:310, top:130, rx:110, ry:85,  fill:'rgba(255,110,15,0.22)', angle: -5 });
    // Teal wash (bottom centre)
    addEllipse({ left:120, top:290, rx:200, ry:70,  fill:'rgba(0,230,165,0.14)', angle: 0 });
    // Small pink highlight (top right of photo zone)
    addEllipse({ left:240, top:55,  rx:70,  ry:55,  fill:'rgba(255,80,200,0.22)', angle: 15 });
  }
 
  /* ── DRAW: Music notes ────────────────────────────────── */
  function drawNotes() {
    const notes = [
      { s:'♪', x:52,  y:12,  sz:18, op:0.28 },
      { s:'♫', x:615, y:22,  sz:22, op:0.24 },
      { s:'♪', x:665, y:265, sz:16, op:0.20 },
      { s:'♫', x:490, y:295, sz:14, op:0.20 },
      { s:'♪', x:18,  y:288, sz:14, op:0.18 },
      { s:'♩', x:110, y:38,  sz:16, op:0.18 },
      { s:'♫', x:380, y:10,  sz:12, op:0.16 },
    ];
    notes.forEach(n => {
      addText(n.s, { left:n.x, top:n.y, fontSize:n.sz,
                     fill:`rgba(255,255,255,${n.op})`, fontFamily:'serif' });
    });
  }
 
  /* ── DRAW: Header strip ───────────────────────────────── */
  function drawHeader() {
    // Subtle top strip
    addRect({ left:0, top:0, width: STUB_X, height:50, fill:'rgba(0,0,0,0.22)' });
 
    // Main title
    addText('EUROVISION 2026 — VIENNA', {
      left:18, top:9,
      fontSize: 27,
      fill: '#ffffff',
      fontFamily: 'Bebas Neue, Impact, sans-serif',
      charSpacing: 35,
      fontWeight: '400',
    });
 
    // Heart icon
    addText('💙', { left:572, top:6, fontSize:24 });
 
    // Sub-label
    addText('OFFICIAL FAN TICKET · NOT FOR SALE', {
      left: 19, top: 36,
      fontSize: 8,
      fill: 'rgba(255,255,255,0.28)',
      fontFamily: 'Space Mono, Courier, monospace',
      charSpacing: 55,
    });
  }
 
  /* ── DRAW: Photo circle ───────────────────────────────── */
  function drawPhotoArea() {
    const { cx, cy, r } = PHOTO;
 
    // Outer soft glow ring
    addCircle({
      left:cx, top:cy, radius: r + 15,
      originX:'center', originY:'center',
      fill:'transparent',
      stroke:'rgba(255,255,255,0.10)',
      strokeWidth: 22,
    });
 
    // Dotted border ring
    addCircle({
      left:cx, top:cy, radius: r + 5,
      originX:'center', originY:'center',
      fill:'transparent',
      stroke:'rgba(255,255,255,0.65)',
      strokeWidth: 2,
      strokeDashArray: [7, 5],
    });
 
    if (photoFabricImg) {
      // Scale photo to fill the circle
      const minDim = Math.min(photoFabricImg.width, photoFabricImg.height);
      const scale  = (r * 2) / minDim;
 
      const clip = new fabric.Circle({
        radius: r - 2 / scale,
        left: cx,                 // <--- ДОБАВИТЬ
        top: cy,                  // <--- ДОБАВИТЬ
        originX: 'center',
        originY: 'center',
        absolutePositioned: true,
      });

 
      photoFabricImg.set({
        left: cx, top: cy,
        originX: 'center', originY: 'center',
        scaleX: scale, scaleY: scale,
        clipPath: clip,
        selectable: false, evented: false,
      });
      fc.add(photoFabricImg);
 
    } else {
      // Placeholder fill
      addCircle({
        left:cx, top:cy, radius: r - 2,
        originX:'center', originY:'center',
        fill:'rgba(255,255,255,0.04)',
        strokeWidth:0,
      });
      // Placeholder person icon
      addText('👤', {
        left:cx, top:cy - 18,
        fontSize:54,
        originX:'center', originY:'center',
        opacity: 0.45,
      });
      addText('YOUR PHOTO', {
        left:cx, top:cy + 30,
        fontSize:10.5,
        fill:'rgba(255,255,255,0.50)',
        fontFamily:'Space Mono, Courier, monospace',
        fontWeight:'700', originX:'center',
        charSpacing:50,
      });
      addText('HERE', {
        left:cx, top:cy + 47,
        fontSize:10.5,
        fill:'rgba(255,255,255,0.50)',
        fontFamily:'Space Mono, Courier, monospace',
        fontWeight:'700', originX:'center',
        charSpacing:50,
      });
    }
  }
 
  /* ── DRAW: Field box helper ───────────────────────────── */
  function drawField(x, y, w, h, label, value, valSize = 15) {
    addRect({
      left:x, top:y, width:w, height:h, rx:8, ry:8,
      fill:'rgba(255,255,255,0.055)',
      stroke:'rgba(255,255,255,0.42)',
      strokeWidth:1.5,
    });
    addText(label, {
      left:x+10, top:y+8,
      fontSize:9.5,
      fill:'rgba(255,255,255,0.55)',
      fontFamily:'Space Mono, Courier, monospace',
      fontWeight:'700',
      charSpacing:65,
    });
    if (value) {
      // Clamp text so it doesn't overflow the box
      const maxW = w - 18;
      addText(value, {
        left:x+10, top:y+25,
        fontSize:valSize,
        fill:'#ffffff',
        fontFamily:'Bebas Neue, Impact, sans-serif',
        charSpacing:20,
        // Fabric.js v5: limit width
        width: maxW,
        splitByGrapheme: false,
      });
    }
  }
 
  /* ── DRAW: Main data fields ───────────────────────────── */
  function drawFields() {
    const show = SHOWS[state.showKey];
    const FX   = 308; // fields left edge
 
    // Row 1 — SHOW TYPE | DATE
    drawField(FX,       62, 190, 64, 'SHOW TYPE:', show.label, 13);
    drawField(FX + 200, 62, 192, 64, 'DATE:',      show.date,  12.5);
 
    // Row 2 — NAME (full width)
    drawField(FX, 136, 396, 64, 'NAME:',
      state.name ? state.name.toUpperCase().slice(0, 24) : '', 19);
 
    // Row 3 — BLOCK | ROW | SEAT
    drawField(FX,       210, 112, 64, 'BLOCK:', state.block, 24);
    drawField(FX + 122, 210, 112, 64, 'ROW:',   state.row,   24);
    drawField(FX + 244, 210, 148, 64, 'SEAT:',  state.seat,  24);
  }
 
  /* ── DRAW: Bottom bar ─────────────────────────────────── */
  function drawBottomBar() {
    addLine([0, 320, STUB_X, 320], {
      stroke:'rgba(255,255,255,0.12)', strokeWidth:1,
    });
 
    addText('WIENER STADTHALLE, HALLE D  ·  AUSTRIA 2026', {
      left:18, top:330,
      fontSize:10.5,
      fill:'rgba(255,255,255,0.48)',
      fontFamily:'Space Mono, Courier, monospace',
      charSpacing:22,
    });
 
    addText('EBU', {
      left:535, top:325,
      fontSize:13,
      fill:'rgba(255,255,255,0.65)',
      fontFamily:'Bebas Neue, Impact, sans-serif',
      charSpacing:90,
    });
 
    addText('VIENNA CITY', {
      left:575, top:325,
      fontSize:13,
      fill:'rgba(255,255,255,0.55)',
      fontFamily:'Bebas Neue, Impact, sans-serif',
      charSpacing:50,
    });
 
    addText('Fan-made · Not affiliated with EBU or the Eurovision Song Contest', {
      left:18, top:354,
      fontSize:8,
      fill:'rgba(255,255,255,0.20)',
      fontFamily:'Space Mono, Courier, monospace',
      charSpacing:15,
    });
  }
 
  /* ── DRAW: QR code (simulated) ────────────────────────── */
  function drawQR(x, y, size) {
    const cs = size / 25; // cell size
 
    // White background
    addRect({ left:x, top:y, width:size, height:size, rx:4, ry:4, fill:'#ffffff' });
 
    // Finder pattern helper
    function finder(fx, fy) {
      addRect({ left:fx,      top:fy,      width:cs*7, height:cs*7, fill:'#111' });
      addRect({ left:fx+cs,   top:fy+cs,   width:cs*5, height:cs*5, fill:'#fff' });
      addRect({ left:fx+cs*2, top:fy+cs*2, width:cs*3, height:cs*3, fill:'#111' });
    }
    finder(x + cs,              y + cs);
    finder(x + size - cs*8,     y + cs);
    finder(x + cs,              y + size - cs*8);
 
    // Small alignment pattern (centre-right)
    const ap = { fx: x + size - cs*9, fy: y + size - cs*9 };
    addRect({ left:ap.fx,      top:ap.fy,      width:cs*5, height:cs*5, fill:'#111' });
    addRect({ left:ap.fx+cs,   top:ap.fy+cs,   width:cs*3, height:cs*3, fill:'#fff' });
    addRect({ left:ap.fx+cs*2, top:ap.fy+cs*2, width:cs,   height:cs,   fill:'#111' });
 
    // Timing strips (row 6 + col 6)
    for (let i = 8; i < 17; i++) {
      if (i % 2 === 0) {
        addRect({ left:x + i*cs,    top:y + cs*6,  width:cs-0.2, height:cs-0.2, fill:'#111' });
        addRect({ left:x + cs*6,    top:y + i*cs,  width:cs-0.2, height:cs-0.2, fill:'#111' });
      }
    }
 
    // Seeded pseudo-random data dots
    let seed = parseInt(state.ticketNum, 10) || 12345;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xFFFFFFFF;
    };
 
    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 25; col++) {
        // Skip finder pattern zones
        if (row < 10 && col < 10) continue;
        if (row < 10 && col > 14) continue;
        if (row > 14 && col < 10) continue;
        if (row > 14 && col > 14) continue;
        // Skip timing strip zone
        if (row === 6 || col === 6) continue;
        if (rng() > 0.52) {
          addRect({
            left: x + col * cs + 0.2,
            top:  y + row * cs + 0.2,
            width: cs - 0.4, height: cs - 0.4,
            fill: '#111',
          });
        }
      }
    }
  }
 
  /* ── DRAW: Stub (right side) ─────────────────────────── */
  function drawStub() {
    const SX   = STUB_X + 1;
    const SW   = W - SX;
    const SCX  = SX + SW / 2; // stub centre X
 
    // Vertical dashed separator
    addLine([STUB_X, 12, STUB_X, H - 12], {
      stroke:'rgba(255,255,255,0.30)',
      strokeWidth:1.5,
      strokeDashArray:[6,5],
    });
 
    // Perforated half-circles on separator
    [80, 160, 240, 300].forEach(y => {
      addCircle({
        left: STUB_X, top: y, radius:8,
        originX:'center', originY:'center',
        fill:'#070b30', strokeWidth:0,
      });
    });
 
    // ── ESC Logo area ────────────────────────────────────
    addText('ESC', {
      left:SCX - 4, top:14,
      fontSize:22,
      fill:'#ffffff',
      fontFamily:'Bebas Neue, Impact, sans-serif',
      originX:'center',
      charSpacing:80,
    });
    // Heart overlaid
    addText('💙', { left:SCX + 14, top:12, fontSize:13 });
 
    addText('2026', {
      left:SCX, top:35,
      fontSize:17,
      fill:'#ffffff',
      fontFamily:'Bebas Neue, Impact, sans-serif',
      originX:'center',
      charSpacing:50,
    });
 
    addText('Vienna', {
      left:SCX, top:53,
      fontSize:9.5,
      fill:'rgba(255,255,255,0.55)',
      fontFamily:'Space Mono, Courier, monospace',
      originX:'center',
      fontStyle:'italic',
    });
 
    // ── QR code ──────────────────────────────────────────
    const qrSize = SW - 30;
    const qrX    = SX + 15;
    const qrY    = 72;
    drawQR(qrX, qrY, qrSize);
 
    // ── Ticket code ──────────────────────────────────────
    const codeStr = 'ESC2026_' + state.showKey + '_' + state.ticketNum;
    addText(codeStr, {
      left:SCX, top:qrY + qrSize + 8,
      fontSize:6.5,
      fill:'rgba(255,255,255,0.42)',
      fontFamily:'Space Mono, Courier, monospace',
      originX:'center',
    });
 
    addText('SCAN FOR ENTRY', {
      left:SCX, top:qrY + qrSize + 20,
      fontSize:7.5,
      fill:'rgba(255,255,255,0.50)',
      fontFamily:'Space Mono, Courier, monospace',
      originX:'center',
      charSpacing:35,
    });
 
    // Separator line
    const l1Y = qrY + qrSize + 36;
    addLine([SX + 10, l1Y, W - 10, l1Y], {
      stroke:'rgba(255,255,255,0.18)', strokeWidth:1,
    });
 
    // Ticket number (big)
    addText(state.ticketNum, {
      left:SCX, top: l1Y + 6,
      fontSize:24,
      fill:'#ffffff',
      fontFamily:'Bebas Neue, Impact, sans-serif',
      originX:'center',
      charSpacing:50,
    });
 
    // Separator line
    const l2Y = l1Y + 40;
    addLine([SX + 10, l2Y, W - 10, l2Y], {
      stroke:'rgba(255,255,255,0.18)', strokeWidth:1,
    });
 
    // Price
    addText('€195.00', {
      left:SCX, top: l2Y + 6,
      fontSize:19,
      fill:'#ffffff',
      fontFamily:'Bebas Neue, Impact, sans-serif',
      originX:'center',
      charSpacing:25,
    });
 
    // Separator line
    const l3Y = l2Y + 36;
    addLine([SX + 10, l3Y, W - 10, l3Y], {
      stroke:'rgba(255,255,255,0.18)', strokeWidth:1,
    });
 
    // ADMIT ONE
    addText('ADMIT ONE', {
      left:SCX, top: l3Y + 7,
      fontSize:16,
      fill:'#ffffff',
      fontFamily:'Bebas Neue, Impact, sans-serif',
      originX:'center',
      charSpacing:80,
    });
  }
 
  /* ── DRAW: Rounded corners clip ───────────────────────── */
  function drawRoundedCornersMask() {
    // Fabric.js canvas doesn't support border-radius natively,
    // so we overdraw dark corners to fake it.
    const R = 14;
    const DARK = '#000000';
    // We skip this since the CSS on the wrapper handles it visually.
  }
 
  /* ── MAIN RENDER ──────────────────────────────────────── */
  function render() {
    if (!fc) return;
    if (rendering) return;
    rendering = true;
 
    // Show loader
    const loader = document.getElementById('tg-canvas-loader');
    if (loader) loader.classList.remove('hidden');
 
    fc.clear();
 
    // Draw all layers in order (back → front)
    drawBackground();
    drawOrbs();
    drawNotes();
    drawHeader();
    drawPhotoArea();
    drawFields();
    drawStub();
    drawBottomBar();
 
    fc.renderAll();
    rendering = false;
 
    // Hide loader
    requestAnimationFrame(() => {
      if (loader) loader.classList.add('hidden');
    });
  }
 
  /* ── DOWNLOAD ─────────────────────────────────────────── */
  function download() {
    const loader = document.getElementById('tg-canvas-loader');
    if (loader) loader.classList.remove('hidden');
 
    setTimeout(() => {
      const dataURL = fc.toDataURL({
        format:     'png',
        multiplier: 2.5,   // → ~2250×937 px
        quality:    1,
      });
 
      const a = document.createElement('a');
      a.href     = dataURL;
      a.download = `ESC2026-Ticket-${state.showKey}-${state.ticketNum}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
 
      if (loader) loader.classList.add('hidden');
 
      // Toast notification (integrates with existing EurovisionApp)
      if (window.EurovisionApp?.Toast) {
        EurovisionApp.Toast.show(
          'Ticket saved as PNG · Share it with your friends! 🎫',
          { type: 'success', title: '🏆 Ticket Downloaded!' }
        );
        EurovisionApp.Confetti?.burst();
      }
    }, 80);
  }
 
  /* ── PHOTO UPLOAD HANDLER ─────────────────────────────── */
  function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      if (window.EurovisionApp?.Toast) {
        EurovisionApp.Toast.show('File too large. Max 10 MB.', { type: 'error' });
      }
      return;
    }
 
    const reader = new FileReader();
    reader.onload = (evt) => {
      fabric.Image.fromURL(evt.target.result, (img) => {
        photoFabricImg = img;
        render();
 
        // Visual feedback on upload zone
        const zone = document.getElementById('tg-upload-zone');
        if (zone) {
          zone.classList.add('has-photo');
          const text = zone.querySelector('.tg-upload-zone__text');
          if (text) text.innerHTML = '<strong>Photo loaded ✓</strong> — click to change';
        }
 
        if (window.EurovisionApp?.Toast) {
          EurovisionApp.Toast.show('Photo added to your ticket!', { type: 'success' });
        }
      });
    };
    reader.readAsDataURL(file);
  }
 
  /* ── DRAG & DROP support ──────────────────────────────── */
  function setupDragDrop() {
    const zone = document.getElementById('tg-upload-zone');
    if (!zone) return;
 
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        // Reuse the same handler via synthetic event
        const input = document.getElementById('tg-photo');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }
 
  /* ── DEBOUNCE (reuse site utility or define locally) ──── */
  const _debounceTG = (fn, delay = 250) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  };
 
  /* ── INIT ─────────────────────────────────────────────── */
  function init() {
    if (!document.getElementById('ticket-canvas')) return;
    if (typeof fabric === 'undefined') {
      console.error('TicketGen: Fabric.js not loaded. Add the CDN script to <head>.');
      return;
    }
 
    // Create Fabric canvas
    fc = new fabric.Canvas('ticket-canvas', {
      width:  W,
      height: H,
      selection:         false,
      renderOnAddRemove: false,
      enableRetinaScaling: false,
    });
 
    // Kick off initial random seat & render
    randSeat();
 
    // Wait for fonts then draw
    const doRender = () => render();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(doRender);
    } else {
      setTimeout(doRender, 400);
    }
 
    // ── Event listeners ──────────────────────────────────
 
    // Show type
    document.getElementById('tg-show')
      ?.addEventListener('change', (e) => {
        state.showKey = e.target.value;
        render();
      });
 
    // Name (debounced)
    document.getElementById('tg-name')
      ?.addEventListener('input', _debounceTG((e) => {
        state.name = e.target.value;
        render();
      }, 180));
 
    // Photo upload
    document.getElementById('tg-photo')
      ?.addEventListener('change', handlePhotoUpload);
 
    // Drag & drop
    setupDragDrop();
 
    // Randomize seat
    document.getElementById('tg-randomize')
      ?.addEventListener('click', () => {
        randSeat();
        render();
        if (window.EurovisionApp?.Toast) {
          EurovisionApp.Toast.show(
            `New seat: Block ${state.block} · Row ${state.row} · Seat ${state.seat}`,
            { type: 'info' }
          );
        }
      });
 
    // Download
    document.getElementById('tg-download')
      ?.addEventListener('click', download);
  }
 
  /* ── PUBLIC API ───────────────────────────────────────── */
  return { init, render };
 
})();
 
/* Auto-init if DOM already ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', TicketGen.init);
} else {
  // Small delay to ensure Fabric.js is parsed
  setTimeout(TicketGen.init, 0);
}