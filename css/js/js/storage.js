/* Просвет — хранение. localStorage + экспорт/импорт JSON. */
(function (global) {
  "use strict";

  const KEY = "prosvet.v1";

  function defaults() {
    return {
      version: 1,
      debts: [],
      settings: {
        currency: "RUB",
        strategy: "avalanche",
        extraPayment: 0,
      },
    };
  }

  function normalize(raw) {
    const base = defaults();
    if (!raw || typeof raw !== "object") return base;
    const debts = Array.isArray(raw.debts)
      ? raw.debts
          .filter(d => d && typeof d === "object")
          .map((d, i) => ({
            id: String(d.id || makeId()),
            name: String(d.name || "Долг").slice(0, 60),
            balance: clampNum(d.balance),
            apr: clampNum(d.apr),
            minPayment: clampNum(d.minPayment),
            priority: Number.isFinite(Number(d.priority)) ? Number(d.priority) : i,
            createdAt: Number(d.createdAt) || Date.now(),
          }))
      : [];
    return {
      version: 1,
      debts,
      settings: {
        currency: ["RUB", "USD", "EUR", "KZT"].includes(raw.settings?.currency)
          ? raw.settings.currency
          : base.settings.currency,
        strategy: ["avalanche", "snowball", "custom"].includes(raw.settings?.strategy)
          ? raw.settings.strategy
          : base.settings.strategy,
        extraPayment: clampNum(raw.settings?.extraPayment),
      },
    };
  }

  function clampNum(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  }

  function makeId() {
    return "d_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn("storage load failed", e);
      return defaults();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn("storage save failed", e);
      return false;
    }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch {}
    return defaults();
  }

  function exportJson(state) {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `prosvet-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Файл не выбран"));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed !== "object") {
            return reject(new Error("Неверный формат файла"));
          }
          if (!Array.isArray(parsed.debts)) {
            return reject(new Error("В файле нет списка долгов"));
          }
          resolve(normalize(parsed));
        } catch {
          reject(new Error("Не удалось прочитать JSON"));
        }
      };
      reader.onerror = () => reject(new Error("Ошибка чтения файла"));
      reader.readAsText(file);
    });
  }

  global.Storage = { load, save, reset, exportJson, importFile, defaults, makeId };
})(window);
