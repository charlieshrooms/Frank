// ==UserScript==
// @name         BetFury Dice Bot - Uriel Mode V20.2
// @version      20.2
// @description  Uriel V20.2: Stronger auto-restart vs TheFreshMaker — starts and continuously runs
// @match        https://betfury.io/casino/games/dice
// @match        https://betfury.io/*/casino/games/dice*
// @match        https://betfury.com/casino/games/dice
// @match        https://betfury.com/*/casino/games/dice*
// @run-at       document-idle
// @grant        none
// @namespace    https://greasyfork.org/users/1550232
// ==/UserScript==

(function () {
  'use strict';

  // ==================== PRESETS ====================
  const PRESET_STORAGE_KEY = 'bot_preset_mode_v20';
  const PRESETS = {
    safe: {
      label: 'SAFE',
      betRatio: 0.00008,
      targetChance: 40.0,
      lossIncrease: 1.35,
      lossesBeforeDirectionSwitch: 4,
      winsBeforeSeedRefresh: 3,
      maxLossStreak: 12,
    },
    balanced: {
      label: 'BALANCED',
      betRatio: 0.000125,
      targetChance: 32.67,
      lossIncrease: 1.5,
      lossesBeforeDirectionSwitch: 3,
      winsBeforeSeedRefresh: 2,
      maxLossStreak: 18,
    },
    aggressive: {
      label: 'AGGRESSIVE',
      betRatio: 0.0002,
      targetChance: 28.0,
      lossIncrease: 1.65,
      lossesBeforeDirectionSwitch: 2,
      winsBeforeSeedRefresh: 2,
      maxLossStreak: 8,
    },
  };
  const DEFAULT_PRESET = 'balanced';

  // ==================== HARDENING CONSTANTS ====================
  const MAX_BET_PERCENT_OF_BALANCE = 0.03;
  const MIN_BET_FALLBACK = 0.00000001;
  const ACTION_DELAY_MS = 700;
  const ROLL_SETTLE_MS = 2600;
  const AUTO_RUN_DELAY_MS = 5200; // longer delay to let SPA/TheFreshMaker settle
  const RELOAD_DELAY_MS = 1200;   // brief pause before location.reload()
  const MAX_AUTO_RELOAD_CYCLES = 200;
  const STORAGE = {
    autoRun: 'bot_auto_run_v20',
    autoReloadCycles: 'bot_auto_reload_cycles_v20',
    seedTotal: 'bot_seed_total_v20',
    startBet: 'bot_start_bet_v20',
  };
  const RUN_LOCK_KEY = 'bot_run_lock_v20';
  const RUN_LOCK_TIMEOUT_MS = 15000;

  // ==================== SELECTORS ====================
  const SEL = {
    balance: [
      'span.currency span span',
      '.balance__value',
      '.wallet-balance',
      '[data-testid="wallet-balance"]',
      '.header-wallet__value',
      '[class*="balance"]',
    ],
    amountInput: '.amount__center input, input[data-test*="bet"], input[data-test*="amount"], input[type="text"], input[type="number"]',
    rollButton: 'button[type="submit"], button[data-test*="bet"], .dice__roll button, .bet-button button',
  };

  // ==================== STATE ====================
  let isRunning = false;
  let winCount = 0;
  let lossCount = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let currentBet = 0;
  let lastBalance = 0;
  let currentDirection = 'under';
  let activePresetName = getStoredPresetName();
  let preset = PRESETS[activePresetName];

  let seedCounter = parseInt(localStorage.getItem(STORAGE.seedTotal), 10);
  if (!Number.isInteger(seedCounter) || seedCounter < 0) seedCounter = 0;

  function createInstanceId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint32Array(4);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(16).padStart(8, '0')).join('-');
    }

    const perfNow = typeof performance !== 'undefined' ? performance.now() : 0;
    let counter = 0;
    try {
      const rawCounter = parseInt(localStorage.getItem('bot_instance_counter_v20'), 10);
      counter = (Number.isInteger(rawCounter) ? rawCounter : 0) + 1;
      localStorage.setItem('bot_instance_counter_v20', String(counter));
    } catch {}
    return `${Date.now().toString(36)}-${Math.floor(perfNow * 1000).toString(36)}-${counter.toString(36)}`;
  }

  const INSTANCE_ID = createInstanceId();

  // ==================== HELPERS ====================
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getStoredPresetName() {
    const raw = String(localStorage.getItem(PRESET_STORAGE_KEY) || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(PRESETS, raw) ? raw : DEFAULT_PRESET;
  }

  function applyPreset(name, opts = { persist: true, log: true }) {
    const valid = Object.prototype.hasOwnProperty.call(PRESETS, name) ? name : DEFAULT_PRESET;
    activePresetName = valid;
    preset = PRESETS[valid];
    if (opts.persist) localStorage.setItem(PRESET_STORAGE_KEY, activePresetName);
    updateStatsUi();
    if (opts.log) addLog(`PRESET APPLIED: ${preset.label}`);
  }

  function getBalance() {
    for (const sel of SEL.balance) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = (el.textContent || '').replace(/,/g, '');
      const match = raw.match(/(\d+(?:\.\d+)?)/);
      const parsed = match ? parseFloat(match[1]) : NaN;
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  }

  function parseBetNumber(raw) {
    const parsed = parseFloat(String(raw || '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
  }

  function getCurrentInputMin() {
    const input = document.querySelector(SEL.amountInput);
    if (!input) return MIN_BET_FALLBACK;

    const minAttr = parseBetNumber(input.getAttribute('min'));
    if (!Number.isNaN(minAttr)) return minAttr;

    const stepAttr = parseBetNumber(input.getAttribute('step'));
    if (!Number.isNaN(stepAttr)) return stepAttr;

    return MIN_BET_FALLBACK;
  }

  function getStartingBet(balance) {
    const raw = localStorage.getItem(STORAGE.startBet);
    const parsed = parseFloat(String(raw || '').replace(/,/g, '').trim());
    if (Number.isFinite(parsed) && parsed > 0) return getSafeBet(parsed, balance);
    return getSafeBet(balance * preset.betRatio, balance);
  }

  function getSafeBet(proposed, balance) {
    const minBet = getCurrentInputMin();
    const maxBetCap = balance * MAX_BET_PERCENT_OF_BALANCE;
    if (maxBetCap < minBet) return 0;
    return Math.min(Math.max(proposed, minBet), maxBetCap);
  }

  function setInputValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ==================== RUN LOCK ====================
  function acquireRunLock() {
    try {
      const raw = localStorage.getItem(RUN_LOCK_KEY);
      if (!raw) {
        localStorage.setItem(RUN_LOCK_KEY, JSON.stringify({ id: INSTANCE_ID, ts: Date.now() }));
        return true;
      }
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts || 0);
      const id = String(parsed?.id || '');
      if (id && Date.now() - ts < RUN_LOCK_TIMEOUT_MS && id !== INSTANCE_ID) return false;
      localStorage.setItem(RUN_LOCK_KEY, JSON.stringify({ id: INSTANCE_ID, ts: Date.now() }));
      return true;
    } catch {
      return true;
    }
  }

  function refreshRunLock() {
    try {
      localStorage.setItem(RUN_LOCK_KEY, JSON.stringify({ id: INSTANCE_ID, ts: Date.now() }));
    } catch {}
  }

  function releaseRunLock() {
    try {
      const raw = localStorage.getItem(RUN_LOCK_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.id === INSTANCE_ID) localStorage.removeItem(RUN_LOCK_KEY);
    } catch {}
  }

  // ==================== UI HELPERS ====================
  function addLog(msg) {
    const stream = document.getElementById('v20-log');
    if (!stream) return;
    const line = document.createElement('div');
    line.style = 'color:#0f0;font-size:9px;margin-bottom:2px;';
    line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    stream.prepend(line);
    while (stream.childNodes.length > 30) stream.removeChild(stream.lastChild);
  }

  function updateStatsUi() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('v20-preset-label', preset.label);
    set('v20-chance-val', `${preset.targetChance}%`);
    set('v20-refresh-val', String(preset.winsBeforeSeedRefresh));
    set('v20-seeds-val', String(seedCounter));
    set('v20-wins-val', String(totalWins));
    set('v20-losses-val', String(totalLosses));
    set('v20-streak-val', lossCount > 0 ? `-${lossCount}` : `+${winCount}`);
  }

  function updateBalanceUi() {
    const el = document.getElementById('v20-balance');
    if (el) el.textContent = `BAL: ${getBalance().toFixed(8)}`;
  }

  function setBotButtonState(running) {
    const btn = document.getElementById('v20-main-btn');
    if (!btn) return;
    btn.textContent = running ? 'STOP BOT' : 'START BOT';
    btn.style.borderColor = running ? '#f00' : '#0f0';
    btn.style.color = running ? '#f00' : '#0f0';
  }

  // ==================== SEED CHANGE ====================
  async function changeSeed() {
    addLog('INITIALIZING SEED REGENERATION...');
    try {
      const fairBtn =
        document.querySelector('div.dapps-top__buttons > div:nth-child(3) span') ||
        document.querySelector('.icon-fairness')?.parentElement;
      if (!fairBtn) { addLog('SEED PANEL BUTTON NOT FOUND'); return false; }

      fairBtn.click();
      await sleep(1500);

      const updateBtn =
        Array.from(document.querySelectorAll('button')).find((b) =>
          /update|confirm|change/i.test((b.textContent || '').trim())
        ) || document.querySelector('button.variant-primary');
      if (!updateBtn) { addLog('SEED UPDATE BUTTON NOT FOUND'); return false; }

      updateBtn.click();
      seedCounter += 1;
      localStorage.setItem(STORAGE.seedTotal, String(seedCounter));
      addLog('SEED CHANGED SUCCESSFULLY');

      await sleep(1000);
      const closeBtn = document.querySelector('.modal__close, .v-overlay__scrim');
      if (closeBtn) closeBtn.click();
      await sleep(500);
      return true;
    } catch {
      addLog('SEED CHANGE ERROR');
      return false;
    }
  }

  // ==================== DICE STRATEGY ====================
  function applyDiceStrategy() {
    const balance = getBalance();
    currentBet = getSafeBet(currentBet, balance);
    const amountInput = document.querySelector(SEL.amountInput);
    if (amountInput) setInputValue(amountInput, currentBet.toFixed(8));
    const sliderEl = document.querySelector('.noUi-target');
    if (sliderEl?.noUiSlider) {
      const val = currentDirection === 'under' ? preset.targetChance : 100 - preset.targetChance;
      sliderEl.noUiSlider.set(val);
    }
  }

  function toggleDirection() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btnUnder = buttons.find((b) => /roll\s*under|rouler.*inf/i.test(b.textContent || ''));
    const btnOver = buttons.find((b) => /roll\s*over|rouler.*sup/i.test(b.textContent || ''));
    if (!btnUnder || !btnOver) return;
    if (currentDirection === 'under') {
      btnOver.click();
      currentDirection = 'over';
    } else {
      btnUnder.click();
      currentDirection = 'under';
    }
    addLog(`DIRECTION SWAPPED: ${currentDirection.toUpperCase()}`);
  }

  function getRollButton() {
    const candidates = Array.from(document.querySelectorAll(SEL.rollButton));
    return (
      candidates.find((btn) => /roll|bet|start/i.test((btn.textContent || '').trim())) ||
      candidates[0] ||
      Array.from(document.querySelectorAll('button')).find((b) => /bet|roll/i.test(b.textContent || '')) ||
      null
    );
  }

  // ==================== BOT LOOP ====================
  function stopBot(reason) {
    isRunning = false;
    releaseRunLock();
    addLog(`BOT STOPPED: ${reason}`);
    setBotButtonState(false);
  }

  async function runBot() {
    if (!acquireRunLock()) {
      addLog('ANOTHER INSTANCE IS RUNNING — BLOCKED');
      return;
    }
    isRunning = true;
    winCount = 0;
    lossCount = 0;
    lastBalance = getBalance();
    currentBet = getStartingBet(lastBalance);
    if (currentBet <= 0) { stopBot('BALANCE TOO LOW'); return; }

    setBotButtonState(true);
    addLog(`BOT STARTED [${preset.label}]`);

    while (isRunning) {
      refreshRunLock();
      if (!document.hidden) applyDiceStrategy();

      const rollBtn = getRollButton();
      if (!rollBtn || rollBtn.disabled) {
        await sleep(500);
        continue;
      }

      rollBtn.click();
      addLog('PLACING BET...');
      await sleep(ROLL_SETTLE_MS);

      const newBal = getBalance();
      if (!Number.isFinite(newBal) || newBal <= 0) { stopBot('INVALID BALANCE'); return; }

      if (newBal > lastBalance) {
        winCount += 1;
        totalWins += 1;
        lossCount = 0;
        currentBet = getSafeBet(newBal * preset.betRatio, newBal);
        if (currentBet <= 0) { stopBot('BALANCE TOO LOW AFTER WIN'); return; }
        addLog(`WIN! [${winCount}/${preset.winsBeforeSeedRefresh}] total=${totalWins}`);
        updateStatsUi();

        if (winCount >= preset.winsBeforeSeedRefresh) {
          const rawCycles = parseInt(localStorage.getItem(STORAGE.autoReloadCycles), 10);
          const cycles = Number.isInteger(rawCycles) ? Math.max(0, Math.min(rawCycles, MAX_AUTO_RELOAD_CYCLES)) : 0;
          if (cycles >= MAX_AUTO_RELOAD_CYCLES) { stopBot('MAX RELOAD CYCLES REACHED'); return; }
          addLog(`${preset.winsBeforeSeedRefresh} WINS — REFRESHING SEED (cycle ${cycles + 1}/${MAX_AUTO_RELOAD_CYCLES})...`);
          const seedOk = await changeSeed();
          if (!seedOk) {
            addLog('SEED CHANGE FAILED — CONTINUING WITHOUT RELOAD');
            winCount = 0;
          } else {
            localStorage.setItem(STORAGE.autoRun, 'true');
            localStorage.setItem(STORAGE.autoReloadCycles, String(cycles + 1));
            releaseRunLock();
            setTimeout(() => location.reload(), RELOAD_DELAY_MS);
            return;
          }
        }
      } else if (newBal < lastBalance) {
        winCount = 0;
        lossCount += 1;
        totalLosses += 1;
        currentBet *= preset.lossIncrease;
        addLog(`LOSS streak=${lossCount}/${preset.maxLossStreak} total=${totalLosses}`);
        updateStatsUi();

        if (lossCount % preset.lossesBeforeDirectionSwitch === 0) toggleDirection();
        if (lossCount >= preset.maxLossStreak) { stopBot(`MAX LOSS STREAK ${preset.maxLossStreak}`); return; }
      } else {
        addLog('NO BALANCE CHANGE — RETRYING');
      }

      lastBalance = newBal;
      await sleep(ACTION_DELAY_MS);
    }
  }

  // ==================== HUD ====================
  function drawUI() {
    if (document.getElementById('v20-main-btn')) return;

    // Left: log console
    const leftPanel = document.createElement('div');
    leftPanel.style = 'position:fixed;top:100px;left:20px;z-index:2147483647;background:rgba(0,0,0,0.92);border:1px solid #0f0;padding:12px;width:280px;height:420px;font-family:monospace;box-shadow:0 0 18px rgba(0,255,0,0.25);overflow:hidden;';
    leftPanel.innerHTML = `
      <div style="color:#0f0;font-weight:bold;border-bottom:1px solid #0f0;padding-bottom:6px;margin-bottom:8px;font-size:12px;">&gt; URIEL CONSOLE V20.2</div>
      <div id="v20-log" style="height:340px;overflow:hidden;font-size:9px;color:#0f0;"></div>
    `;
    document.body.appendChild(leftPanel);

    // Right: control panel
    const rightPanel = document.createElement('div');
    rightPanel.style = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#0a0a0a;border:2px solid #f00;padding:14px;width:270px;font-family:monospace;box-shadow:0 0 18px rgba(255,0,0,0.3);';
    rightPanel.innerHTML = `
      <div id="v20-balance" style="color:#f00;font-size:14px;font-weight:bold;margin-bottom:6px;">BAL: 0.00000000</div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:8px;">
        <button data-v20preset="safe"       style="padding:5px 2px;background:#002200;border:1px solid #0a0;color:#0f0;cursor:pointer;font-size:10px;font-family:monospace;">SAFE</button>
        <button data-v20preset="balanced"   style="padding:5px 2px;background:#003300;border:1px solid #0c0;color:#0f0;cursor:pointer;font-size:10px;font-family:monospace;">BALANCED</button>
        <button data-v20preset="aggressive" style="padding:5px 2px;background:#330000;border:1px solid #900;color:#f00;cursor:pointer;font-size:10px;font-family:monospace;">AGGRO</button>
      </div>

      <div style="margin-bottom:8px;">
        <label style="color:#aaa;font-size:9px;display:block;margin-bottom:3px;">START BET (leave blank = auto)</label>
        <input id="v20-start-bet" type="text" inputmode="decimal" placeholder="e.g. 0.00000010"
          style="width:100%;box-sizing:border-box;background:#111;border:1px solid #0f0;color:#0f0;font-family:monospace;font-size:11px;padding:5px 6px;outline:none;" />
      </div>

      <div style="font-size:10px;color:#666;margin-bottom:8px;line-height:1.6;">
        PRESET: <span id="v20-preset-label" style="color:#9cf;">BALANCED</span><br>
        CHANCE: <span id="v20-chance-val" style="color:#9cf;">32.67%</span> &nbsp;|&nbsp;
        REFRESH: <span id="v20-refresh-val" style="color:#9cf;">2</span> wins<br>
        STREAK: <span id="v20-streak-val" style="color:#ff0;">0</span> &nbsp;|&nbsp;
        W: <span id="v20-wins-val" style="color:#0f0;">0</span> &nbsp;L: <span id="v20-losses-val" style="color:#f00;">0</span><br>
        SEEDS CHANGED: <span id="v20-seeds-val" style="color:#0f0;">0</span>
      </div>

      <button id="v20-main-btn" style="width:100%;padding:11px;background:transparent;border:1px solid #0f0;color:#0f0;cursor:pointer;font-weight:bold;font-family:monospace;font-size:12px;text-transform:uppercase;">START BOT</button>
    `;
    document.body.appendChild(rightPanel);

    // Preset buttons
    rightPanel.querySelectorAll('[data-v20preset]').forEach((btn) => {
      btn.onclick = () => {
        if (isRunning) { addLog('STOP BOT BEFORE CHANGING PRESET'); return; }
        applyPreset(btn.dataset.v20preset, { persist: true, log: true });
      };
    });

    document.getElementById('v20-main-btn').onclick = () => {
      if (isRunning) {
        stopBot('MANUAL STOP');
      } else {
        localStorage.setItem(STORAGE.autoReloadCycles, '0');
        runBot();
      }
    };

    updateStatsUi();

    // Restore persisted starting bet value
    const startBetInput = document.getElementById('v20-start-bet');
    if (startBetInput) {
      const stored = localStorage.getItem(STORAGE.startBet);
      if (stored) startBetInput.value = stored;
      startBetInput.addEventListener('input', () => {
        const val = startBetInput.value.trim();
        try { localStorage.setItem(STORAGE.startBet, val || ''); } catch (e) {}
        addLog(val ? `START BET SET: ${val}` : 'START BET CLEARED (auto mode)');
      });
    }

    setInterval(updateBalanceUi, 1000);
    setInterval(updateStatsUi, 2000);
  }

  // ==================== INIT (V20.2: multi-attempt auto-restart) ====================

  // Read auto-run flag immediately, before the SPA can wipe DOM state.
  // Do NOT clear it yet — forceRestartIfNeeded clears it only on successful trigger.
  const pendingAutoRun = localStorage.getItem(STORAGE.autoRun) === 'true';

  applyPreset(activePresetName, { persist: false, log: false });

  // Attempt to auto-start the bot after a reload triggered by seed refresh.
  // Returns true if an auto-start was scheduled; false if conditions not met.
  let autoStartScheduled = false;
  function forceRestartIfNeeded() {
    if (!pendingAutoRun || isRunning || autoStartScheduled) return false;

    // Check that the UI is available before committing
    if (!document.getElementById('v20-main-btn')) return false;

    autoStartScheduled = true;
    try { localStorage.setItem(STORAGE.autoRun, 'false'); } catch (e) {}
    addLog('🔄 AUTO-RESTART TRIGGERED (post-seed-reload)');

    setTimeout(() => {
      if (!isRunning && document.getElementById('v20-main-btn')) {
        runBot();
      }
    }, AUTO_RUN_DELAY_MS);
    return true;
  }

  function tryInit() {
    drawUI();

    // Try multiple times to handle slow SPA/TheFreshMaker startup
    if (pendingAutoRun && !autoStartScheduled) {
      setTimeout(forceRestartIfNeeded, 1800);
      setTimeout(forceRestartIfNeeded, 4200);
      setTimeout(forceRestartIfNeeded, 7500);
    }
  }

  // Initial inject — wait for SPA to mount
  setTimeout(tryInit, 2800);

  // Persistent guard: re-inject HUD if SPA wipes it, and retry auto-restart if still pending
  setInterval(() => {
    if (!document.getElementById('v20-main-btn')) {
      tryInit();
    } else if (pendingAutoRun && !autoStartScheduled && !isRunning) {
      forceRestartIfNeeded();
    }
  }, 3000);

  // Release lock on unload so fresh page can acquire it
  window.addEventListener('beforeunload', releaseRunLock);
})();
