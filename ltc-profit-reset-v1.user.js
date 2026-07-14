// ==UserScript==
// @name         BetFury Dice Bot - LTC Profit Reset V1
// @version      1.0
// @description  LTC only: 90% win chance, ×4 on win, ×6 on loss, reset at 0.0001 profit, refresh after 5 resets
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
    autoRun: 'bot_ltc_auto_run_v1',
    resetCount: 'bot_ltc_reset_count_v1',
    runLock: 'bot_ltc_run_lock_v1',
  };

  const STRATEGY = {
    label: 'LTC PROFIT RESET',
    baseBet: 0.00000002,
    winChance: 90.0,
    winMultiplier: 4.0,   // bet × 4 on win (increase by 300%)
    lossMultiplier: 6.0,  // bet × 6 on loss (increase by 500%)
    profitTarget: 0.0001, // LTC profit per cycle before reset
    resetsBeforeRefresh: 5,
  };

  const ACTION_DELAY_MS = 700;
  const ROLL_SETTLE_MS = 2600;
  const AUTO_RUN_DELAY_MS = 5000;
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
  let currentBet = STRATEGY.baseBet;
  let cycleStartBalance = 0;
  let lastBalance = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let resetCount = 0;

  function createInstanceId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint32Array(4);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (v) => v.toString(16).padStart(8, '0')).join('-');
    }
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
  }

  const INSTANCE_ID = createInstanceId();

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
    const stream = document.getElementById('ltc1-log');
    if (!stream) return;
    const line = document.createElement('div');
    line.style = 'color:#0cf;font-size:9px;margin-bottom:2px;';
    line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    stream.prepend(line);
    while (stream.childNodes.length > 30) stream.removeChild(stream.lastChild);
  }

  function updateStatsUi() {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('ltc1-wins-val', String(totalWins));
    set('ltc1-losses-val', String(totalLosses));
    set('ltc1-resets-val', `${resetCount}/${STRATEGY.resetsBeforeRefresh}`);
    set('ltc1-bet-val', currentBet.toFixed(8));
    const profit = lastBalance > 0 ? (lastBalance - cycleStartBalance).toFixed(8) : '0.00000000';
    set('ltc1-profit-val', profit);
  }

  function updateBalanceUi() {
    const el = document.getElementById('ltc1-balance');
    if (el) el.textContent = `BAL: ${getBalance().toFixed(8)}`;
  }

  function setBotButtonState(running) {
    const btn = document.getElementById('ltc1-main-btn');
    if (!btn) return;
    btn.textContent = running ? 'STOP BOT' : 'START BOT';
    btn.style.borderColor = running ? '#f00' : '#0cf';
    btn.style.color = running ? '#f00' : '#0cf';
  }

  function applyDiceSettings() {
    const amountInput = document.querySelector(SEL.amountInput);
    if (amountInput) setInputValue(amountInput, currentBet.toFixed(8));

    const sliderEl = document.querySelector('.noUi-target');
    if (sliderEl?.noUiSlider) {
      sliderEl.noUiSlider.set(STRATEGY.winChance);
    }
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
    currentBet = STRATEGY.baseBet;
    lastBalance = getBalance();
    cycleStartBalance = lastBalance;

    if (lastBalance <= 0) {
      stopBot('BALANCE TOO LOW');
      return;
    }

    const rawResets = parseInt(localStorage.getItem(STORAGE.resetCount), 10);
    resetCount = Number.isInteger(rawResets) && rawResets >= 0 ? rawResets : 0;

    setBotButtonState(true);
    updateStatsUi();
    addLog(`BOT STARTED [${STRATEGY.label}] resets=${resetCount}/${STRATEGY.resetsBeforeRefresh}`);

    while (isRunning) {
      refreshRunLock();
      applyDiceSettings();

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

      const cycleProfit = newBal - cycleStartBalance;

      if (newBal > lastBalance) {
        totalWins += 1;
        addLog(`WIN! bet=${currentBet.toFixed(8)} profit=${cycleProfit.toFixed(8)}`);
        currentBet = currentBet * STRATEGY.winMultiplier;
      } else if (newBal < lastBalance) {
        totalLosses += 1;
        addLog(`LOSS streak profit=${cycleProfit.toFixed(8)}`);
        currentBet = currentBet * STRATEGY.lossMultiplier;
      } else {
        addLog('NO BALANCE CHANGE — RETRYING');
        await sleep(ACTION_DELAY_MS);
        continue;
      }

      lastBalance = newBal;
      updateStatsUi();

      if (cycleProfit >= STRATEGY.profitTarget) {
        resetCount += 1;
        localStorage.setItem(STORAGE.resetCount, String(resetCount));
        addLog(`PROFIT TARGET HIT (+${cycleProfit.toFixed(8)}) — RESET #${resetCount}`);

        if (resetCount >= STRATEGY.resetsBeforeRefresh) {
          addLog(`${STRATEGY.resetsBeforeRefresh} RESETS DONE — REFRESHING PAGE`);
          localStorage.setItem(STORAGE.autoRun, 'true');
          localStorage.setItem(STORAGE.resetCount, '0');
          releaseRunLock();
          await sleep(1000);
          location.reload();
          return;
        }

        currentBet = STRATEGY.baseBet;
        cycleStartBalance = newBal;
        lastBalance = newBal;
        addLog(`CYCLE RESET — new base bal=${cycleStartBalance.toFixed(8)}`);
        updateStatsUi();
      }

      await sleep(ACTION_DELAY_MS);
    }
  }

  function drawUI() {
    if (document.getElementById('ltc1-main-btn')) return;

    const leftPanel = document.createElement('div');
    leftPanel.style =
      'position:fixed;top:100px;left:20px;z-index:2147483647;background:rgba(0,0,0,0.92);border:1px solid #0cf;padding:12px;width:290px;height:430px;font-family:monospace;box-shadow:0 0 18px rgba(0,200,255,0.25);overflow:hidden;';
    leftPanel.innerHTML = `
      <div style="color:#0cf;font-weight:bold;border-bottom:1px solid #0cf;padding-bottom:6px;margin-bottom:8px;font-size:12px;">&gt; LTC PROFIT RESET V1</div>
      <div id="ltc1-log" style="height:350px;overflow:hidden;font-size:9px;color:#0cf;"></div>
    `;
    document.body.appendChild(leftPanel);

    const rightPanel = document.createElement('div');
    rightPanel.style =
      'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#0a0a0a;border:2px solid #0cf;padding:14px;width:290px;font-family:monospace;box-shadow:0 0 18px rgba(0,200,255,0.3);';
    rightPanel.innerHTML = `
      <div id="ltc1-balance" style="color:#0cf;font-size:14px;font-weight:bold;margin-bottom:6px;">BAL: 0.00000000</div>
      <div style="font-size:10px;color:#666;margin-bottom:8px;line-height:1.6;">
        STRAT: <span style="color:#9cf;">${STRATEGY.label}</span><br>
        CHANCE: <span style="color:#9cf;">${STRATEGY.winChance}%</span> &nbsp;|&nbsp;
        WIN ×<span style="color:#0f0;">${STRATEGY.winMultiplier}</span> &nbsp;LOSS ×<span style="color:#f00;">${STRATEGY.lossMultiplier}</span><br>
        TARGET: <span style="color:#9cf;">+${STRATEGY.profitTarget} LTC / cycle</span><br>
        RESETS: <span id="ltc1-resets-val" style="color:#ff0;">0/${STRATEGY.resetsBeforeRefresh}</span><br>
        BET: <span id="ltc1-bet-val" style="color:#9cf;">${STRATEGY.baseBet.toFixed(8)}</span><br>
        PROFIT: <span id="ltc1-profit-val" style="color:#0f0;">0.00000000</span><br>
        W: <span id="ltc1-wins-val" style="color:#0f0;">0</span> &nbsp;L: <span id="ltc1-losses-val" style="color:#f00;">0</span>
      </div>
      <button id="ltc1-main-btn" style="width:100%;padding:11px;background:transparent;border:1px solid #0cf;color:#0cf;cursor:pointer;font-weight:bold;font-family:monospace;font-size:12px;text-transform:uppercase;">START BOT</button>
    `;
    document.body.appendChild(rightPanel);

    document.getElementById('ltc1-main-btn').onclick = () => {
      if (isRunning) {
        stopBot('MANUAL STOP');
      } else {
        localStorage.setItem(STORAGE.resetCount, '0');
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
    if (!document.getElementById('ltc1-main-btn')) tryInit();
  }, 2000);

  window.addEventListener('beforeunload', releaseRunLock);
})();
