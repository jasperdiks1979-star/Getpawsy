(function(window) {
  "use strict";

  const STORE_CURRENCY = "USD";
  const STORE_LOCALE = "en-US";

  function normalizePrice(p) {
    let price = Number(p) || 0;
    if (price > 5000) {
      price = price / 100;
    } else if (price > 500) {
      price = price / 10;
    }
    return Math.round(price * 100) / 100;
  }

  function formatMoney(amount) {
    const num = normalizePrice(amount);
    return new Intl.NumberFormat(STORE_LOCALE, {
      style: "currency",
      currency: STORE_CURRENCY
    }).format(num);
  }

  function formatMoneyShort(amount) {
    const num = normalizePrice(amount);
    return "$" + num.toFixed(2);
  }

  window.MoneyUtils = {
    STORE_CURRENCY: STORE_CURRENCY,
    STORE_LOCALE: STORE_LOCALE,
    normalizePrice: normalizePrice,
    formatMoney: formatMoney,
    formatMoneyShort: formatMoneyShort
  };

  window.normalizePrice = normalizePrice;

})(window);
