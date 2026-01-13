"use strict";

const STORE_CURRENCY = process.env.STORE_CURRENCY || "USD";
const STORE_LOCALE = "en-US";

function formatMoney(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat(STORE_LOCALE, {
    style: "currency",
    currency: STORE_CURRENCY
  }).format(num);
}

function formatMoneyShort(amount) {
  const num = Number(amount) || 0;
  return "$" + num.toFixed(2);
}

module.exports = {
  STORE_CURRENCY,
  STORE_LOCALE,
  formatMoney,
  formatMoneyShort
};
