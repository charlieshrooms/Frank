// ==UserScript==
// @name         BetFury Dice Bot - Uriel Mode V19 (ULTRA REFRESH, Hardened)
// @version      19.1
// @description  Ratio 0.01/80 | Seed Auto-Refresh after 2 Wins | Hacker UI | 32.67%
// @match        https://betfury.io/casino/games/dice
// @match        https://betfury.io/*/casino/games/dice*
// @grant        none
// @namespace    https://greasyfork.org/users/1550232
// ==/UserScript==

(function () {
  'use strict';

  // ==================== CONFIGURATION ====================
  const BET_RATIO = 0.000125; // Base bet = 0.01 on 80 balance
  const TARGET_CHANCE = 32.67; // Fixed win chance
  const LOSS_INCREASE = 1.5; // Multiply bet by 1.5 after loss
  const LOSSES_BEFORE_DIRECTION_SWITCH = 3; // Switch Over/Under after 3 losses
  const WINS_BEFORE_SEED_REFRESH = 2; // Refresh + new seed after 2 wins

  // Hardening guards
  const MAX_BET_PERCENT_OF_BALANCE = 0.03; // never bet above 3% of current balance
  const MAX_CONSECUTIVE_LOSSES_STOP = 18; // hard kill switch
  const MIN_BET_FALLBACK = 0.00000001;
  const ACTION_DELAY_MS = 700;
  const ROLL_SETTLE_MS = 2600;
  const AUTO_RUN_DELAY_MS = 5000;
  const MAX_AUTO_RELOAD_CYCLES = 200;
  const AMOUNT_INPUT_SELECTOR = '.amount__center input, input[type="text"], input[type="number"]';
  const INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const RUN_LOCK_KEY = 'bot_run_lock_v19';
  const RUN_LOCK_TIMEOUT_MS = 15000;

  let isRunning = false;
  let winCount = 0;
  let lossCount = 0;
  let currentBet = 0;
  let lastBalance = 0;
  let currentDirection = 'under';
  let seedCounter = parseInt(localStorage.getItem('bot_seed_total'), 10);
  if (!Number.isInteger(seedCounter) || seedCounter < 0) seedCounter = 0;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getBalance() {
    const selectors = [
      'span.currency span span',
      '.wallet-balance',
      '[data-testid="wallet-balance"]',
      '.header-wallet__value',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = (el.textContent || '').replace(/,/g, '');
      const match = raw.match(/(\d+(?:\.\d+)?)/);
      const parsed = match ? parseFloat(match[1]) : NaN;
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  }

  function getCurrentInputBet() {
    const amountInput = document.querySelector(AMOUNT_INPUT_SELECTOR);
    if (!amountInput) return MIN_BET_FALLBACK;
    const parsed = parseFloat((amountInput.value || '').replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : MIN_BET_FALLBACK;
  }

  function getSafeBet(proposedBet, balance) {
    const minBet = getCurrentInputBet();
    const maxBetCap = balance * MAX_BET_PERCENT_OF_BALANCE;
    if (maxBetCap < minBet) return 0;
    return Math.min(Math.max(proposedBet, minBet), maxBetCap);
  }

  function acquireRunLock() {
    try {
      const raw = localStorage.getItem(RUN_LOCK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        const id = String(parsed?.id || '');
        if (id && Date.now() - ts < RUN_LOCK_TIMEOUT_MS && id !== INSTANCE_ID) return false;
      }
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

  function addHackerLog(msg) {
    const stream = document.getElementById('hacker-stream');
    if (!stream) return;
    const line = document.createElement('div');
    line.style =
      'color:#0f0;font-size:9px;text-shadow:0 0 5px #0f0;margin-bottom:2px;font-family:monospace;';
    line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    stream.prepend(line);
    while (stream.childNodes.length > 25) stream.removeChild(stream.lastChild);
  }

  function updateSeedUi() {
    const counterEl = document.getElementById('seed-count-val');
    if (counterEl) counterEl.textContent = String(seedCounter);
  }

  function stopBot(reason) {
    isRunning = false;
    releaseRunLock();
    addHackerLog(`BOT STOPPED: ${reason}`);
    const mainBtn = document.getElementById('main-btn');
    if (mainBtn) {
      mainBtn.innerText = 'START BOT';
      mainBtn.style.border = '1px solid #0f0';
      mainBtn.style.color = '#0f0';
    }
  }

  async function changeSeed() {
    addHackerLog('INITIALIZING SEED REGENERATION...');
    try {
      const fairBtn =
        document.querySelector('div.dapps-top__buttons > div:nth-child(3) span') ||
        document.querySelector('.icon-fairness')?.parentElement;

      if (!fairBtn) {
        addHackerLog('SEED PANEL BUTTON NOT FOUND');
        return false;
      }

      fairBtn.click();
      await sleep(1500);

      const updateBtn =
        Array.from(document.querySelectorAll('button')).find((b) =>
          /update|confirm|change/i.test((b.textContent || '').trim())
        ) ||
        document.querySelector('button.variant-primary');

      if (!updateBtn) {
        addHackerLog('SEED UPDATE BUTTON NOT FOUND');
        return false;
      }

      updateBtn.click();
      seedCounter += 1;
      localStorage.setItem('bot_seed_total', String(seedCounter));
      updateSeedUi();
      addHackerLog('SEED CHANGED SUCCESSFULLY');

      await sleep(1000);
      const closeBtn = document.querySelector('.modal__close, .v-overlay__scrim');
      if (closeBtn) closeBtn.click();
      await sleep(500);
      return true;
    } catch (e) {
      addHackerLog('SEED CHANGE ERROR');
      return false;
    }
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

  function applyDiceStrategy() {
    const balance = getBalance();
    currentBet = getSafeBet(currentBet, balance);

    const amountInput = document.querySelector(AMOUNT_INPUT_SELECTOR);
    if (amountInput) setInputValue(amountInput, currentBet.toFixed(8));

    const sliderEl = document.querySelector('.noUi-target');
    if (sliderEl?.noUiSlider) {
      const val = currentDirection === 'under' ? TARGET_CHANCE : 100 - TARGET_CHANCE;
      sliderEl.noUiSlider.set(val);
    }
  }

  function toggleDirection() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const underBtn = buttons.find((b) => /roll\s*under/i.test(b.textContent || ''));
    const overBtn = buttons.find((b) => /roll\s*over/i.test(b.textContent || ''));
    const frUnderBtn = buttons.find((b) => /rouler.*inf/i.test(b.textContent || ''));
    const frOverBtn = buttons.find((b) => /rouler.*sup/i.test(b.textContent || ''));

    const btnUnder = underBtn || frUnderBtn;
    const btnOver = overBtn || frOverBtn;
    if (!btnUnder || !btnOver) return;

    if (currentDirection === 'under') {
      btnOver.click();
      currentDirection = 'over';
    } else {
      btnUnder.click();
      currentDirection = 'under';
    }
    addHackerLog(`DIRECTION SWAPPED TO: ${currentDirection.toUpperCase()}`);
  }

  function getRollButton() {
    const candidates = Array.from(
      document.querySelectorAll('button[type="submit"], .dice__roll button, .bet-button button')
    );
    return (
      candidates.find((btn) => /roll|bet|start/i.test((btn.textContent || '').trim())) ||
      candidates[0] ||
      null
    );
  }

  async function runBot() {
    if (!acquireRunLock()) {
      addHackerLog('ANOTHER BOT INSTANCE IS RUNNING');
      return;
    }
    isRunning = true;
    winCount = 0;
    lossCount = 0;
    lastBalance = getBalance();
    currentBet = getSafeBet(lastBalance * BET_RATIO, lastBalance);
    if (currentBet <= 0) {
      stopBot('BALANCE TOO LOW FOR MIN BET + CAP');
      return;
    }

    const mainBtn = document.getElementById('main-btn');
    if (mainBtn) {
      mainBtn.innerText = 'STOP BOT';
      mainBtn.style.border = '1px solid #f00';
      mainBtn.style.color = '#f00';
    }

    while (isRunning) {
      refreshRunLock();
      if (!document.hidden) applyDiceStrategy();
      const rollBtn = getRollButton();
      if (!rollBtn || rollBtn.disabled) {
        await sleep(500);
        continue;
      }

      rollBtn.click();
      addHackerLog('PLACING BET...');
      await sleep(ROLL_SETTLE_MS);

      const newBal = getBalance();
      if (!Number.isFinite(newBal) || newBal <= 0) {
        stopBot('INVALID BALANCE');
        return;
      }

      if (newBal > lastBalance) {
        winCount += 1;
        lossCount = 0;
        currentBet = getSafeBet(newBal * BET_RATIO, newBal);
        if (currentBet <= 0) {
          stopBot('BALANCE TOO LOW FOR MIN BET + CAP');
          return;
        }
        addHackerLog(`WIN! [${winCount}/${WINS_BEFORE_SEED_REFRESH}]`);

        if (winCount >= WINS_BEFORE_SEED_REFRESH) {
          addHackerLog(`${WINS_BEFORE_SEED_REFRESH} WINS REACHED - CHANGING SEED & REFRESHING...`);
          const rawCycles = parseInt(localStorage.getItem('bot_auto_reload_cycles'), 10);
          const cycles = Number.isInteger(rawCycles)
            ? Math.max(0, Math.min(rawCycles, MAX_AUTO_RELOAD_CYCLES))
            : 0;
          if (cycles >= MAX_AUTO_RELOAD_CYCLES) {
            stopBot('MAX AUTO-RELOAD CYCLES REACHED');
            return;
          }
          localStorage.setItem('bot_auto_reload_cycles', String(cycles + 1));
          localStorage.setItem('bot_auto_run', 'true');
          await changeSeed();
          location.reload();
          return;
        }
      } else if (newBal < lastBalance) {
        winCount = 0;
        lossCount += 1;
        currentBet *= LOSS_INCREASE;
        addHackerLog(`LOSS STREAK: [${lossCount}/${LOSSES_BEFORE_DIRECTION_SWITCH}]`);

        if (lossCount % LOSSES_BEFORE_DIRECTION_SWITCH === 0) toggleDirection();
        if (lossCount >= MAX_CONSECUTIVE_LOSSES_STOP) {
          stopBot(`MAX LOSS STREAK ${MAX_CONSECUTIVE_LOSSES_STOP}`);
          return;
        }
      } else {
        addHackerLog('NO BALANCE CHANGE - RETRYING');
      }

      lastBalance = newBal;
      await sleep(ACTION_DELAY_MS);
    }
  }

  function drawUI() {
    if (document.getElementById('main-btn')) return;

    const leftTerm = document.createElement('div');
    leftTerm.style =
      'position:fixed;top:100px;left:20px;z-index:10000;background:rgba(0,0,0,0.9);border:1px solid #0f0;padding:12px;width:280px;height:400px;font-family:monospace;box-shadow:0 0 20px rgba(0,255,0,0.3);overflow:hidden;';
    leftTerm.innerHTML = `
      <div style="color:#0f0;font-weight:bold;border-bottom:1px solid #0f0;margin-bottom:10px;font-size:12px;text-shadow:0 0 5px #0f0;">> INTRUSION CONSOLE V19.1</div>
      <div id="hacker-stream" style="height:320px;overflow:hidden;color:#0f0;"></div>
      <div style="border-top:1px solid #0f0;margin-top:8px;font-size:11px;color:#fff;">
        TOTAL SEEDS CHANGED: <span id="seed-count-val" style="color:#0f0;font-weight:bold;">0</span>
      </div>
    `;
    document.body.appendChild(leftTerm);

    const rightTerm = document.createElement('div');
    rightTerm.style =
      'position:fixed;bottom:20px;right:20px;z-index:10000;background:#000;border:2px solid #f00;padding:15px;width:260px;font-family:monospace;box-shadow:0 0 20px rgba(255,0,0,0.4);';
    rightTerm.innerHTML = `
      <div id="bal-d" style="color:#f00;font-size:15px;margin-bottom:5px;font-weight:bold;text-shadow:0 0 5px #f00;">BAL: 0.00000000</div>
      <div style="color:#666;font-size:10px;margin-bottom:15px;">REFRESH EVERY ${WINS_BEFORE_SEED_REFRESH} WINS<br>CHANCE: ${TARGET_CHANCE}%</div>
      <button id="main-btn" style="width:100%;background:transparent;border:1px solid #0f0;color:#0f0;padding:12px;cursor:pointer;font-weight:bold;text-transform:uppercase;">START BOT</button>
    `;
    document.body.appendChild(rightTerm);
    updateSeedUi();

    document.getElementById('main-btn').onclick = () => {
      if (isRunning) {
        stopBot('MANUAL STOP');
      } else {
        localStorage.setItem('bot_auto_reload_cycles', '0');
        runBot();
      }
    };

    setInterval(() => {
      const b = document.getElementById('bal-d');
      if (b) b.innerText = `BAL: ${getBalance().toFixed(8)}`;
    }, 1000);

    if (localStorage.getItem('bot_auto_run') === 'true') {
      localStorage.setItem('bot_auto_run', 'false');
      setTimeout(runBot, AUTO_RUN_DELAY_MS);
    }
  }

  setTimeout(drawUI, 4000);
})();
