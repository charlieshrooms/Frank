// ==UserScript==
// @name         BetFury Dice Bot - Uriel Mode V21 Martingale Shield
// @version      21.0
// @description  Uriel V21: low-start martingale with loss-streak recovery shield
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

  const STORAGE = {
    autoRun: 'bot_auto_run_v21',
    autoReloadCycles: 'bot_auto_reload_cycles_v21',
    runLock: 'bot_run_lock_v21',
    seedTotal: 'bot_seed_total_v21',
  };

  const STRATEGY = {
    label: 'MARTINGALE SHIELD',
    baseBetRatio: 0.00004,
    baseChance: 30.0,
    baseLossIncrease: 1.4,
    lossesBeforeDirectionSwitch: 4,
    winsBeforeSeedRefresh: 3,
    maxLossStreak: 14,
    maxBetPercentOfBalance: 0.02,
    recovery: {
      triggerLosses: 4,
      chance: 68.0,
      lossIncrease: 1.18,
      winsToExit: 2,
    },
  };

  const MIN_BET_FALLBACK = 0.00000001;
  const ACTION_DELAY_MS = 700;
  const ROLL_SETTLE_MS = 2600;
  const AUTO_RUN_DELAY_MS = 5000;
  const MAX_AUTO_RELOAD_CYCLES = 200;
  const RUN_LOCK_TIMEOUT_MS = 15000;

  const SEL = {
    balance: [
      'span.currency span span',
      '.balance__value',
      '.wallet-balance',
      '[data-testid="wallet-balance"]',
      '.header-wallet__value',
      '[class*="balance"]',
    ],
    amountInput:
      '.amount__center input, input[data-test*="bet"], input[data-test*="amount"], input[type="text"], input[type="number"]',
    rollButton:
      'button[type="submit"], button[data-test*="bet"], .dice__roll button, .bet-button button',
  };

  let isRunning = false;
  let winCount = 0;
  let lossCount = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let currentBet = 0;
  let lastBalance = 0;
  let currentDirection = 'under';
  let recoveryWins = 0;
  let recoveryMode = false;

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
      const rawCounter = parseInt(localStorage.getItem('bot_instance_counter_v21'), 10);
      counter = (Number.isInteger(rawCounter) ? rawCounter : 0) + 1;
      localStorage.setItem('bot_instance_counter_v21', String(counter));
    } catch {}
    return `${Date.now().toString(36)}-${Math.floor(perfNow * 1000).toString(36)}-${counter.toString(36)}`;
  }

  const INSTANCE_ID = createInstanceId();

  const storedSeedTotal = localStorage.getItem(STORAGE.seedTotal);
  let seedCounter = parseInt(storedSeedTotal, 10);
  if (!Number.isInteger(seedCounter) || seedCounter < 0) seedCounter = 0;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function getCurrentInputMin() {
    const input = document.querySelector(SEL.amountInput);
    if (!input) return MIN_BET_FALLBACK;

    const minAttr = parseFloat((input.getAttribute('min') || '').replace(/,/g, ''));
    if (Number.isFinite(minAttr) && minAttr > 0) return minAttr;

    const stepAttr = parseFloat((input.getAttribute('step') || '').replace(/,/g, ''));
    if (Number.isFinite(stepAttr) && stepAttr > 0) return stepAttr;

    return MIN_BET_FALLBACK;
  }

  function getSafeBet(proposed, balance) {
    const minBet = getCurrentInputMin();
    const maxBetCap = balance * STRATEGY.maxBetPercentOfBalance;
    if (maxBetCap < minBet) return 0;
    return Math.min(Math.max(proposed, minBet), maxBetCap);
  }

  function getBaseBet(balance) {
    return getSafeBet(balance * STRATEGY.baseBetRatio, balance);
  }

  function getActiveChance() {
    return recoveryMode ? STRATEGY.recovery.chance : STRATEGY.baseChance;
  }

  function getActiveLossIncrease() {
    return recoveryMode ? STRATEGY.recovery.lossIncrease : STRATEGY.baseLossIncrease;
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

  function acquireRunLock() {
    try {
      const raw = localStorage.getItem(STORAGE.runLock);
      if (!raw) {
        localStorage.setItem(STORAGE.runLock, JSON.stringify({ id: INSTANCE_ID, ts: Date.now() }));
        return true;
      }
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts || 0);
      const id = String(parsed?.id || '');
      if (id && Date.now() - ts < RUN_LOCK_TIMEOUT_MS && id !== INSTANCE_ID) return false;
      localStorage.setItem(STORAGE.runLock, JSON.stringify({ id: INSTANCE_ID, ts: Date.now() }));
      return true;
    } catch {
      return true;
    }
  }

  function refreshRunLock() {
    try {
      localStorage.setItem(STORAGE.runLock, JSON.stringify({ id: INSTANCE_ID, ts: Date.now() }));
    } catch {}
  }

  function releaseRunLock() {
    try {
      const raw = localStorage.getItem(STORAGE.runLock);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.id === INSTANCE_ID) localStorage.removeItem(STORAGE.runLock);
    } catch {}
  }

  function addLog(msg) {
    const stream = document.getElementById('v21-log');
    if (!stream) return;
    const line = document.createElement('div');
    line.style = 'color:#0f0;font-size:9px;margin-bottom:2px;';
    line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    stream.prepend(line);
    while (stream.childNodes.length > 30) stream.removeChild(stream.lastChild);
  }

  function updateStatsUi() {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('v21-mode-val', recoveryMode ? 'RECOVERY' : 'BASE');
    set('v21-chance-val', `${getActiveChance()}%`);
    set('v21-step-val', `${((getActiveLossIncrease() - 1) * 100).toFixed(0)}%`);
    set('v21-refresh-val', String(STRATEGY.winsBeforeSeedRefresh));
    set('v21-loss-cap-val', String(STRATEGY.maxLossStreak));
    set('v21-recovery-val', `${STRATEGY.recovery.triggerLosses}/${STRATEGY.recovery.winsToExit}`);
    set('v21-seeds-val', String(seedCounter));
    set('v21-wins-val', String(totalWins));
    set('v21-losses-val', String(totalLosses));
    set('v21-streak-val', lossCount > 0 ? `-${lossCount}` : `+${winCount}`);
  }

  function updateBalanceUi() {
    const el = document.getElementById('v21-balance');
    if (el) el.textContent = `BAL: ${getBalance().toFixed(8)}`;
  }

  function setBotButtonState(running) {
    const btn = document.getElementById('v21-main-btn');
    if (!btn) return;
    btn.textContent = running ? 'STOP BOT' : 'START BOT';
    btn.style.borderColor = running ? '#f00' : '#0f0';
    btn.style.color = running ? '#f00' : '#0f0';
  }

  async function changeSeed() {
    addLog('INITIALIZING SEED REGENERATION...');
    try {
      const fairBtn =
        document.querySelector('div.dapps-top__buttons > div:nth-child(3) span') ||
        document.querySelector('.icon-fairness')?.parentElement;
      if (!fairBtn) {
        addLog('SEED PANEL BUTTON NOT FOUND');
        return false;
      }

      fairBtn.click();
      await sleep(1500);

      const updateBtn =
        Array.from(document.querySelectorAll('button')).find((b) =>
          /update|confirm|change/i.test((b.textContent || '').trim())
        ) || document.querySelector('button.variant-primary');
      if (!updateBtn) {
        addLog('SEED UPDATE BUTTON NOT FOUND');
        return false;
      }

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

  function applyDiceStrategy() {
    const balance = getBalance();
    currentBet = getSafeBet(currentBet, balance);
    const amountInput = document.querySelector(SEL.amountInput);
    if (amountInput) setInputValue(amountInput, currentBet.toFixed(8));
    const sliderEl = document.querySelector('.noUi-target');
    if (sliderEl?.noUiSlider) {
      const activeChance = getActiveChance();
      const val = currentDirection === 'under' ? activeChance : 100 - activeChance;
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

  function enterRecoveryMode() {
    if (recoveryMode) return;
    recoveryMode = true;
    recoveryWins = 0;
    addLog(
      `RECOVERY MODE ON: ${STRATEGY.recovery.chance}% chance, ${((STRATEGY.recovery.lossIncrease - 1) * 100).toFixed(0)}% loss step`
    );
    updateStatsUi();
  }

  function exitRecoveryMode() {
    if (!recoveryMode) return;
    recoveryMode = false;
    recoveryWins = 0;
    addLog(`RECOVERY MODE OFF: back to ${STRATEGY.baseChance}% martingale`);
    updateStatsUi();
  }

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
    recoveryWins = 0;
    recoveryMode = false;
    lastBalance = getBalance();
    currentBet = getBaseBet(lastBalance);
    if (currentBet <= 0) {
      stopBot('BALANCE TOO LOW');
      return;
    }

    setBotButtonState(true);
    updateStatsUi();
    addLog(`BOT STARTED [${STRATEGY.label}]`);

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
      if (!Number.isFinite(newBal) || newBal <= 0) {
        stopBot('INVALID BALANCE');
        return;
      }

      if (newBal > lastBalance) {
        winCount += 1;
        totalWins += 1;
        lossCount = 0;
        currentBet = getBaseBet(newBal);
        if (currentBet <= 0) {
          stopBot('BALANCE TOO LOW AFTER WIN');
          return;
        }

        if (recoveryMode) {
          recoveryWins += 1;
          addLog(`RECOVERY WIN ${recoveryWins}/${STRATEGY.recovery.winsToExit}`);
          if (recoveryWins >= STRATEGY.recovery.winsToExit) exitRecoveryMode();
        } else {
          recoveryWins = 0;
        }

        addLog(`WIN! [${winCount}/${STRATEGY.winsBeforeSeedRefresh}] total=${totalWins}`);
        updateStatsUi();

        if (winCount >= STRATEGY.winsBeforeSeedRefresh) {
          const rawCycles = parseInt(localStorage.getItem(STORAGE.autoReloadCycles), 10);
          const cycles = Number.isInteger(rawCycles)
            ? Math.max(0, Math.min(rawCycles, MAX_AUTO_RELOAD_CYCLES))
            : 0;
          if (cycles >= MAX_AUTO_RELOAD_CYCLES) {
            stopBot('MAX RELOAD CYCLES REACHED');
            return;
          }
          localStorage.setItem(STORAGE.autoReloadCycles, String(cycles + 1));
          localStorage.setItem(STORAGE.autoRun, 'true');
          addLog(`${STRATEGY.winsBeforeSeedRefresh} WINS — REFRESHING SEED...`);
          await changeSeed();
          releaseRunLock();
          location.reload();
          return;
        }
      } else if (newBal < lastBalance) {
        winCount = 0;
        lossCount += 1;
        totalLosses += 1;
        recoveryWins = 0;

        if (lossCount >= STRATEGY.recovery.triggerLosses) enterRecoveryMode();
        currentBet *= getActiveLossIncrease();
        addLog(`LOSS streak=${lossCount}/${STRATEGY.maxLossStreak} total=${totalLosses}`);
        updateStatsUi();

        if (lossCount % STRATEGY.lossesBeforeDirectionSwitch === 0) toggleDirection();
        if (lossCount >= STRATEGY.maxLossStreak) {
          stopBot(`MAX LOSS STREAK ${STRATEGY.maxLossStreak}`);
          return;
        }
      } else {
        addLog('NO BALANCE CHANGE — RETRYING');
      }

      lastBalance = newBal;
      await sleep(ACTION_DELAY_MS);
    }
  }

  function drawUI() {
    if (document.getElementById('v21-main-btn')) return;

    const leftPanel = document.createElement('div');
    leftPanel.style =
      'position:fixed;top:100px;left:20px;z-index:2147483647;background:rgba(0,0,0,0.92);border:1px solid #0f0;padding:12px;width:290px;height:430px;font-family:monospace;box-shadow:0 0 18px rgba(0,255,0,0.25);overflow:hidden;';
    leftPanel.innerHTML = `
      <div style="color:#0f0;font-weight:bold;border-bottom:1px solid #0f0;padding-bottom:6px;margin-bottom:8px;font-size:12px;">&gt; URIEL CONSOLE V21</div>
      <div id="v21-log" style="height:350px;overflow:hidden;font-size:9px;color:#0f0;"></div>
    `;
    document.body.appendChild(leftPanel);

    const rightPanel = document.createElement('div');
    rightPanel.style =
      'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#0a0a0a;border:2px solid #f00;padding:14px;width:290px;font-family:monospace;box-shadow:0 0 18px rgba(255,0,0,0.3);';
    rightPanel.innerHTML = `
      <div id="v21-balance" style="color:#f00;font-size:14px;font-weight:bold;margin-bottom:6px;">BAL: 0.00000000</div>
      <div style="font-size:10px;color:#666;margin-bottom:8px;line-height:1.6;">
        STRAT: <span style="color:#9cf;">${STRATEGY.label}</span><br>
        MODE: <span id="v21-mode-val" style="color:#ff0;">BASE</span> &nbsp;|&nbsp;
        CHANCE: <span id="v21-chance-val" style="color:#9cf;">30%</span><br>
        LOSS STEP: <span id="v21-step-val" style="color:#9cf;">40%</span> &nbsp;|&nbsp;
        REFRESH: <span id="v21-refresh-val" style="color:#9cf;">3</span> wins<br>
        RECOVERY: <span id="v21-recovery-val" style="color:#9cf;">4/2</span> &nbsp;|&nbsp;
        CAP: <span id="v21-loss-cap-val" style="color:#9cf;">14</span> losses<br>
        STREAK: <span id="v21-streak-val" style="color:#ff0;">0</span> &nbsp;|&nbsp;
        W: <span id="v21-wins-val" style="color:#0f0;">0</span> &nbsp;L: <span id="v21-losses-val" style="color:#f00;">0</span><br>
        SEEDS CHANGED: <span id="v21-seeds-val" style="color:#0f0;">0</span>
      </div>
      <button id="v21-main-btn" style="width:100%;padding:11px;background:transparent;border:1px solid #0f0;color:#0f0;cursor:pointer;font-weight:bold;font-family:monospace;font-size:12px;text-transform:uppercase;">START BOT</button>
    `;
    document.body.appendChild(rightPanel);

    document.getElementById('v21-main-btn').onclick = () => {
      if (isRunning) {
        stopBot('MANUAL STOP');
      } else {
        localStorage.setItem(STORAGE.autoReloadCycles, '0');
        runBot();
      }
    };

    updateStatsUi();
    setInterval(updateBalanceUi, 1000);
    setInterval(updateStatsUi, 2000);
  }

  let pendingAutoRun = localStorage.getItem(STORAGE.autoRun) === 'true';
  if (pendingAutoRun) localStorage.setItem(STORAGE.autoRun, 'false');

  function tryInit() {
    drawUI();
    if (pendingAutoRun && !isRunning) {
      pendingAutoRun = false;
      setTimeout(runBot, AUTO_RUN_DELAY_MS);
    }
  }

  setTimeout(tryInit, 3000);

  setInterval(() => {
    if (!document.getElementById('v21-main-btn')) tryInit();
  }, 2000);

  window.addEventListener('beforeunload', releaseRunLock);
})();
