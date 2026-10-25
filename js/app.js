да/* Просвет — UI, события, связка движка, хранилища и экранов. */
(function () {
  "use strict";

  const Engine = window.Engine;
  const Storage = window.Storage;
  const root = document.documentElement;

  /* ---------- Состояние ---------- */
  let state = Storage.load();
  let lastResult = null;
  let currentDetailDebt = null;
  let currentBuyTicker = null;
  let latestQuotes = []; // Кеш последних котировок для портфеля

  /* ---------- Утилиты ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const money = (v) => Engine.formatMoney(v, state.settings.currency);

  function persist() { Storage.save(state); }

  function showToast(message, type = "success") {
    const container = $("#toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("toast-out");
      toast.addEventListener("animationend", () => toast.remove());
    }, 3000);
  }

  /* ---------- Тема и Навигация ---------- */
  const THEME_KEY = "prosvet.theme";
  function applyTheme(t) { root.setAttribute("data-theme", t); const icon = $(".theme-icon"); if (icon) icon.textContent = t === "light" ? "◑" : "◐"; try { localStorage.setItem(THEME_KEY, t); } catch {} }
  function toggleTheme() { applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light"); }
  let savedTheme = null; try { savedTheme = localStorage.getItem(THEME_KEY); } catch {}
  applyTheme(savedTheme === "light" ? "light" : "dark");

  const screens = $$(".screen");
  const tabs = $$(".tab");
  function show(name) {
    screens.forEach(s => s.classList.toggle("is-active", s.dataset.screen === name));
    tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab)));

  /* ---------- Долги ---------- */
  const segBtns = $$("#strategySeg .seg");
  const hint = $("#strategyHint");
  const hints = {
    avalanche: "Лавина: сначала самый дорогой долг по ставке. Математически выгоднее всего.",
    snowball: "Снежный ком: сначала самый маленький долг. Больше закрытий — сильнее мотивация.",
    custom: "Свой порядок: расставляешь приоритеты через стрелочки ниже.",
  };
  function setStrategy(strategy) {
    state.settings.strategy = strategy;
    segBtns.forEach(b => b.classList.toggle("is-active", b.dataset.strategy === strategy));
    if (hint) hint.textContent = hints[strategy] || "";
    persist(); render();
  }
  segBtns.forEach(btn => btn.addEventListener("click", () => setStrategy(btn.dataset.strategy)));

  const extraInput = $("#extraPayment");
  let extraTimer = null;
  extraInput.addEventListener("input", () => {
    clearTimeout(extraTimer);
    extraTimer = setTimeout(() => {
      state.settings.extraPayment = Math.max(0, Number(extraInput.value) || 0);
      persist(); render();
    }, 250);
  });

  const modal = $("#debtModal");
  const modalTitle = $("#modalTitle");
  const form = $("#debtForm");

  function openDebtModal(debt) {
    form.reset();
    if (debt) {
      form.elements.name.value = debt.name;
      form.elements.balance.value = debt.balance;
      form.elements.apr.value = debt.apr;
      form.elements.minPayment.value = debt.minPayment;
      form.dataset.editId = debt.id;
      modalTitle.textContent = "Изменить долг";
    } else {
      delete form.dataset.editId;
      modalTitle.textContent = "Новый долг";
    }
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; }

  $("#addDebtBtn").addEventListener("click", () => openDebtModal(null));
  $("#modalClose").addEventListener("click", closeModal);
  $("#debtCancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const balance = Math.max(0, Number(fd.get("balance")) || 0);
    const apr = Math.max(0, Number(fd.get("apr")) || 0);
    const minPayment = Math.max(0, Number(fd.get("minPayment")) || 0);
    if (!name || balance <= 0) return;

    const editId = form.dataset.editId;
    if (editId) {
      const d = state.debts.find(x => x.id === editId);
      if (d) Object.assign(d, { name, balance, apr, minPayment });
    } else {
      state.debts.push({ id: Storage.makeId(), name, balance, apr, minPayment, priority: state.debts.length, createdAt: Date.now() });
    }
    persist(); closeModal(); render();
  });

  /* ---------- Рендер Долгов ---------- */
  function renderDebts() {
    const debtList = $("#debtList");
    const debtEmpty = $("#debtsEmpty");
    $("#debtCount").textContent = String(state.debts.length);
    if (state.debts.length === 0) { debtList.hidden = true; debtEmpty.hidden = false; return; }
    debtEmpty.hidden = true; debtList.hidden = false; debtList.innerHTML = "";

    state.debts.forEach(d => {
      const li = document.createElement("li");
      li.className = "debt-card";
      li.innerHTML = `
        <div class="debt-left">
          <div class="debt-name"></div>
          <div class="debt-meta"><span class="num">${d.apr}%</span> · мин. <span class="num">${money(d.minPayment)}</span></div>
        </div>
        <div class="debt-right">
          <div class="debt-balance num">${money(d.balance)}</div>
          <button class="debt-del" type="button">×</button>
        </div>
      `;
      li.querySelector(".debt-name").textContent = d.name;
      li.addEventListener("click", (e) => { if (e.target.closest(".debt-del")) return; openDetailsModal(d); });
      li.querySelector(".debt-del").addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить долг «${d.name}»?`)) return;
        state.debts = state.debts.filter(x => x.id !== d.id);
        state.debts.forEach((x, i) => { x.priority = i; });
        persist(); render();
      });
      debtList.appendChild(li);
    });
  }

  function renderSummary() {
    const total = state.debts.reduce((s, d) => s + (Number(d.balance) || 0), 0);
    const minSum = state.debts.reduce((s, d) => s + (Number(d.minPayment) || 0), 0);
    const weighted = total > 0 ? state.debts.reduce((s, d) => s + (Number(d.apr) || 0) * (Number(d.balance) || 0), 0) / total : 0;
    $("#sumTotal").textContent = money(total);
    $("#sumMin").textContent = money(minSum);
    $("#sumRate").textContent = (Math.round(weighted * 10) / 10) + "%";
  }

  /* ---------- Результаты и Графики ---------- */
  function renderResult() {
    const result = Engine.simulate(state.debts, { strategy: state.settings.strategy, extraPayment: state.settings.extraPayment });
    lastResult = result;
    const chart = $("#chart");
    const comparisonChart = $("#comparisonChart");

    if (state.debts.length === 0) {
      $("#freedomDate").textContent = "—"; $("#freedomMonths").textContent = "0 месяцев";
      $("#totalInterest").textContent = money(0); $("#totalPaid").textContent = money(0);
      $("#chartEmpty").hidden = false; chart.style.display = "none"; comparisonChart.style.display = "none";
      $("#tips").innerHTML = '<li class="tip tip-mute">Добавь долги.</li>'; $("#comparisonBox").hidden = true;
      return;
    }

    if (result.unpaid.length > 0) {
      $("#freedomDate").textContent = "не закрывается"; $("#freedomMonths").textContent = `${result.months}+ мес.`;
    } else {
      $("#freedomDate").textContent = Engine.formatDate(result.freedomDate); $("#freedomMonths").textContent = `${result.months} ${Engine.pluralMonths(result.months)}`;
    }
    $("#totalInterest").textContent = money(result.totalInterest); $("#totalPaid").textContent = money(result.totalPaid);

    if (result.schedule.length > 1) {
      $("#chartEmpty").hidden = true; chart.style.display = "block"; drawChart(result.schedule, chart);
    } else { $("#chartEmpty").hidden = false; chart.style.display = "none"; }

    const tips = Engine.buildRecommendations(state.debts, result, { currency: state.settings.currency, strategy: state.settings.strategy, extraPayment: state.settings.extraPayment });
    const ul = $("#tips"); ul.innerHTML = "";
    tips.forEach(t => { const li = document.createElement("li"); li.className = `tip tip-${t.type}`; li.textContent = t.text; ul.appendChild(li); });

    renderComparison();
    if (result.schedule.length > 1) {
      const av = Engine.simulate(state.debts, { strategy: "avalanche", extraPayment: state.settings.extraPayment });
      const sb = Engine.simulate(state.debts, { strategy: "snowball", extraPayment: state.settings.extraPayment });
      comparisonChart.style.display = "block"; drawComparisonChart(av.schedule, sb.schedule, comparisonChart);
    }
  }

  function renderComparison() {
    const box = $("#comparisonBox");
    if (state.debts.length === 0) { box.hidden = true; return; }
    box.hidden = false;
    const av = Engine.simulate(state.debts, { strategy: "avalanche", extraPayment: state.settings.extraPayment });
    const sb = Engine.simulate(state.debts, { strategy: "snowball", extraPayment: state.settings.extraPayment });
    const fmtTime = (res) => res.unpaid.length > 0 ? "50+ лет" : `${res.months} мес.`;
    $("#cmpAvalancheTime").textContent = fmtTime(av); $("#cmpAvalancheInterest").textContent = `Переплата: ${money(av.totalInterest)}`;
    $("#cmpSnowballTime").textContent = fmtTime(sb); $("#cmpSnowballInterest").textContent = `Переплата: ${money(sb.totalInterest)}`;
  }

  /* ---------- Стратегия ---------- */
  function renderStrategyScreen() {
    const empty = $("#strategyEmpty"); const tips = $("#strategyTips");
    if (state.debts.length === 0) { empty.hidden = false; tips.innerHTML = ""; return; }
    empty.hidden = true;
    const order = Engine.orderDebts(state.debts, state.settings.strategy);
    tips.innerHTML = "";
    order.forEach((d, i) => {
      const li = document.createElement("li"); li.className = "tip";
      const arrows = state.settings.strategy === "custom" ? `
        <div class="order-arrows">
          <button class="arrow-btn" data-id="${d.id}" data-dir="up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="arrow-btn" data-id="${d.id}" data-dir="down" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
        </div>` : '';
      li.innerHTML = `<div style="display:flex; align-items:center; gap:12px;">
        <span class="num" style="color:var(--accent); width:20px;">${i + 1}.</span> 
        <span class="order-name" style="flex:1;"></span>${arrows}</div>`;
      li.querySelector(".order-name").textContent = d.name;
      if (arrows) {
        li.querySelectorAll('.arrow-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id; const dir = e.target.dataset.dir;
            const idx = state.debts.findIndex(x => x.id === id);
            if (dir === 'up' && idx > 0) [state.debts[idx - 1], state.debts[idx]] = [state.debts[idx], state.debts[idx - 1]];
            else if (dir === 'down' && idx < state.debts.length - 1) [state.debts[idx + 1], state.debts[idx]] = [state.debts[idx], state.debts[idx + 1]];
            state.debts.forEach((x, i) => { x.priority = i; }); persist(); render();
          });
        });
      }
      tips.appendChild(li);
    });
  }

  /* ---------- Модалка детализации ---------- */
  const detailsModal = $("#detailsModal");
  function closeDetailsModal() { detailsModal.hidden = true; currentDetailDebt = null; }
  function openDetailsModal(debt) {
    if (!lastResult || !lastResult.schedule) return;
    currentDetailDebt = debt; $("#detailsTitle").textContent = debt.name;
    const tbody = $("#detailsBody"); tbody.innerHTML = "";
    lastResult.schedule.forEach(monthRow => {
      const d = monthRow.debts.find(x => x.id === debt.id);
      if (d && (d.payment > 0 || d.remaining > 0)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${monthRow.month}</td><td class="num">${money(d.payment)}</td><td class="num" style="color:var(--danger)">${money(d.interest)}</td><td class="num" style="color:var(--success)">${money(d.principal)}</td><td class="num">${money(d.remaining)}</td>`;
        tbody.appendChild(tr);
      }
    });
    detailsModal.hidden = false;
  }
  $("#detailsClose").addEventListener("click", closeDetailsModal);
  $("#detailsEditBtn").addEventListener("click", () => { if (currentDetailDebt) { closeDetailsModal(); openDebtModal(currentDetailDebt); } });

  /* ---------- Графики (Canvas) ---------- */
  function drawChart(schedule, canvas) {
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
    const W = Math.max(280, rect.width || 600); const H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#d9b46a"; const line = getComputedStyle(root).getPropertyValue("--line").trim() || "#26262f";
    const pad = { l: 8, r: 8, t: 16, b: 22 }; const cw = W - pad.l - pad.r; const ch = H - pad.t - pad.b; const maxVal = schedule[0].totalRemaining || 1;
    const px = (i) => pad.l + (i / Math.max(1, schedule.length - 1)) * cw; const py = (v) => pad.t + ch - (v / maxVal) * ch;
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) { const y = pad.t + (ch / 3) * g; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); }
    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b); grad.addColorStop(0, accent + "55"); grad.addColorStop(1, accent + "00");
    ctx.beginPath(); ctx.moveTo(px(0), H - pad.b); schedule.forEach((m, i) => ctx.lineTo(px(i), py(m.totalRemaining))); ctx.lineTo(px(schedule.length - 1), H - pad.b); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); schedule.forEach((m, i) => { const x = px(i), y = py(m.totalRemaining); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawComparisonChart(avS, sbS, canvas) {
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
    const W = Math.max(280, rect.width || 600); const H = 220; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#d9b46a"; const success = getComputedStyle(root).getPropertyValue("--success").trim() || "#5bd49a"; const line = getComputedStyle(root).getPropertyValue("--line").trim() || "#26262f";
    const pad = { l: 8, r: 8, t: 16, b: 22 }; const cw = W - pad.l - pad.r; const ch = H - pad.t - pad.b;
    const maxVal = Math.max(avS.length > 0 ? avS[0].totalRemaining : 0, sbS.length > 0 ? sbS[0].totalRemaining : 0) || 1;
    const maxMonths = Math.max(avS.length, sbS.length);
    const px = (i) => pad.l + (i / Math.max(1, maxMonths - 1)) * cw; const py = (v) => pad.t + ch - (v / maxVal) * ch;
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) { const y = pad.t + (ch / 3) * g; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); }
    ctx.beginPath(); avS.forEach((m, i) => { const x = px(i), y = py(m.totalRemaining); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); sbS.forEach((m, i) => { const x = px(i), y = py(m.totalRemaining); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.strokeStyle = success; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
  }

  /* ---------- Кредитные калькуляторы (ИСПРАВЛЕНО) ---------- */
  const creditSegBtns = $$("#creditTypeSeg .seg");
  const calcPanels = $$(".calc-panel");
  creditSegBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      creditSegBtns.forEach(b => b.classList.toggle("is-active", b === btn));
      calcPanels.forEach(p => p.hidden = p.id !== `calc${type.charAt(0).toUpperCase() + type.slice(1)}`);
    });
  });

  $("#calcMortBtn")?.addEventListener("click", () => {
    const sum = Number($("#mortSum").value); const rate = Number($("#mortRate").value) / 100 / 12; const years = Number($("#mortYears").value);
    if (!sum || !rate || !years) return showToast("Заполните все поля", "error");
    const months = years * 12; const monthly = sum * (rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
    $("#mortMonthly").textContent = money(monthly); $("#mortOverpay").textContent = money(monthly * months - sum); $("#mortResult").hidden = false;
  });

  $("#calcAutoBtn")?.addEventListener("click", () => {
    const sum = Number($("#autoSum").value); const rate = Number($("#autoRate").value) / 100 / 12; const years = Number($("#autoYears").value);
    if (!sum || !rate || !years) return showToast("Заполните все поля", "error");
    const months = years * 12; const monthly = sum * (rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
    $("#autoMonthly").textContent = money(monthly); $("#autoOverpay").textContent = money(monthly * months - sum); $("#autoResult").hidden = false;
  });

  // Досрочное погашение - ТОЧНЫЙ РАСЧЕТ
  let earlyStrategy = "term";
  $$("#earlyStrategySeg .seg").forEach(btn => {
    btn.addEventListener("click", () => {
      earlyStrategy = btn.dataset.estrategy;
      $$("#earlyStrategySeg .seg").forEach(b => b.classList.toggle("is-active", b === btn));
    });
  });

  function simulateLoan(balance, rate, payment, extra) {
    let bal = balance - extra;
    let months = 0;
    let totalInterest = 0;
    // Ограничение на 600 месяцев (50 лет)
    while (bal > 0.01 && months < 600) {
      const interest = bal * rate;
      const principal = payment - interest;
      if (principal <= 0) return null; // Платеж не покрывает проценты
      bal -= principal;
      totalInterest += interest;
      months++;
    }
    return { months, totalInterest, finalPayment: bal > 0 ? payment + bal : payment };
  }

  $("#calcEarlyBtn")?.addEventListener("click", () => {
    const balance = Number($("#earlyBalance").value);
    const rate = Number($("#earlyRate").value) / 100 / 12;
    const payment = Number($("#earlyPayment").value);
    const extra = Number($("#earlyExtra").value);
    
    if (!balance || !rate || !payment || !extra) return showToast("Заполните все поля", "error");
    if (extra >= balance) return showToast("Досрочный платеж больше долга", "error");

    // Базовая линия
    const base = simulateLoan(balance, rate, payment, 0);
    if (!base) return showToast("Платёж слишком мал", "error");

    if (earlyStrategy === "term") {
      // Уменьшаем срок (платеж тот же)
      const newSim = simulateLoan(balance, rate, payment, extra);
      const savedMonths = base.months - newSim.months;
      const savedInterest = base.totalInterest - newSim.totalInterest;
      $("#earlyNewTerm").textContent = `-${savedMonths} мес.`;
      $("#earlySave").textContent = money(Math.max(0, savedInterest));
    } else {
      // Уменьшаем платеж (срок тот же) - пересчитываем новый аннуитет на остаток срока
      const newBalance = balance - extra;
      const months = base.months;
      const newMonthly = newBalance * (rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
      
      const newSim = simulateLoan(newBalance, rate, newMonthly, 0); // Проверка (должно совпасть с base.months)
      const savedInterest = base.totalInterest - newSim.totalInterest;
      
      $("#earlyNewTerm").textContent = `${money(newMonthly)} / мес.`;
      $("#earlySave").textContent = money(Math.max(0, savedInterest));
    }
    $("#earlyResult").hidden = false;
  });

  /* ---------- Аналитика MOEX + Портфель ---------- */
  
  const STOCKS = ["SBER", "GAZP", "LKOH", "GMKN", "ROSN", "NVTK", "TATN", "SNGS", "SNGSP", "PLZL", "YDEX", "TCSG", "VTBR", "ALRS", "MTLR", "CHMF", "NLMK", "MAGN", "MOEX", "RUAL", "IRAO", "HYDR", "FEES", "RSTI", "TRNFP", "AFLT", "UPRO", "MSNG", "CBOM", "AFKS", "PIKK", "LSRG", "RTKM", "MGTS", "KMAZ", "SVAV", "BLNG", "SGZH", "VKCO", "UGLD", "POSI", "FLOT", "SPBE", "TGKA", "SVCB", "LENT", "MVID", "ASTR", "WUSH", "DIAS"];
  const BONDS = ["SU26238RMFS4", "SU26243RMFS4", "SU26244RMFS4", "SU26245RMFS4", "SU26246RMFS4", "SU26247RMFS4", "SU26248RMFS4", "SU26249RMFS4", "SU26250RMFS4", "SU26251RMFS4"];

  function calcSMA(closes, period) { if (closes.length < period) return null; const slice = closes.slice(-period); return slice.reduce((a, b) => a + b, 0) / period; }
  function calcRSI(closes, period = 14) {
    if (closes.length <= period) return null; let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) { const diff = closes[closes.length - period + i - 1] - closes[closes.length - period + i - 2]; if (diff >= 0) gains += diff; else losses -= diff; }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = closes.length - period; i < closes.length; i++) { const diff = closes[i] - closes[i - 1]; const gain = diff >= 0 ? diff : 0; const loss = diff < 0 ? -diff : 0; avgGain = (avgGain * (period - 1) + gain) / period; avgLoss = (avgLoss * (period - 1) + loss) / period; }
    if (avgLoss === 0) return 100; const rs = avgGain / avgLoss; return 100 - (100 / (1 + rs));
  }

  async function fetchHistory(ticker, isBond) {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1); const fromDate = d.toISOString().split('T')[0];
    const board = isBond ? "bonds" : "shares"; const boardId = isBond ? "TQOB" : "TQBR";
    const url = `https://iss.moex.com/iss/history/engines/stock/markets/${board}/boards/${boardId}/securities/${ticker}.json?from=${fromDate}&iss.meta=off`;
    try {
      const res = await fetch(url); if (!res.ok) return null; const json = await res.json();
      const closeIdx = json.history.columns.indexOf("CLOSE"); if (closeIdx === -1) return null;
      return json.history.data.map(row => row[closeIdx]).filter(v => v !== null);
    } catch (e) { return null; }
  }

  async function fetchQuotes() {
    const urlStocks = "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=marketdata,securities";
    const urlBonds = "https://iss.moex.com/iss/engines/stock/markets/bonds/boards/TQOB/securities.json?iss.meta=off&iss.only=marketdata,securities";

    const [resStocks, resBonds] = await Promise.all([fetch(urlStocks), fetch(urlBonds)]);
    if (!resStocks.ok || !resBonds.ok) throw new Error("Ошибка MOEX");
    const jsonStocks = await resStocks.json(); const jsonBonds = await resBonds.json();
    const quotes = [];

    // Акции
    const c1 = jsonStocks.marketdata.columns; const d1 = jsonStocks.marketdata.data;
    const idx1 = { SECID: c1.indexOf("SECID"), LAST: c1.indexOf("LAST"), LASTCHANGEPRCNT: c1.indexOf("LASTCHANGEPRCNT"), OPEN: c1.indexOf("OPEN"), HIGH: c1.indexOf("HIGH"), LOW: c1.indexOf("LOW"), WAPRICE: c1.indexOf("WAPRICE") };
    
    // Фундаментал (Дивиденды) - ищем в блоке securities
    const sc1 = jsonStocks.securities.columns; const sd1 = jsonStocks.securities.data;
    const sIdx1 = { SECID: sc1.indexOf("SECID"), DIVIDENDYIELD: sc1.indexOf("DIVIDENDYIELD") };

    for (const row of d1) {
      const ticker = row[idx1.SECID]; if (!STOCKS.includes(ticker)) continue;
      const last = row[idx1.LAST] || row[idx1.WAPRICE] || row[idx1.OPEN] || 0; if (last === 0) continue;
      // Ищем дивиденды
      let divYield = 0;
      if (sIdx1.DIVIDENDYIELD !== -1) {
          const sRow = sd1.find(r => r[sIdx1.SECID] === ticker);
          if (sRow) divYield = sRow[sIdx1.DIVIDENDYIELD] || 0;
      }
      quotes.push({ ticker, type: "stock", price: last, changePercent: row[idx1.LASTCHANGEPRCNT] || 0, high: row[idx1.HIGH] || last, low: row[idx1.LOW] || last, divYield });
    }

    // Облигации
    const c2 = jsonBonds.marketdata.columns; const d2 = jsonBonds.marketdata.data;
    const idx2 = { SECID: c2.indexOf("SECID"), LAST: c2.indexOf("LAST"), LASTCHANGEPRCNT: c2.indexOf("LASTCHANGEPRCNT"), OPEN: c2.indexOf("OPEN"), HIGH: c2.indexOf("HIGH"), LOW: c2.indexOf("LOW"), WAPRICE: c2.indexOf("WAPRICE") };
    
    // Для облигаций YTM, Дюрация, НКД лежат в securities
    const sc2 = jsonBonds.securities.columns; const sd2 = jsonBonds.securities.data;
    const sIdx2 = { SECID: sc2.indexOf("SECID"), YIELDATPREVWAPRICE: sc2.indexOf("YIELDATPREVWAPRICE"), DURATION: sc2.indexOf("DURATION"), ACCRUEDINT: sc2.indexOf("ACCRUEDINT") };

    for (const row of d2) {
      const ticker = row[idx2.SECID]; if (!BONDS.includes(ticker)) continue;
      const last = row[idx2.LAST] || row[idx2.WAPRICE] || row[idx2.OPEN] || 0; if (last === 0) continue;
      
      let ytm = 0, duration = 0, accrued = 0;
      const sRow = sd2.find(r => r[sIdx2.SECID] === ticker);
      if (sRow) {
          ytm = sRow[sIdx2.YIELDATPREVWAPRICE] || 0;
          duration = sRow[sIdx2.DURATION] || 0;
          accrued = sRow[sIdx2.ACCRUEDINT] || 0;
      }

      quotes.push({ ticker, type: "bond", price: last * 10, changePercent: row[idx2.LASTCHANGEPRCNT] || 0, high: (row[idx2.HIGH] || last) * 10, low: (row[idx2.LOW] || last) * 10, ytm, duration, accrued });
    }

    return quotes;
  }

  function analyzeQuote(quote, closes) {
    let score = 50; let reasons = []; let tags = []; let shortSignal = "Нейтрально"; let longSignal = "Нейтрально"; let stopLoss = 0;

    if (quote.type === "bond") {
      tags.push({ text: "ОФЗ", type: "neutral" });
      tags.push({ text: `YTM: ${quote.ytm.toFixed(1)}%`, type: "good" });
      tags.push({ text: `Дюр: ${quote.duration.toFixed(1)} г.`, type: "neutral" });
      tags.push({ text: `НКД: ${quote.accrued.toFixed(1)} ₽`, type: "neutral" });
      
      if (quote.ytm > 12) score += 15; // Высокая доходность
      longSignal = quote.ytm > 12 ? "Покупать (высокая YTM)" : "Держать";
      shortSignal = "Только долгосрок";
      reasons.push(`Доходность к погашению ${quote.ytm.toFixed(1)}%`);
      return { score: Math.round(Math.max(0, Math.min(100, score))), recommendation: longSignal.includes('Покупать') ? 'Покупать' : 'Держать', shortSignal, longSignal, stopLoss, reasons, tags };
    }

    // Для акций
    if (quote.divYield > 0) tags.push({ text: `Див: ${quote.divYield.toFixed(1)}%`, type: "good" });
    
    if (quote.changePercent > 0) { score += 5; reasons.push("Рост за день"); } else { score -= 5; reasons.push("Падение за день"); }

    if (closes && closes.length > 20) {
      const ma50 = calcSMA(closes, 50); const ma200 = calcSMA(closes, 200); const rsi = calcRSI(closes, 14);

      if (ma50) {
        if (quote.price > ma50) { score += 10; shortSignal = "Покупать"; tags.push({ text: "> MA50", type: "good" }); }
        else { score -= 10; shortSignal = "Избегать"; tags.push({ text: "< MA50", type: "bad" }); }
      }
      if (rsi !== null) {
        const rsiVal = Math.round(rsi);
        tags.push({ text: `RSI: ${rsiVal}`, type: rsiVal < 30 ? "good" : rsiVal > 70 ? "bad" : "neutral" });
        if (rsi < 30) { score += 15; shortSignal = "Активно покупать"; reasons.push("RSI < 30 (перепроданность)"); }
        else if (rsi > 70) { score -= 15; shortSignal = "Продавать"; reasons.push("RSI > 70 (перекупленность)"); }
      }

      if (ma200) {
        if (quote.price > ma200) { score += 15; longSignal = "Покупать"; reasons.push("Выше MA200 (бычий тренд)"); }
        else { score -= 15; longSignal = "Избегать"; reasons.push("Ниже MA200 (медвежий тренд)"); }
      }
    } else { tags.push({ text: "Мало данных", type: "neutral" }); }

    score = Math.max(0, Math.min(100, score));
    let recommendation = "Держать";
    if (score >= 70) recommendation = "Покупать"; else if (score <= 30) recommendation = "Избегать";

    // Стоп-лосс (только для краткосрока)
    if (shortSignal.includes("Покупать") || shortSignal.includes("Активно")) {
      stopLoss = quote.price * 0.95; // -5%
    }

    return { score: Math.round(score), recommendation, shortSignal, longSignal, stopLoss, reasons, tags };
  }

  // --- Портфель ---
  function renderPortfolio() {
    const box = $("#portfolioBox");
    if (state.portfolio.length === 0) { box.hidden = true; return; }
    box.hidden = false;

    let totalValue = 0;
    let totalInvested = 0;

    state.portfolio.forEach(p => {
      const q = latestQuotes.find(x => x.ticker === p.ticker);
      const currentPrice = q ? q.price : p.buyPrice; // Если нет данных, берем цену покупки
      totalValue += currentPrice * p.qty;
      totalInvested += p.buyPrice * p.qty;
    });

    const pnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

    $("#portTotal").textContent = money(totalValue);
    const pnlEl = $("#portPnl");
    pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${money(pnl)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`;
    pnlEl.style.color = pnl >= 0 ? "var(--success)" : "var(--danger)";
  }

  const buyModal = $("#buyModal");
  const buyForm = $("#buyForm");

  function openBuyModal(ticker, price) {
    currentBuyTicker = ticker;
    $("#buyTitle").textContent = `Купить ${ticker}`;
    buyForm.reset();
    buyForm.elements.price.value = price.toFixed(2);
    buyModal.hidden = false;
  }
  function closeBuyModal() { buyModal.hidden = true; currentBuyTicker = null; }

  $("#buyClose").addEventListener("click", closeBuyModal);
  $("#buyCancel").addEventListener("click", closeBuyModal);
  buyModal.addEventListener("click", (e) => { if (e.target === buyModal) closeBuyModal(); });

  buyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const qty = Number(buyForm.elements.qty.value);
    const price = Number(buyForm.elements.price.value);
    if (!qty || !price || !currentBuyTicker) return;

    const q = latestQuotes.find(x => x.ticker === currentBuyTicker);
    const type = q && q.type === "bond" ? "bond" : "stock";

    state.portfolio.push({
      id: Storage.makeId(),
      ticker: currentBuyTicker,
      qty, buyPrice: price, type, date: Date.now()
    });
    persist();
    closeBuyModal();
    renderPortfolio();
    showToast(`Куплено ${qty} шт. ${currentBuyTicker}`);
  });

  // --- Рендер аналитики ---
  const runAnalyticsBtn = $("#runAnalyticsBtn");
  const analyticsList = $("#analyticsList");

  if (runAnalyticsBtn) {
    runAnalyticsBtn.addEventListener("click", async () => {
      runAnalyticsBtn.disabled = true;
      runAnalyticsBtn.innerHTML = '<span>⏳</span> Скачиваем...';
      $("#analyticsEmpty").hidden = true;
      analyticsList.hidden = false;
      analyticsList.innerHTML = `<li class="loading-progress"><div class="loading-spinner"></div><div>Загрузка бумаг...</div></li>`;

            try {
        const quotes = await fetchQuotes();
        latestQuotes = quotes; // Сохраняем для портфеля
        
        const analyzed = [];
        const batchSize = 10; // Загружаем пачками по 10 бумаг одновременно
        
        for (let i = 0; i < quotes.length; i += batchSize) {
          const batch = quotes.slice(i, i + batchSize);
          const currentEnd = Math.min(i + batchSize, quotes.length);
          
          analyticsList.innerHTML = `<li class="loading-progress"><div class="loading-spinner"></div><div>Анализ бумаг (${i + 1}-${currentEnd} из ${quotes.length})...</div></li>`;
          
          const batchResults = await Promise.all(batch.map(async (q) => {
            const closes = await fetchHistory(q.ticker, q.type === "bond");
            const analysis = analyzeQuote(q, closes);
            return { ...q, ...analysis };
          }));
          
          analyzed.push(...batchResults);
        }

        const results = analyzed.sort((a, b) => b.score - a.score);
        analyticsList.innerHTML = "";
        $("#analyticsCount").textContent = String(results.length);


        results.forEach(item => {
          const li = document.createElement("li");
          li.className = "analytics-card";
          const changeClass = item.changePercent >= 0 ? "pos" : "neg";
          const changeSign = item.changePercent >= 0 ? "+" : "";
          const recClass = item.recommendation.includes("Покупать") ? "rec-buy" : item.recommendation.includes("Избегать") ? "rec-sell" : "rec-hold";
          const tagsHtml = item.tags.map(t => `<span class="tag tag-${t.type}">${t.text}</span>`).join("");

          let signalsHtml = `<div class="analytics-signals"><span>Краткосрок: <b style="color:${item.shortSignal.includes('Покупать') || item.shortSignal.includes('Активно') ? 'var(--success)' : item.shortSignal.includes('Избегать') || item.shortSignal.includes('Продавать') ? 'var(--danger)' : 'var(--text)'}">${item.shortSignal}</b></span><span>Долгосрок: <b style="color:${item.longSignal.includes('Покупать') ? 'var(--success)' : item.longSignal.includes('Избегать') ? 'var(--danger)' : 'var(--text)'}">${item.longSignal}</b></span>`;
          if (item.stopLoss > 0) signalsHtml += `<span style="margin-top:4px; font-size:11px; color:var(--danger)">Стоп-лосс: ${item.stopLoss.toFixed(2)} ₽</span>`;
          signalsHtml += `</div>`;

          li.innerHTML = `
            <button class="analytics-buy-btn" title="Добавить в портфель">+</button>
            <div class="analytics-header">
              <span class="analytics-ticker">${item.ticker}</span>
              <span class="analytics-price">${item.price.toFixed(2)} ₽</span>
              <span class="analytics-change ${changeClass}">${changeSign}${item.changePercent.toFixed(2)}%</span>
            </div>
            <div class="analytics-score-bar"><div class="analytics-score-fill" style="width: ${item.score}%"></div></div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="analytics-rec ${recClass}">${item.recommendation}</span>
            </div>
            ${signalsHtml}
            <div class="analytics-tags">${tagsHtml}</div>
            <div class="analytics-reasons">${item.reasons.join(" · ")}</div>
          `;
          
          li.querySelector(".analytics-buy-btn").addEventListener("click", () => openBuyModal(item.ticker, item.price));
          analyticsList.appendChild(li);
        });

        renderPortfolio(); // Обновляем портфель после загрузки новых цен!

      } catch (err) {
        console.error(err);
        analyticsList.innerHTML = '<li style="text-align:center; padding:20px; color:var(--danger)">Ошибка загрузки данных.</li>';
        showToast("Ошибка MOEX", "error");
      } finally {
        runAnalyticsBtn.disabled = false;
        runAnalyticsBtn.innerHTML = '<span>⚡</span> Обновить анализ';
      }
    });
  }

  /* ---------- PWA, Настройки, Старт ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $("#installBox").hidden = false; });
  $("#installBtn")?.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("#installBox").hidden = true; });

  if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); }); }

  $("#exportBtn").addEventListener("click", () => Storage.exportJson(state));
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try { state = await Storage.importFile(file); persist(); syncInputs(); render(); showToast("Данные загружены"); } catch (err) { showToast(err.message, "error"); }
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Сбросить всё?")) return;
    state = Storage.reset(); syncInputs(); render(); showToast("Сброшено");
  });

  function syncInputs() {
    extraInput.value = state.settings.extraPayment || "";
    $("#currencySel").value = state.settings.currency;
    segBtns.forEach(b => b.classList.toggle("is-active", b.dataset.strategy === state.settings.strategy));
    hint.textContent = hints[state.settings.strategy] || "";
  }

  function render() { renderDebts(); renderSummary(); renderStrategyScreen(); renderResult(); renderPortfolio(); }

  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#themeBtn2").addEventListener("click", toggleTheme);
  $("#currencySel").addEventListener("change", () => { state.settings.currency = $("#currencySel").value; persist(); render(); });

  syncInputs(); show("debts"); render();
})();
// --- Логика виджета микроинвестиций ---
function simulateMicroInvestments({ startAmount = 100, weeklyDeposit = 100, years = 5, annualRate = 14 }) {
  const weeks = years * 52;
  const weeklyRate = annualRate / 100 / 52;
  
  let totalInvested = startAmount;
  let portfolioValue = startAmount;

  for (let w = 1; w <= weeks; w++) {
    portfolioValue = (portfolioValue + weeklyDeposit) * (1 + weeklyRate);
    totalInvested += weeklyDeposit;
  }

  return {
    totalInvested: Math.round(totalInvested),
    finalValue: Math.round(portfolioValue),
    totalProfit: Math.round(portfolioValue - totalInvested)
  };
}

function initMicroInvestWidget() {
  const startInput = document.getElementById("miStart");
  const weeklyInput = document.getElementById("miWeekly");
  const yearsInput = document.getElementById("miYears");

  const resInvested = document.getElementById("miResInvested");
  const resValue = document.getElementById("miResValue");
  const resProfit = document.getElementById("miResProfit");

  if (!startInput || !weeklyInput || !yearsInput) return; // Если элемент еще не отрисован

  function update() {
    const start = Number(startInput.value) || 0;
    const weekly = Number(weeklyInput.value) || 0;
    const years = Number(yearsInput.value) || 1;

    const res = simulateMicroInvestments({ startAmount: start, weeklyDeposit: weekly, years: years, annualRate: 14 });

    resInvested.textContent = res.totalInvested.toLocaleString() + " ₽";
    resValue.textContent = res.finalValue.toLocaleString() + " ₽";
    resProfit.textContent = "+" + res.totalProfit.toLocaleString() + " ₽";
  }

  [startInput, weeklyInput, yearsInput].forEach(el => {
    el.addEventListener("input", update);
  });

  update();
}

// Запускаем инициализацию виджета после загрузки страницы
document.addEventListener("DOMContentLoaded", initMicroInvestWidget);
// --- Логика виджета микроинвестиций и трекера ---
function simulateMicroInvestments({ startAmount = 100, weeklyDeposit = 100, years = 5, annualRate = 14 }) {
  const weeks = years * 52;
  const weeklyRate = annualRate / 100 / 52;
  
  let totalInvested = startAmount;
  let portfolioValue = startAmount;

  for (let w = 1; w <= weeks; w++) {
    portfolioValue = (portfolioValue + weeklyDeposit) * (1 + weeklyRate);
    totalInvested += weeklyDeposit;
  }

  const annualPassive = portfolioValue * 0.10;
  const monthlyPassive = annualPassive / 12;

  return {
    totalInvested: Math.round(totalInvested),
    finalValue: Math.round(portfolioValue),
    totalProfit: Math.round(portfolioValue - totalInvested),
    monthlyPassive: Math.round(monthlyPassive)
  };
}

function initMicroInvestWidget() {
  const startInput = document.getElementById("miStart");
  const weeklyInput = document.getElementById("miWeekly");
  const yearsInput = document.getElementById("miYears");

  const resInvested = document.getElementById("miResInvested");
  const resValue = document.getElementById("miResValue");
  const resPassive = document.getElementById("miResPassive");
  const weekCheck = document.getElementById("miWeekCheck");
  const trackerStatus = document.getElementById("trackerStatus");
  const targetWeekSum = document.getElementById("targetWeekSum");
  const signalsContent = document.getElementById("microSignalsContent");

  if (!startInput) return;

  const checkKey = "prosvet_micro_week_checked";
  if (weekCheck) {
    weekCheck.checked = localStorage.getItem(checkKey) === "true";
    updateTrackerStatus();
    
    weekCheck.addEventListener("change", () => {
      localStorage.setItem(checkKey, weekCheck.checked);
      updateTrackerStatus();
    });
  }

  function updateTrackerStatus() {
    if (weekCheck.checked) {
      trackerStatus.textContent = "✓ Выполнено на этой неделе!";
      trackerStatus.style.color = "var(--success)";
    } else {
      trackerStatus.textContent = "⏳ Ожидает пополнения";
      trackerStatus.style.color = "var(--accent)";
    }
  }

  function update() {
    const start = Number(startInput.value) || 0;
    const weekly = Number(weeklyInput.value) || 0;
    const years = Number(yearsInput.value) || 1;

    if (targetWeekSum) targetWeekSum.textContent = weekly;

    const res = simulateMicroInvestments({ startAmount: start, weeklyDeposit: weekly, years: years, annualRate: 14 });

    if (resInvested) resInvested.textContent = res.totalInvested.toLocaleString() + " ₽";
    if (resValue) resValue.textContent = res.finalValue.toLocaleString() + " ₽";
    if (resPassive) resPassive.textContent = res.monthlyPassive.toLocaleString() + " ₽ / мес";

    if (signalsContent) {
      if (window.latestQuotes && window.latestQuotes.length > 0) {
        const topIdea = window.latestQuotes.find(q => q.type === "stock" && q.divYield > 5) || window.latestQuotes[0];
        signalsContent.innerHTML = `
          <b>Торговая идея для микро-бюджета:</b> Обратите внимание на защитные активы или фонды. 
          ${topIdea ? `Пример: <b>${topIdea.ticker}</b> (цена ~${topIdea.price.toFixed(0)} ₽).` : ''} 
          Регулярно покупайте паи на сумму недельного взноса, усредняя цену входа.
        `;
      } else {
        signalsContent.innerHTML = `
          <b>Совет по стратегии:</b> На 100–300 рублей лучше всего приобретать паи биржевых фондов (БПИФов) на широкий рынок или золото, чтобы избежать риска одной компании. 
          <i>(Нажмите «Обновить анализ» в блоке MOEX ниже, чтобы подгрузить свежие котировки).</i>
        `;
      }
    }
  }

  [startInput, weeklyInput, yearsInput].forEach(el => {
    if (el) el.addEventListener("input", update);
  });

  update();
}

document.addEventListener("DOMContentLoaded", initMicroInvestWidget);

