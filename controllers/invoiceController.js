const Customer = require("../models/Customer");  
const Package = require("../models/Package");  
const Invoice = require("../models/Invoice");  
const ShippingRate = require("../models/ShippingRate");  
const FinancialAccount = require("../models/FinancialAccount");  
const AccountTransaction = require("../models/AccountTransaction");  
const CustomerNotification = require("../models/CustomerNotification");  
const { writeAuditLog } = require("../utils/auditLogger");  

const getJamaicaDateString = (date = new Date()) => {  
  const formatter = new Intl.DateTimeFormat("en-CA", {  
    timeZone: "America/Jamaica",  
    year: "numeric",  
    month: "2-digit",  
    day: "2-digit",  
  });  

  return formatter.format(date);  
};  

const createCustomerNotification = async ({  
  customerEkonId,  
  customerName,  
  title,  
  message,  
  type,  
  referenceType = "",  
  referenceId = "",  
}) => {  
  await CustomerNotification.create({  
    notificationNumber: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,  
    customerEkonId,  
    customerName,  
    title,  
    message,  
    type,  
    referenceType,  
    referenceId,  
    isRead: false,  
    date: getJamaicaDateString(),  
  });  
};  

// ✅ EXISTING FUNCTION (UNCHANGED)
const createInvoice = async (req, res) => {  
  try {  
    const { customerEkonId, pointsToRedeem } = req.body;  

    const customer = await Customer.findOne({ ekonId: customerEkonId });  

    if (!customer) {  
      return res.status(404).json({ success: false, message: "Customer not found" });  
    }  

    const readyPackages = await Package.find({  
      customerEkonId,  
      readyForPickup: true,  
      invoiceStatus: "Pending",  
    });  

    if (readyPackages.length === 0) {  
      return res.status(400).json({  
        success: false,  
        message: "No ready packages with pending invoice.",  
      });  
    }  

    const ratedPackages = [];  

    for (const pkg of readyPackages) {  
      const roundedWeight = Math.ceil(Number(pkg.weight || 0));  
      const rateDoc = await ShippingRate.findOne({ weight: roundedWeight });  

      if (!rateDoc) {  
        return res.status(400).json({  
          success: false,  
          message: `No shipping rate found for ${roundedWeight} lb`,  
        });  
      }  

      ratedPackages.push({  
        trackingNumber: pkg.trackingNumber,  
        chargeableWeight: roundedWeight,  
        rate: Number(rateDoc.price || 0),  
      });  
    }  

    const subtotal = ratedPackages.reduce((sum, pkg) => sum + pkg.rate, 0);  

    const requestedPoints = Number(pointsToRedeem) || 0;  
    let redeemAmount = 0;  

    if (requestedPoints > 0) {  
      if (customer.pointsBalance < 500) {  
        return res.status(400).json({ success: false, message: "Minimum 500 points required" });  
      }  

      if (requestedPoints > customer.pointsBalance) {  
        return res.status(400).json({ success: false, message: "Not enough points" });  
      }  

      redeemAmount = Math.min(requestedPoints, subtotal);  
      customer.pointsBalance -= redeemAmount;  
      customer.lastActivityDate = getJamaicaDateString();  
      await customer.save();  
    }  

    const finalTotal = subtotal - redeemAmount;  

    const invoice = await Invoice.create({  
      invoiceNumber: `INV-${Date.now()}`,  
      customerEkonId: customer.ekonId,  
      customerName: customer.name,  
      packageCount: ratedPackages.length,  
      packages: ratedPackages,  
      subtotal,  
      pointsRedeemed: redeemAmount,  
      finalTotal,  
      status: "Unpaid",  
      createdAt: getJamaicaDateString(),  
    });  

    await Package.updateMany(  
      { customerEkonId, readyForPickup: true, invoiceStatus: "Pending" },  
      { $set: { invoiceStatus: "Issued" } }  
    );  

    res.json({ success: true, data: invoice });  
  } catch (error) {  
    res.status(500).json({ success: false, message: error.message });  
  }  
};  


// ✅ NEW FUNCTION (THIS FIXES YOUR BUTTON)
const generateMultipleInvoice = async (req, res) => {
  try {
    const { customerEkonId, packageIds } = req.body;

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const readyPackages = await Package.find({
      _id: { $in: packageIds },
      readyForPickup: true,
      invoiceStatus: "Pending",
    });

    if (readyPackages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid ready packages selected",
      });
    }

    const ratedPackages = [];

    for (const pkg of readyPackages) {
      const roundedWeight = Math.ceil(Number(pkg.weight || 0));
      const rateDoc = await ShippingRate.findOne({ weight: roundedWeight });

      if (!rateDoc) {
        return res.status(400).json({
          success: false,
          message: `Missing rate for ${roundedWeight} lb`,
        });
      }

      ratedPackages.push({
        trackingNumber: pkg.trackingNumber,
        chargeableWeight: roundedWeight,
        rate: Number(rateDoc.price),
      });
    }

    const subtotal = ratedPackages.reduce((sum, p) => sum + p.rate, 0);

    const invoice = await Invoice.create({
      invoiceNumber: `INV-${Date.now()}`,
      customerEkonId,
      customerName: customer.name,
      packageCount: ratedPackages.length,
      packages: ratedPackages,
      subtotal,
      finalTotal: subtotal,
      status: "Unpaid",
      createdAt: getJamaicaDateString(),
    });

    await Package.updateMany(
      { _id: { $in: packageIds } },
      { $set: { invoiceStatus: "Issued" } }
    );

    res.json({
      success: true,
      message: "Bulk invoice created",
      data: invoice,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Invoice generation failed",
    });
  }
};


const getInvoices = async (req, res) => {  
  const invoices = await Invoice.find().sort({ _id: -1 });  
  res.json({ success: true, data: invoices });  
};  

const updateInvoicePaymentLink = async (req, res) => { /* unchanged */ };  
const markInvoicePaid = async (req, res) => { /* unchanged */ };  

module.exports = {  
  createInvoice,  
  generateMultipleInvoice, // ✅ IMPORTANT
  getInvoices,  
  updateInvoicePaymentLink,  
  markInvoicePaid,  
};