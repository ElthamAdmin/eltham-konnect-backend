const { roundMoney } = require("./money");

const validateJournalLines = (lines = []) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("A journal entry must contain at least two lines.");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const debit = roundMoney(line.debit);
    const credit = roundMoney(line.credit);

    if (!line.accountCode) {
      throw new Error("Each journal line must include an accountCode.");
    }

    if (debit < 0 || credit < 0) {
      throw new Error("Debit and credit amounts cannot be negative.");
    }

    if (debit > 0 && credit > 0) {
      throw new Error("A journal line cannot contain both debit and credit.");
    }

    if (debit === 0 && credit === 0) {
      throw new Error("Each journal line must contain either debit or credit.");
    }

    totalDebit = roundMoney(totalDebit + debit);
    totalCredit = roundMoney(totalCredit + credit);
  }

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Journal entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`
    );
  }

  return {
    totalDebit,
    totalCredit,
  };
};

module.exports = {
  validateJournalLines,
};