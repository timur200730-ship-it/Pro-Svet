/* Просвет — UI, события, связка движка, хранилища и экранов. */
(function () {
  "use strict";

  const Engine = window.Engine;
  const Storage = window.Storage;
  const root = document.documentElement;

  /* ---------- Состояние ---------- */
  let state = Storage.load();
  let lastResult = null;
  let currentDetailDebt = null; // <-- ДОБАВИТЬ ВОТ ЭТУ СТРОКУ

  /* ---------- Утилиты ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const money = (v) => Engine.formatMoney(v, state.settings.currency);
  const num = (v) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));
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
  function persist() {
    Storage.save(state);
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
    custom: "Свой порядок: расставляешь приоритеты через список долгов.",
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
        name,
        balance,
        apr,
        minPayment,
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
        li.addEventListener("click", (e) => {
        if (e.target.closest(".debt-del")) return;
        openDetailsModal(d); // <-- СТАЛО ТАК (теперь открываем детали)
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

    if (state.debts.length === 0) {
      freedomDate.textContent = "—";
      freedomMonths.textContent = "0 месяцев";
      totalInterest.textContent = money(0);
      totalPaid.textContent = money(0);
      chartEmpty.hidden = false;
      chart.style.display = "none";
      $("#tips").innerHTML = '<li class="tip tip-mute">Добавь долги — здесь появятся расчётные подсказки.</li>';
      // ДОБАВИТЬ ВОТ ЭТУ СТРОКУ:
    renderComparison();
      return;
    }

    if (result.unpaid.length > 0) {
      freedomDate.textContent = "не закрывается";
      freedomMonths.textContent = `${result.months}+ мес. при текущих платежах`;
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
      chartEmpty.textContent = "Данных для графика мало.";
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
  }

  /* ---------- Стратегия — советы ---------- */
    // --- Сравнение стратегий ---
  function renderComparison() {
    const box = $("#comparisonBox");
    if (!box) return;

    if (state.debts.length === 0) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    const av = Engine.simulate(state.debts, { strategy: "avalanche", extraPayment: state.settings.extraPayment });
    const sb = Engine.simulate(state.debts, { strategy: "snowball", extraPayment: state.settings.extraPayment });

    const fmtTime = (res) => res.unpaid.length > 0 ? "50+ лет" : `${res.months} мес.`;
    
    $("#cmpAvalancheTime").textContent = fmtTime(av);
    $("#cmpAvalancheInterest").textContent = `Переплата: ${money(av.totalInterest)}`;
    
    $("#cmpSnowballTime").textContent = fmtTime(sb);
    $("#cmpSnowballInterest").textContent = `Переплата: ${money(sb.totalInterest)}`;
  }

  // --- Модалка детализации ---
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
    // Проходимся по графику и ищем платежи по этому долгу
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

  // Закрытие модалки деталей
  $("#detailsClose").addEventListener("click", closeDetailsModal);
  detailsModal.addEventListener("click", (e) => { if (e.target === detailsModal) closeDetailsModal(); });
  
  // Кнопка "Редактировать" внутри модалки деталей
  $("#detailsEditBtn").addEventListener("click", () => {
    if (currentDetailDebt) {
      closeDetailsModal();
      openDebtModal(currentDetailDebt);
    }
  });
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
      
      // Выводим стрелочки, если выбран "Свой порядок"
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
      
      // Обработчик стрелочек
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
            // Обновляем priority
            state.debts.forEach((x, i) => { x.priority = i; });
            persist();
            render();
          });
        });
      }
      
      tips.appendChild(li);
    });
  }

  /* ---------- Chart (canvas, без библиотек) ---------- */
  function drawChart(schedule, canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(280, rect.width || canvas.clientWidth || 600);
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

    // сетка
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) {
      const y = pad.t + (ch / 3) * g;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
    }

    // заливка
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

    // линия
    ctx.beginPath();
    schedule.forEach((m, i) => {
      const x = px(i), y = py(m.totalRemaining);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // подпись месяцев
    ctx.fillStyle = getComputedStyle(root).getPropertyValue("--text-mute").trim() || "#666672";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("старт", pad.l, H - 6);
    ctx.textAlign = "right";
    ctx.fillText(`${schedule.length} мес.`, W - pad.r, H - 6);
  }

  /* ---------- Полный ререндер ---------- */
  function render() {
    renderDebts();
    renderSummary();
    renderStrategyScreen();
    renderResult();
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
  });

  /* ---------- Синхронизация инпутов с состоянием ---------- */
  function syncInputs() {
    extraInput.value = state.settings.extraPayment || "";
    currencySel.value = state.settings.currency;
    segBtns.forEach(b => b.classList.toggle("is-active", b.dataset.strategy === state.settings.strategy));
    hint.textContent = hints[state.settings.strategy] || "";
  }

  /* ---------- Тема: обработчики ---------- */
  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#themeBtn2").addEventListener("click", toggleTheme);

  /* ---------- Старт ---------- */
  syncInputs();
  show("debts");
  render();

  // Перерисовка графика при ресайзе
  let rzTimer = null;
    // --- PWA: Установка Service Worker ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW reg failed', err));
    });
  }
  window.addEventListener("resize", () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      if (lastResult && lastResult.schedule.length > 1) {
        drawChart(lastResult.schedule, $("#chart"));
      }
    }, 150);
  });
})();
  // --- PWA: Перехват события установки ---
  let deferredPrompt = null;
  const installBox = $("#installBox");
  const installBtn = $("#installBtn");

  window.addEventListener('beforeinstallprompt', (e) => {
    // Предотвращаем автоматический показ мини-инфо-бара
    e.preventDefault();
    deferredPrompt = e;
    // Показываем нашу красивую кнопку в настройках
    if (installBox) installBox.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast("Просвет установлен!");
      }
      deferredPrompt = null;
      installBox.hidden = true;
    });
    window.addEventListener('appinstalled', () => {
    showToast("Приложение добавлено на экран!");
    if (installBox) installBox.hidden = true;
  });
  }
