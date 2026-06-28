const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const isPositiveMoney = (value) => roundMoney(value) > 0;

module.exports = {
  roundMoney,
  isPositiveMoney,
};