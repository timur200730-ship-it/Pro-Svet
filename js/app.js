/* Просвет — UI, события, связка движка, хранилища и экранов. */
(function () {
  "use strict";

  const Engine = window.Engine;
  const Storage = window.Storage;
  const root = document.documentElement;

  /* ---------- Состояние ---------- */
  let state = Storage.load();
  let lastResult = null;
  let currentDetailDebt = null;

  /* ---------- Утилиты ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const money = (v) => Engine.formatMoney(v, state.settings.currency);

  function persist() { Storage.save(state); }

  // --- Toast Уведомления ---
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

  /* ---------- Тема ---------- */
  const THEME_KEY = "prosvet.theme";
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#f6f4ee" : "#0b0b0e");
    const icon = $(".theme-icon");
    if (icon) icon.textContent = t === "light" ? "◑" : "◐";
    try { localStorage.setItem(THEME_KEY, t); } catch {}
  }
  function toggleTheme() {
    applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch {}
  applyTheme(savedTheme === "light" ? "light" : "dark");

  /* ---------- Навигация ---------- */
  const screens = $$(".screen");
  const tabs = $$(".tab");
  function show(name) {
    screens.forEach(s => s.classList.toggle("is-active", s.dataset.screen === name));
    tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab)));

  /* ---------- Стратегия ---------- */
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
    persist();
    render();
  }
  segBtns.forEach(btn => btn.addEventListener("click", () => setStrategy(btn.dataset.strategy)));

  /* ---------- Доп. платёж ---------- */
  const extraInput = $("#extraPayment");
  let extraTimer = null;
  extraInput.addEventListener("input", () => {
    clearTimeout(extraTimer);
    extraTimer = setTimeout(() => {
      state.settings.extraPayment = Math.max(0, Number(extraInput.value) || 0);
      persist();
      render();
    }, 250);
  });

  /* ---------- Валюта ---------- */
  const currencySel = $("#currencySel");
  currencySel.addEventListener("change", () => {
    state.settings.currency = currencySel.value;
    persist();
    render();
  });

  /* ---------- Модалка долга ---------- */
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
    setTimeout(() => form.elements.name.focus(), 30);
  }
  function closeModal() { modal.hidden = true; }

  $("#addDebtBtn").addEventListener("click", () => openDebtModal(null));
  $("#modalClose").addEventListener("click", closeModal);
  $("#debtCancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

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
      state.debts.push({
        id: Storage.makeId(),
        name, balance, apr, minPayment,
        priority: state.debts.length,
        createdAt: Date.now(),
      });
    }
    persist();
    closeModal();
    render();
  });

  /* ---------- Список долгов ---------- */
  const debtList = $("#debtList");
  const debtEmpty = $("#debtsEmpty");
  const debtCount = $("#debtCount");

  function renderDebts() {
    debtList.innerHTML = "";
    debtCount.textContent = String(state.debts.length);
    if (state.debts.length === 0) {
      debtList.hidden = true;
      debtEmpty.hidden = false;
      return;
    }
    debtEmpty.hidden = true;
    debtList.hidden = false;

    for (const d of state.debts) {
      const li = document.createElement("li");
      li.className = "debt-card";
      li.dataset.id = d.id;
      li.innerHTML = `
        <div class="debt-left">
          <div class="debt-name"></div>
          <div class="debt-meta">
            <span class="num">${d.apr}%</span> · мин. <span class="num">${money(d.minPayment)}</span>
          </div>
        </div>
        <div class="debt-right">
          <div class="debt-balance num">${money(d.balance)}</div>
          <button class="debt-del" type="button" aria-label="Удалить долг">×</button>
        </div>
      `;
      li.querySelector(".debt-name").textContent = d.name;
      
      // Открываем детализацию при клике на карточку
      li.addEventListener("click", (e) => {
        if (e.target.closest(".debt-del")) return;
        openDetailsModal(d);
      });
      
      li.querySelector(".debt-del").addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить долг «${d.name}»?`)) return;
        state.debts = state.debts.filter(x => x.id !== d.id);
        state.debts.forEach((x, i) => { x.priority = i; });
        persist();
        render();
      });
      debtList.appendChild(li);
    }
  }

  /* ---------- Сводка ---------- */
  function renderSummary() {
    const total = state.debts.reduce((s, d) => s + (Number(d.balance) || 0), 0);
    const minSum = state.debts.reduce((s, d) => s + (Number(d.minPayment) || 0), 0);
    const weighted = total > 0
      ? state.debts.reduce((s, d) => s + (Number(d.apr) || 0) * (Number(d.balance) || 0), 0) / total
      : 0;
    $("#sumTotal").textContent = money(total);
    $("#sumMin").textContent = money(minSum);
    $("#sumRate").textContent = (Math.round(weighted * 10) / 10) + "%";
  }

  /* ---------- Результат ---------- */
  function renderResult() {
    const result = Engine.simulate(state.debts, {
      strategy: state.settings.strategy,
      extraPayment: state.settings.extraPayment,
    });
    lastResult = result;

    const freedomDate = $("#freedomDate");
    const freedomMonths = $("#freedomMonths");
    const totalInterest = $("#totalInterest");
    const totalPaid = $("#totalPaid");
    const chartEmpty = $("#chartEmpty");
    const chart = $("#chart");
    const comparisonChart = $("#comparisonChart");

    if (state.debts.length === 0) {
      freedomDate.textContent = "—";
      freedomMonths.textContent = "0 месяцев";
      totalInterest.textContent = money(0);
      totalPaid.textContent = money(0);
      chartEmpty.hidden = false;
      chart.style.display = "none";
      comparisonChart.style.display = "none";
      $("#tips").innerHTML = '<li class="tip tip-mute">Добавь долги — здесь появятся расчётные подсказки.</li>';
      $("#comparisonBox").hidden = true;
      return;
    }

    if (result.unpaid.length > 0) {
      freedomDate.textContent = "не закрывается";
      freedomMonths.textContent = `${result.months}+ мес.`;
    } else {
      freedomDate.textContent = Engine.formatDate(result.freedomDate);
      freedomMonths.textContent = `${result.months} ${Engine.pluralMonths(result.months)}`;
    }
    totalInterest.textContent = money(result.totalInterest);
    totalPaid.textContent = money(result.totalPaid);

    // График
    if (result.schedule.length > 1) {
      chartEmpty.hidden = true;
      chart.style.display = "block";
      drawChart(result.schedule, chart);
    } else {
      chartEmpty.hidden = false;
      chart.style.display = "none";
    }

    // Советы
    const tips = Engine.buildRecommendations(state.debts, result, {
      currency: state.settings.currency,
      strategy: state.settings.strategy,
      extraPayment: state.settings.extraPayment,
    });
    const ul = $("#tips");
    ul.innerHTML = "";
    for (const t of tips) {
      const li = document.createElement("li");
      li.className = `tip tip-${t.type}`;
      li.textContent = t.text;
      ul.appendChild(li);
    }

    // Сравнение и второй график
    renderComparison();
    if (result.schedule.length > 1) {
      const av = Engine.simulate(state.debts, { strategy: "avalanche", extraPayment: state.settings.extraPayment });
      const sb = Engine.simulate(state.debts, { strategy: "snowball", extraPayment: state.settings.extraPayment });
      comparisonChart.style.display = "block";
      drawComparisonChart(av.schedule, sb.schedule, comparisonChart);
    }
  }

  function renderComparison() {
    const box = $("#comparisonBox");
    if (!box) return;
    if (state.debts.length === 0) { box.hidden = true; return; }
    box.hidden = false;

    const av = Engine.simulate(state.debts, { strategy: "avalanche", extraPayment: state.settings.extraPayment });
    const sb = Engine.simulate(state.debts, { strategy: "snowball", extraPayment: state.settings.extraPayment });

    const fmtTime = (res) => res.unpaid.length > 0 ? "50+ лет" : `${res.months} мес.`;
    $("#cmpAvalancheTime").textContent = fmtTime(av);
    $("#cmpAvalancheInterest").textContent = `Переплата: ${money(av.totalInterest)}`;
    $("#cmpSnowballTime").textContent = fmtTime(sb);
    $("#cmpSnowballInterest").textContent = `Переплата: ${money(sb.totalInterest)}`;
  }

  /* ---------- Стратегия — советы и стрелочки ---------- */
  function renderStrategyScreen() {
    const empty = $("#strategyEmpty");
    const tips = $("#strategyTips");
    if (state.debts.length === 0) {
      empty.hidden = false;
      tips.innerHTML = "";
      return;
    }
    empty.hidden = true;
    const order = Engine.orderDebts(state.debts, state.settings.strategy);
    tips.innerHTML = "";
    
    order.forEach((d, i) => {
      const li = document.createElement("li");
      li.className = "tip";
      
      const arrows = state.settings.strategy === "custom" ? `
        <div class="order-arrows">
          <button class="arrow-btn" data-id="${d.id}" data-dir="up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="arrow-btn" data-id="${d.id}" data-dir="down" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      ` : '';

      li.innerHTML = `<div style="display:flex; align-items:center; gap:12px;">
        <span class="num" style="color:var(--accent); width:20px;">${i + 1}.</span> 
        <span class="order-name" style="flex:1;"></span>
        ${arrows}
      </div>`;
      
      li.querySelector(".order-name").textContent = d.name;
      
      if (arrows) {
        li.querySelectorAll('.arrow-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const dir = e.target.dataset.dir;
            const idx = state.debts.findIndex(x => x.id === id);
            if (dir === 'up' && idx > 0) {
              [state.debts[idx - 1], state.debts[idx]] = [state.debts[idx], state.debts[idx - 1]];
            } else if (dir === 'down' && idx < state.debts.length - 1) {
              [state.debts[idx + 1], state.debts[idx]] = [state.debts[idx], state.debts[idx + 1]];
            }
            state.debts.forEach((x, i) => { x.priority = i; });
            persist();
            render();
          });
        });
      }
      tips.appendChild(li);
    });
  }

  /* ---------- Модалка детализации ---------- */
  const detailsModal = $("#detailsModal");
  const detailsTitle = $("#detailsTitle");
  const detailsBody = $("#detailsBody");

  function closeDetailsModal() {
    detailsModal.hidden = true;
    currentDetailDebt = null;
  }

  function openDetailsModal(debt) {
    if (!lastResult || !lastResult.schedule) return;
    currentDetailDebt = debt;
    detailsTitle.textContent = debt.name;

    detailsBody.innerHTML = "";
    lastResult.schedule.forEach(monthRow => {
      const debtData = monthRow.debts.find(x => x.id === debt.id);
      if (debtData && (debtData.payment > 0 || debtData.remaining > 0)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${monthRow.month}</td>
          <td class="num">${money(debtData.payment)}</td>
          <td class="num" style="color:var(--danger)">${money(debtData.interest)}</td>
          <td class="num" style="color:var(--success)">${money(debtData.principal)}</td>
          <td class="num">${money(debtData.remaining)}</td>
        `;
        detailsBody.appendChild(tr);
      }
    });

    detailsModal.hidden = false;
  }

  $("#detailsClose").addEventListener("click", closeDetailsModal);
  detailsModal.addEventListener("click", (e) => { if (e.target === detailsModal) closeDetailsModal(); });
  $("#detailsEditBtn").addEventListener("click", () => {
    if (currentDetailDebt) {
      closeDetailsModal();
      openDebtModal(currentDetailDebt);
    }
  });

  /* ---------- Графики ---------- */
  function drawChart(schedule, canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(280, rect.width || 600);
    const H = 220;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#d9b46a";
    const line = getComputedStyle(root).getPropertyValue("--line").trim() || "#26262f";

    const pad = { l: 8, r: 8, t: 16, b: 22 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const maxVal = schedule[0].totalRemaining || 1;

    const px = (i) => pad.l + (i / Math.max(1, schedule.length - 1)) * cw;
    const py = (v) => pad.t + ch - (v / maxVal) * ch;

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) {
      const y = pad.t + (ch / 3) * g;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    }

    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grad.addColorStop(0, accent + "55");
    grad.addColorStop(1, accent + "00");
    ctx.beginPath();
    ctx.moveTo(px(0), H - pad.b);
    schedule.forEach((m, i) => ctx.lineTo(px(i), py(m.totalRemaining)));
    ctx.lineTo(px(schedule.length - 1), H - pad.b);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    schedule.forEach((m, i) => {
      const x = px(i), y = py(m.totalRemaining);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function drawComparisonChart(avSchedule, sbSchedule, canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(280, rect.width || 600);
    const H = 220;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#d9b46a";
    const success = getComputedStyle(root).getPropertyValue("--success").trim() || "#5bd49a";
    const line = getComputedStyle(root).getPropertyValue("--line").trim() || "#26262f";

    const pad = { l: 8, r: 8, t: 16, b: 22 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;

    const maxVal = Math.max(
      avSchedule.length > 0 ? avSchedule[0].totalRemaining : 0,
      sbSchedule.length > 0 ? sbSchedule[0].totalRemaining : 0
    ) || 1;
    const maxMonths = Math.max(avSchedule.length, sbSchedule.length);

    const px = (i) => pad.l + (i / Math.max(1, maxMonths - 1)) * cw;
    const py = (v) => pad.t + ch - (v / maxVal) * ch;

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) {
      const y = pad.t + (ch / 3) * g;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    }

    ctx.beginPath();
    avSchedule.forEach((m, i) => {
      const x = px(i), y = py(m.totalRemaining);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    sbSchedule.forEach((m, i) => {
      const x = px(i), y = py(m.totalRemaining);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = success;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- Кредитные калькуляторы ---------- */
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
    const sum = Number($("#mortSum").value);
    const rate = Number($("#mortRate").value) / 100 / 12;
    const years = Number($("#mortYears").value);
    if (!sum || !rate || !years) return showToast("Заполните все поля", "error");
    const months = years * 12;
    const monthly = sum * (rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
    const total = monthly * months;
    $("#mortMonthly").textContent = money(monthly);
    $("#mortOverpay").textContent = money(total - sum);
    $("#mortResult").hidden = false;
  });

  $("#calcAutoBtn")?.addEventListener("click", () => {
    const sum = Number($("#autoSum").value);
    const rate = Number($("#autoRate").value) / 100 / 12;
    const years = Number($("#autoYears").value);
    if (!sum || !rate || !years) return showToast("Заполните все поля", "error");
    const months = years * 12;
    const monthly = sum * (rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
    const total = monthly * months;
    $("#autoMonthly").textContent = money(monthly);
    $("#autoOverpay").textContent = money(total - sum);
    $("#autoResult").hidden = false;
  });

  $("#calcEarlyBtn")?.addEventListener("click", () => {
    const balance = Number($("#earlyBalance").value);
    const rate = Number($("#earlyRate").value) / 100 / 12;
    const payment = Number($("#earlyPayment").value);
    const extra = Number($("#earlyExtra").value);
    if (!balance || !rate || !payment || !extra) return showToast("Заполните все поля", "error");
    const monthlyInterest = balance * rate;
    const principalPart = payment - monthlyInterest;
    if (principalPart <= 0) return showToast("Платёж слишком мал", "error");
    const monthsWithout = Math.log(payment / (payment - balance * rate)) / Math.log(1 + rate);
    const newBalance = balance - extra;
    const monthsWith = Math.log(payment / (payment - newBalance * rate)) / Math.log(1 + rate);
    const savedMonths = Math.max(0, Math.round(monthsWithout - monthsWith));
    const savedInterest = (monthsWithout - monthsWith) * payment - extra;
    $("#earlyNewTerm").textContent = `-${savedMonths} мес.`;
    $("#earlySave").textContent = money(Math.max(0, savedInterest));
    $("#earlyResult").hidden = false;
  });

  /* ---------- Аналитика MOEX ---------- */
  const TICKERS = [
    "SBER", "GAZP", "LKOH", "GMKN", "ROSN", "NVTK", "TATN", "SNGS", "SNGSP", "PLZL",
    "YNDX", "TCSG", "VTBR", "ALRS", "MTLR", "CHMF", "NLMK", "MAGN", "MOEX", "POLY",
    "IRAO", "HYDR", "FEES", "RSTI", "TRNFP", "AFLT", "UPRO", "MSNG", "CBOM", "AFKS",
    "PIKK", "LSRG", "RTKM", "MGTS", "KMAZ", "SVAV", "BLNG", "SGZH", "VKCO", "OZON",
    "SU26238RMFS4", "SU26243RMFS4", "SU26244RMFS4", "SU26245RMFS4", "SU26246RMFS4",
    "SU26247RMFS4", "SU26248RMFS4", "SU26249RMFS4", "SU26250RMFS4", "SU26251RMFS4"
  ];

  async function fetchQuotes() {
    const url = "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=marketdata";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    
    const columns = json.marketdata.columns;
    const data = json.marketdata.data;
    const colIdx = {
      SECID: columns.indexOf("SECID"),
      LAST: columns.indexOf("LAST"),
      LASTCHANGEPRCNT: columns.indexOf("LASTCHANGEPRCNT"),
      OPEN: columns.indexOf("OPEN"),
      HIGH: columns.indexOf("HIGH"),
      LOW: columns.indexOf("LOW"),
      VALTODAY: columns.indexOf("VALTODAY")
    };

    const quotes = [];
    for (const row of data) {
      const ticker = row[colIdx.SECID];
      if (!TICKERS.includes(ticker)) continue;
      const last = row[colIdx.LAST] || row[colIdx.OPEN] || 0;
      if (last === 0) continue;
      quotes.push({
        ticker: ticker,
        price: last,
        changePercent: row[colIdx.LASTCHANGEPRCNT] || 0,
        high: row[colIdx.HIGH] || 0,
        low: row[colIdx.LOW] || 0
      });
    }
    return quotes;
  }

  function analyzeQuote(quote) {
    let score = 50;
    let reasons = [];
    if (quote.changePercent > 0) { score += 10; reasons.push("Положительная дневная динамика"); }
    else { score -= 5; reasons.push("Отрицательная дневная динамика"); }
    if (quote.low > 0 && quote.high > 0) {
      const mid = (quote.high + quote.low) / 2;
      if (quote.price > mid) { score += 15; reasons.push("Цена выше середины дневного диапазона"); }
      else { score -= 10; reasons.push("Цена ниже середины дневного диапазона"); }
    }
    score = Math.max(0, Math.min(100, score));
    let recommendation = "Держать / Наблюдать";
    let horizon = "Среднесрочно";
    if (score >= 70) { recommendation = "Покупать"; horizon = "Долгосрок"; }
    else if (score <= 30) { recommendation = "Избегать / Продавать"; horizon = "Краткосрок"; }
    return { score: Math.round(score), recommendation, horizon, reasons };
  }

  const runAnalyticsBtn = $("#runAnalyticsBtn");
  const analyticsList = $("#analyticsList");
  const analyticsEmpty = $("#analyticsEmpty");
  const analyticsCount = $("#analyticsCount");

  if (runAnalyticsBtn) {
    runAnalyticsBtn.addEventListener("click", async () => {
      runAnalyticsBtn.disabled = true;
      runAnalyticsBtn.innerHTML = '<span>⏳</span> Анализируем...';
      analyticsEmpty.hidden = true;
      analyticsList.hidden = false;
      analyticsList.innerHTML = '<li style="text-align:center; padding:20px; color:var(--text-mute)">Загрузка данных с MOEX...</li>';

      try {
        const quotes = await fetchQuotes();
        const results = quotes.map(q => ({ ...q, ...analyzeQuote(q) })).sort((a, b) => b.score - a.score);
        
        analyticsList.innerHTML = "";
        analyticsCount.textContent = String(results.length);

        results.forEach(item => {
          const li = document.createElement("li");
          li.className = "analytics-card";
          const changeClass = item.changePercent >= 0 ? "pos" : "neg";
          const changeSign = item.changePercent >= 0 ? "+" : "";
          const recClass = item.recommendation.includes("Покупать") ? "rec-buy" 
                         : item.recommendation.includes("Избегать") ? "rec-sell" 
                         : "rec-hold";

          li.innerHTML = `
            <div class="analytics-header">
              <span class="analytics-ticker">${item.ticker}</span>
              <span class="analytics-price">${item.price.toFixed(2)} ₽</span>
              <span class="analytics-change ${changeClass}">${changeSign}${item.changePercent.toFixed(2)}%</span>
            </div>
            <div class="analytics-score-bar">
              <div class="analytics-score-fill" style="width: ${item.score}%"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="analytics-rec ${recClass}">${item.recommendation}</span>
              <span style="font-size:12px; color:var(--text-mute);">${item.horizon}</span>
            </div>
            <div class="analytics-reasons">${item.reasons.join(" · ")}</div>
          `;
          analyticsList.appendChild(li);
        });
      } catch (err) {
        analyticsList.innerHTML = '<li style="text-align:center; padding:20px; color:var(--danger)">Не удалось загрузить данные.</li>';
        showToast("Ошибка загрузки аналитики", "error");
      } finally {
        runAnalyticsBtn.disabled = false;
        runAnalyticsBtn.innerHTML = '<span>⚡</span> Обновить анализ';
      }
    });
  }

  /* ---------- PWA: Установка ---------- */
  let deferredPrompt = null;
  const installBox = $("#installBox");
  const installBtn = $("#installBtn");

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBox) installBox.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') showToast("Просвет установлен!");
      deferredPrompt = null;
      installBox.hidden = true;
    });
  }

  window.addEventListener('appinstalled', () => {
    showToast("Приложение добавлено на экран!");
    if (installBox) installBox.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW reg failed', err));
    });
  }

  /* ---------- Импорт / экспорт / сброс ---------- */
  $("#exportBtn").addEventListener("click", () => Storage.exportJson(state));
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const next = await Storage.importFile(file);
      state = next;
      persist();
      syncInputs();
      render();
      showToast("Данные успешно загружены");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Сбросить все долги и настройки? Действие необратимо.")) return;
    state = Storage.reset();
    syncInputs();
    render();
    showToast("Все данные сброшены");
  });

  /* ---------- Синхронизация и Старт ---------- */
  function syncInputs() {
    extraInput.value = state.settings.extraPayment || "";
    currencySel.value = state.settings.currency;
    segBtns.forEach(b => b.classList.toggle("is-active", b.dataset.strategy === state.settings.strategy));
    hint.textContent = hints[state.settings.strategy] || "";
  }

  function render() {
    renderDebts();
    renderSummary();
    renderStrategyScreen();
    renderResult();
  }

  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#themeBtn2").addEventListener("click", toggleTheme);

  syncInputs();
  show("debts");
  render();

  let rzTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      if (lastResult && lastResult.schedule.length > 1) {
        drawChart(lastResult.schedule, $("#chart"));
        const av = Engine.simulate(state.debts, { strategy: "avalanche", extraPayment: state.settings.extraPayment });
        const sb = Engine.simulate(state.debts, { strategy: "snowball", extraPayment: state.settings.extraPayment });
        drawComparisonChart(av.schedule, sb.schedule, $("#comparisonChart"));
      }
    }, 150);
  });
})();
