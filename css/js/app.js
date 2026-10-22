(() => {
  "use strict";

  const root = document.documentElement;
  const THEME_KEY = "prosvet.theme";

  /* ---------- Theme ---------- */
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#f6f4ee" : "#0b0b0e");
    const icon = document.querySelector(".theme-icon");
    if (icon) icon.textContent = t === "light" ? "◑" : "◐";
    try { localStorage.setItem(THEME_KEY, t); } catch {}
  }

  function toggleTheme() {
    applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
  }

  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch {}
  applyTheme(saved === "light" ? "light" : "dark");

  document.getElementById("themeBtn")?.addEventListener("click", toggleTheme);
  document.getElementById("themeBtn2")?.addEventListener("click", toggleTheme);

  /* ---------- Tabs ---------- */
  const screens = document.querySelectorAll(".screen");
  const tabs = document.querySelectorAll(".tab");

  function show(name) {
    screens.forEach(s => s.classList.toggle("is-active", s.dataset.screen === name));
    tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab)));
  show("debts");

  /* ---------- Strategy segmented (visual only for now) ---------- */
  const segBtns = document.querySelectorAll("#strategySeg .seg");
  const hint = document.getElementById("strategyHint");
  const hints = {
    avalanche: "Лавина: сначала самый дорогой долг по ставке. Математически выгоднее всего.",
    snowball: "Снежный ком: сначала самый маленький долг. Больше закрытий — сильнее мотивация.",
    custom: "Свой порядок: расставишь приоритеты вручную в списке долгов.",
  };

  segBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      segBtns.forEach(b => b.classList.toggle("is-active", b === btn));
      if (hint) hint.textContent = hints[btn.dataset.strategy] || "";
    });
  });
})();
