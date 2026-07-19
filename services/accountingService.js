const { workflowService } = require("./accountingEngine");

module.exports = {
  /**
   * Accounts Receivable
   */
  postCustomerInvoice: workflowService.postCustomerInvoice,
  receiveInvoicePayment: workflowService.receiveInvoicePayment,

  /**
   * Accounts Payable
   */
  postVendorBill: workflowService.postVendorBill,
  payVendorBill: workflowService.payVendorBill,

  /**
   * Banking
   */
  postOwnerDeposit: workflowService.postOwnerDeposit,
  postOwnerDrawing: workflowService.postOwnerDrawing,
  transferFunds: workflowService.transferFunds,

  /**
   * Expenses
   */
  postExpensePayment: workflowService.postExpensePayment,

   /**
   * Payroll
   */
  postEmployeeAdvanceFunding:
  workflowService.postEmployeeAdvanceFunding,
    postPayrollPayment: workflowService.postPayrollPayment,
      postGctFilingSettlement:
    workflowService.postGctFilingSettlement,

    /**
   * Tax Center
   */
  postTaxLiabilityPayment:
    workflowService.postTaxLiabilityPayment,
  postIncomeTaxAssessment:
    workflowService.postIncomeTaxAssessment,

  /**
   * Customer Purchases
   */
  postCustomerPurchase:
    workflowService.postCustomerPurchase,
  refundCustomerPurchase: workflowService.refundCustomerPurchase,
  postCustomerPurchaseRecoveryInvoice: workflowService.postCustomerPurchaseRecoveryInvoice,
};