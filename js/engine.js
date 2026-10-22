/* Просвет — расчётный движок.
   Чистые функции без DOM. Округление: до 2 знаков на границе, внутри — полная точность. */
(function (global) {
  "use strict";

  const MAX_MONTHS = 600; // 50 лет — защита от бесконечного цикла

  function round2(n) { return Math.round(n * 100) / 100; }

  function monthlyRate(apr) { return (apr || 0) / 100 / 12; }

  function orderDebts(debts, strategy) {
    const copy = debts.slice();
    if (strategy === "avalanche") {
      copy.sort((a, b) => (b.apr - a.apr) || (a.balance - b.balance));
    } else if (strategy === "snowball") {
      copy.sort((a, b) => (a.balance - b.balance) || (b.apr - a.apr));
    } else {
      // custom: по полю priority, затем по порядку добавления
      copy.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }
    return copy;
  }

  /**
   * Основная симуляция.
   * @returns {{
   *   months: number,
   *   schedule: Array,
   *   totalInterest: number,
   *   totalPaid: number,
   *   payoffOrder: Array,
   *   unpaid: Array,
   *   freedomDate: Date,
   *   monthlyPayment: number,
   *   firstMonthInterest: number
   * }}
   */
  function simulate(debts, options) {
    const opts = options || {};
    const strategy = opts.strategy || "avalanche";
    const extraPayment = Math.max(0, Number(opts.extraPayment) || 0);
    const startDate = opts.startDate ? new Date(opts.startDate) : new Date();

    const working = debts
      .filter(d => Number(d.balance) > 0.005)
      .map((d, i) => ({
        id: d.id,
        name: d.name,
        apr: Math.max(0, Number(d.apr) || 0),
        minPayment: Math.max(0, Number(d.minPayment) || 0),
        balance: Math.max(0, Number(d.balance) || 0),
        originalBalance: Math.max(0, Number(d.balance) || 0),
        priority: Number(d.priority) || i,
        paidOffMonth: null,
      }));

    if (working.length === 0) {
      return {
        months: 0,
        schedule: [],
        totalInterest: 0,
        totalPaid: 0,
        payoffOrder: [],
        unpaid: [],
        freedomDate: startDate,
        monthlyPayment: 0,
        firstMonthInterest: 0,
      };
    }

    const order = orderDebts(working, strategy);
    const byId = new Map(working.map(d => [d.id, d]));

    let month = 0;
    let totalInterest = 0;
    let totalPaid = 0;
    let firstMonthInterest = 0;
    const schedule = [];

    while (month < MAX_MONTHS) {
      const active = working.filter(d => d.balance > 0.005);
      if (active.length === 0) break;
      month += 1;

      const monthRow = {
        month,
        debts: [],
        totalRemaining: 0,
        totalInterest: 0,
        totalPaid: 0,
      };

      // 1. Начисляем проценты
      for (const d of active) {
        d.interestAccrued = d.balance * monthlyRate(d.apr);
      }

      // 2. Минимальные платежи
      for (const d of active) {
        const owed = d.balance + d.interestAccrued;
        const pay = Math.min(d.minPayment, owed);
        d.balance = owed - pay;
        d.paymentThisMonth = pay;
        totalPaid += pay;
        totalInterest += d.interestAccrued;
        monthRow.totalInterest += d.interestAccrued;
        monthRow.totalPaid += pay;
        if (month === 1) firstMonthInterest += d.interestAccrued;
      }

      // 3. Дополнительный платёж по приоритету
      let free = extraPayment;
      if (free > 0) {
        for (const src of order) {
          if (free <= 0.005) break;
          const d = byId.get(src.id);
          if (!d || d.balance <= 0.005) continue;
          const apply = Math.min(free, d.balance);
          d.balance -= apply;
          d.paymentThisMonth += apply;
          totalPaid += apply;
          monthRow.totalPaid += apply;
          free -= apply;
        }
      }

      // 4. Фиксируем месяц
      for (const d of active) {
        if (d.balance <= 0.005) {
          d.balance = 0;
          if (d.paidOffMonth === null) d.paidOffMonth = month;
        }
        monthRow.debts.push({
          id: d.id,
          name: d.name,
          payment: round2(d.paymentThisMonth),
          interest: round2(d.interestAccrued),
          principal: round2(d.paymentThisMonth - d.interestAccrued),
          remaining: round2(d.balance),
        });
        monthRow.totalRemaining += d.balance;
      }
      monthRow.totalRemaining = round2(monthRow.totalRemaining);
      monthRow.totalInterest = round2(monthRow.totalInterest);
      monthRow.totalPaid = round2(monthRow.totalPaid);
      schedule.push(monthRow);
    }

    const unpaid = working.filter(d => d.balance > 0.005).map(d => ({
      id: d.id,
      name: d.name,
      balance: round2(d.balance),
    }));

    const payoffOrder = working
      .filter(d => d.paidOffMonth !== null)
      .sort((a, b) => a.paidOffMonth - b.paidOffMonth)
      .map(d => ({ id: d.id, name: d.name, month: d.paidOffMonth }));

    const freedomDate = addMonths(startDate, month);
    const monthlyPayment =
      working.reduce((s, d) => s + d.minPayment, 0) + extraPayment;

    return {
      months: month,
      schedule,
      totalInterest: round2(totalInterest),
      totalPaid: round2(totalPaid),
      payoffOrder,
      unpaid,
      freedomDate,
      monthlyPayment: round2(monthlyPayment),
      firstMonthInterest: round2(firstMonthInterest),
    };
  }

  function addMonths(date, n) {
    const d = new Date(date);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, maxDay));
    return d;
  }

  /**
   * Рекомендации. Учитывают текущую стратегию, ставки и «что если +X».
   */
  function buildRecommendations(debts, result, options) {
    const tips = [];
    const opts = options || {};
    const currency = opts.currency || "RUB";
    const fmt = (v) => formatMoney(v, currency);

    if (!debts || debts.length === 0) {
      return [{ type: "mute", text: "Добавь долги — здесь появятся расчётные подсказки." }];
    }

    // 1. Приоритетный долг
    if (opts.strategy === "avalanche") {
      const top = [...debts].sort((a, b) => b.apr - a.apr)[0];
      if (top && top.apr > 0) {
        tips.push({
          type: "good",
          text: `Начни с «${top.name}» — самая высокая ставка (${top.apr}% годовых). Это даст максимальную экономию на процентах.`,
        });
      }
    } else if (opts.strategy === "snowball") {
      const top = [...debts].sort((a, b) => a.balance - b.balance)[0];
      if (top) {
        tips.push({
          type: "good",
          text: `Начни с «${top.name}» — самый маленький остаток (${fmt(top.balance)}). Закроешь его быстрее всех — это даст мотивацию.`,
        });
      }
    }

    // 2. Проверка отрицательной амортизации
    for (const d of debts) {
      const mInterest = (Number(d.balance) || 0) * monthlyRate(Number(d.apr) || 0);
      if (mInterest > 0 && Number(d.minPayment) > 0 && Number(d.minPayment) < mInterest) {
        tips.push({
          type: "warn",
          text: `Минимальный платёж по «${d.name}» (${fmt(d.minPayment)}) меньше начисляемых процентов (${fmt(mInterest)}). Долг не уменьшается.`,
        });
      }
    }

    // 3. Что если +X
    if (!result.unpaid || result.unpaid.length === 0) {
      const deltas = [1000, 5000];
      for (const delta of deltas) {
        const alt = simulate(debts, {
          strategy: opts.strategy,
          extraPayment: (Number(opts.extraPayment) || 0) + delta,
        });
        if (alt.unpaid.length > 0) continue;
        const monthsSaved = result.months - alt.months;
        const interestSaved = result.totalInterest - alt.totalInterest;
        if (monthsSaved > 0 || interestSaved > 0.5) {
          const bits = [];
          if (monthsSaved > 0) bits.push(`на ${monthsSaved} ${pluralMonths(monthsSaved)}`);
          if (interestSaved > 0.5) bits.push(`сэкономишь ${fmt(interestSaved)} на процентах`);
          if (bits.length) {
            tips.push({
              type: "good",
              text: `Если добавлять +${fmt(delta)} в месяц — закроешь ${bits.join(" и ")}.`,
            });
          }
        }
      }
    }

    // 4. Если не закрывается за разумное время
    if (result.unpaid && result.unpaid.length > 0) {
      tips.push({
        type: "warn",
        text: "При текущих платежах долги не закрываются за 50 лет. Увеличь минимальные или дополнительные платежи.",
      });
    }

    // 5. Позитивное закрытие (если долги закрываются быстро)
    if (result.unpaid.length === 0 && result.months > 0) {
      if (result.months <= 12) {
        tips.push({
          type: "good",
          text: `Долги закрываются меньше чем за год — ${result.months} ${pluralMonths(result.months)}. Отличный темп.`,
        });
      }
    }

    return tips;
  }

  function formatMoney(value, currency) {
    const v = Number(value) || 0;
    const symbols = { RUB: "₽", USD: "$", EUR: "€", KZT: "₸" };
    const sym = symbols[currency] || "₽";
    const formatted = new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
      minimumFractionDigits: 0,
    }).format(v);
    return formatted + " " + sym;
  }

  function pluralMonths(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "месяц";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "месяца";
    return "месяцев";
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  global.Engine = {
    simulate,
    buildRecommendations,
    orderDebts,
    formatMoney,
    formatDate,
    pluralMonths,
    addMonths,
  };
})(window);
