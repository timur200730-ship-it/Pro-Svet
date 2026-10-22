(function (global) {
  "use strict";

  // Список 50 наиболее ликвидных российских бумаг (акции + ОФЗ)
  const TICKERS = [
    "SBER", "GAZP", "LKOH", "GMKN", "ROSN", "NVTK", "TATN", "SNGS", "SNGSP", "PLZL",
    "YNDX", "TCSG", "VTBR", "ALRS", "MTLR", "CHMF", "NLMK", "MAGN", "MOEX", "POLY",
    "IRAO", "HYDR", "FEES", "RSTI", "TRNFP", "AFLT", "UPRO", "MSNG", "CBOM", "AFKS",
    "PIKK", "LSRG", "RTKM", "MGTS", "KMAZ", "SVAV", "BLNG", "SGZH", "VKCO", "OZON",
    "SU26238RMFS4", "SU26243RMFS4", "SU26244RMFS4", "SU26245RMFS4", "SU26246RMFS4",
    "SU26247RMFS4", "SU26248RMFS4", "SU26249RMFS4", "SU26250RMFS4", "SU26251RMFS4"
  ];

  /**
   * Получить текущие котировки для списка тикеров.
   * @returns {Promise<Array>}
   */
  async function fetchQuotes() {
    // Запрашиваем данные для всех акций с доски TQBR
    const url = "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=marketdata";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const json = await res.json();
      
      const columns = json.marketdata.columns;
      const data = json.marketdata.data;
      
      // Индексы нужных нам колонок
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
        if (!TICKERS.includes(ticker)) continue; // Фильтруем только наши бумаги

        const last = row[colIdx.LAST] || row[colIdx.OPEN] || 0;
        if (last === 0) continue; // Пропускаем бумаги без цены

        quotes.push({
          ticker: ticker,
          price: last,
          changePercent: row[colIdx.LASTCHANGEPRCNT] || 0,
          open: row[colIdx.OPEN] || 0,
          high: row[colIdx.HIGH] || 0,
          low: row[colIdx.LOW] || 0,
          volume: row[colIdx.VALTODAY] || 0
        });
      }
      return quotes;
    } catch (err) {
      console.error("Ошибка загрузки котировок:", err);
      throw err;
    }
  }

  /**
   * Простой фундаментальный/технический скоринг для демонстрации.
   * В реальном приложении здесь была бы сложная логика с P/E, дивидендами и т.д.
   * @param {Object} quote 
   * @returns {Object} { score, recommendation, horizon, reasons }
   */
  function analyzeQuote(quote) {
    let score = 50; // Базовый нейтральный балл
    let reasons = [];

    // Пример логики: смотрим на дневное изменение и позицию в дневном диапазоне
    if (quote.changePercent > 0) {
      score += 10;
      reasons.push("Положительная дневная динамика");
    } else {
      score -= 5;
      reasons.push("Отрицательная дневная динамика");
    }

    if (quote.low > 0 && quote.high > 0) {
      const mid = (quote.high + quote.low) / 2;
      if (quote.price > mid) {
        score += 15;
        reasons.push("Цена выше середины дневного диапазона (сила)");
      } else {
        score -= 10;
        reasons.push("Цена ниже середины дневного диапазона (слабость)");
      }
    }

    // Ограничиваем score
    score = Math.max(0, Math.min(100, score));

    let recommendation = "Держать / Наблюдать";
    let horizon = "Среднесрочно";
    
    if (score >= 70) {
      recommendation = "Покупать";
      horizon = "Долгосрок";
    } else if (score <= 30) {
      recommendation = "Избегать / Продавать";
      horizon = "Краткосрок";
    }

    return {
      score: Math.round(score),
      recommendation: recommendation,
      horizon: horizon,
      reasons: reasons
    };
  }

  /**
   * Получить полный анализ для всех бумаг.
   */
  async function getFullAnalysis() {
    const quotes = await fetchQuotes();
    return quotes.map(q => {
      const analysis = analyzeQuote(q);
      return { ...q, ...analysis };
    }).sort((a, b) => b.score - a.score); // Сортируем по убыванию скоринга
  }

  global.MOEXAnalytics = {
    getFullAnalysis,
    TICKERS
  };
})(window);
