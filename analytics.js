(function (global) {
  "use strict";

  // Разделяем тикеры на акции/активы и ОФЗ для корректного запроса с разных досок MOEX
  const STOCKS_TICKERS = [
    "SBER", "GAZP", "LKOH", "GMKN", "ROSN", "NVTK", "TATN", "SNGS", "SNGSP", "PLZL",
    "YNDX", "TCSG", "VTBR", "ALRS", "MTLR", "CHMF", "NLMK", "MAGN", "MOEX", "POLY",
    "IRAO", "HYDR", "FEES", "RSTI", "TRNFP", "AFLT", "UPRO", "MSNG", "CBOM", "AFKS",
    "PIKK", "LSRG", "RTKM", "MGTS", "KMAZ", "SVAV", "BLNG", "SGZH", "VKCO", "OZON"
  ];

  const OFZ_TICKERS = [
    "SU26238RMFS4", "SU26243RMFS4", "SU26244RMFS4", "SU26245RMFS4", "SU26246RMFS4",
    "SU26247RMFS4", "SU26248RMFS4", "SU26249RMFS4", "SU26250RMFS4", "SU26251RMFS4"
  ];

  const ALL_TICKERS = [...STOCKS_TICKERS, ...OFZ_TICKERS];

  // Кэш для предотвращения частых запросов к API биржи (время жизни: 60 секунд)
  let cache = {
    data: null,
    timestamp: 0
  };
  const CACHE_TTL = 60 * 1000;

  /**
   * Универсальный парсер ответов MOEX ISS
   */
  function parseMoexJson(json) {
    if (!json || !json.marketdata || !json.marketdata.columns || !json.marketdata.data) {
      return [];
    }
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

    const results = [];
    for (const row of data) {
      const ticker = row[colIdx.SECID];
      const last = row[colIdx.LAST] || row[colIdx.OPEN] || 0;
      if (last === 0) continue;

      results.push({
        ticker: ticker,
        price: last,
        changePercent: row[colIdx.LASTCHANGEPRCNT] || 0,
        open: row[colIdx.OPEN] || 0,
        high: row[colIdx.HIGH] || 0,
        low: row[colIdx.LOW] || 0,
        volume: row[colIdx.VALTODAY] || 0,
        isBond: OFZ_TICKERS.includes(ticker)
      });
    }
    return results;
  }

  /**
   * Загрузка котировок с учетом разделения на акции (TQBR) и ОФЗ (TQOB)
   */
  async function fetchQuotes() {
    const now = Date.now();
    if (cache.data && (now - cache.timestamp < CACHE_TTL)) {
      return cache.data;
    }

    const urlStocks = "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=marketdata";
    const urlBonds = "https://iss.moex.com/iss/engines/stock/markets/bonds/boards/TQOB/securities.json?iss.meta=off&iss.only=marketdata";

    try {
      const [resStocks, resBonds] = await Promise.all([
        fetch(urlStocks).catch(() => null),
        fetch(urlBonds).catch(() => null)
      ]);

      let quotes = [];

      if (resStocks && resStocks.ok) {
        const jsonStocks = await resStocks.json();
        quotes = quotes.concat(parseMoexJson(jsonStocks));
      }

      if (resBonds && resBonds.ok) {
        const jsonBonds = await resBonds.json();
        quotes = quotes.concat(parseMoexJson(jsonBonds));
      }

      // Фильтруем и оставляем только те, что есть в нашем глобальном списке
      const filteredQuotes = quotes.filter(q => ALL_TICKERS.includes(q.ticker));

      cache.data = filteredQuotes;
      cache.timestamp = now;

      return filteredQuotes;
    } catch (err) {
      console.error("Ошибка загрузки котировок с MOEX ISS:", err);
      // Если есть старый кэш, отдаем его при ошибке сети
      if (cache.data) return cache.data;
      throw err;
    }
  }

  /**
   * Профессиональный алгоритм скоринга и аналитики
   */
  function analyzeQuote(quote) {
    let score = 50;
    let reasons = [];

    // 1. Оценка для ОФЗ (Государственные облигации)
    if (quote.isBond) {
      score = 65; // Базово ОФЗ надежнее
      reasons.push("Государственная облигация (ОФЗ)");
      
      if (quote.changePercent >= 0) {
        score += 10;
        reasons.push("Стабильная или растущая котировка");
      } else {
        score -= 5;
        reasons.push("Умеренная коррекция тела облигации");
      }

      return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        recommendation: score >= 70 ? "Покупать (Защита)" : "Держать",
        horizon: "Долгосрок",
        reasons
      };
    }

    // 2. Оценка для Акций
    // Учет дневной динамики
    if (quote.changePercent > 1.5) {
      score += 15;
      reasons.push("Сильный восходящий импульс дня");
    } else if (quote.changePercent > 0) {
      score += 8;
      reasons.push("Умеренный рост котировок");
    } else if (quote.changePercent < -1.5) {
      score -= 15;
      reasons.push("Заметная просадка в моменте");
    } else {
      score -= 5;
      reasons.push("Негативная краткосрочная динамика");
    }

    // Позиция в дневном диапазоне (High / Low)
    if (quote.high > quote.low) {
      const rangePosition = (quote.price - quote.low) / (quote.high - quote.low);
      if (rangePosition >= 0.7) {
        score += 15;
        reasons.push("Закрытие у максимумов дня (покупатели активны)");
      } else if (rangePosition <= 0.3) {
        score -= 10;
        reasons.push("Давление продавцов (цена у минимумов дня)");
      }
    }

    // Фильтр ликвидности (по обороту в рублях VALTODAY)
    // Если оборот больше 100 млн рублей — высокая ликвидность
    if (quote.volume > 100_000_000) {
      score += 5;
      reasons.push("Высокая ликвидность актива");
    } else if (quote.volume < 5_000_000 && quote.volume > 0) {
      score -= 10;
      reasons.push("Низкий объем торгов (риск неликвидности)");
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let recommendation = "Держать / Наблюдать";
    let horizon = "Среднесрочно";

    if (score >= 72) {
      recommendation = "Покупать";
      horizon = "Среднесрок / Долгосрок";
    } else if (score <= 35) {
      recommendation = "Избегать / Снижать риск";
      horizon = "Краткосрок";
    }

    return {
      score,
      recommendation,
      horizon,
      reasons
    };
  }

  /**
   * Получить полный и отсортированный анализ по всем бумагам
   */
  async function getFullAnalysis() {
    const quotes = await fetchQuotes();
    const analyzed = quotes.map(q => {
      const analysis = analyzeQuote(q);
      return { ...q, ...analysis };
    });

    // Сортировка: сначала по силе сигнала (score по убыванию), затем по ликвидности
    return analyzed.sort((a, b) => b.score - a.score || b.volume - a.volume);
  }

  // Экспорт в глобальную область видимости
  global.MOEXAnalytics = {
    getFullAnalysis,
    fetchQuotes,
    TICKERS: ALL_TICKERS
  };

})(window);
