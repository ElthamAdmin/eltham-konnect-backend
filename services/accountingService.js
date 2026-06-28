const { workflowService } = require("./accountingEngine");

module.exports = {
  postCustomerInvoice: workflowService.postCustomerInvoice,
  receiveInvoicePayment: workflowService.receiveInvoicePayment,
  postOwnerDeposit: workflowService.postOwnerDeposit,
  postOwnerDrawing: workflowService.postOwnerDrawing,
  transferFunds: workflowService.transferFunds,
  postExpensePayment: workflowService.postExpensePayment,
  postPayrollPayment: workflowService.postPayrollPayment,
};