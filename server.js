require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const customerRoutes = require("./routes/customerRoutes");
const customerAuthRoutes = require("./routes/customerAuthRoutes");
const customerInvoiceRoutes = require("./routes/customerInvoiceRoutes");
const customerNotificationRoutes = require("./routes/customerNotificationRoutes");
const preAlertRoutes = require("./routes/preAlertRoutes");
const packageRoutes = require("./routes/packageRoutes");
const manifestRoutes = require("./routes/manifestRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const supportRoutes = require("./routes/supportRoutes");
const communicationRoutes = require("./routes/communicationRoutes");
const financeRoutes = require("./routes/financeRoutes");
const systemUserRoutes = require("./routes/systemUserRoutes");
const hrRoutes = require("./routes/hrRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const settingRoutes = require("./routes/settingRoutes");
const importRoutes = require("./routes/importRoutes");
const shippingRateRoutes = require("./routes/shippingRateRoutes");
const marketingRoutes = require("./routes/marketingRoutes");
const financialAccountRoutes = require("./routes/financialAccountRoutes");
const accountTransactionRoutes = require("./routes/accountTransactionRoutes");
const authRoutes = require("./routes/authRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const hrAnalyticsRoutes = require("./routes/hrAnalyticsRoutes");
const amazonAssociateRoutes = require("./routes/amazonAssociateRoutes");
const { attachUserIfPresent } = require("./middleware/authMiddleware");

const app = express();

const uploadsDir = path.join(__dirname, "uploads");
const customerInvoiceUploadsDir = path.join(uploadsDir, "customer-invoices");
const supportAttachmentsDir = path.join(uploadsDir, "support-attachments");
const hrDocumentsDir = path.join(uploadsDir, "hr-documents");
const expenseReceiptsDir = path.join(uploadsDir, "expense-receipts");
const amazonAssociateDir = path.join(uploadsDir, "amazon-associate");
const noticeBoardDir = path.join(uploadsDir, "notice-board");
const rewardsHubDir = path.join(uploadsDir, "rewards-hub");
const teamHubDir = path.join(uploadsDir, "team-hub");
const referralRoutes = require("./routes/referralRoutes");
const noticeRoutes = require("./routes/noticeRoutes");
const rewardsHubRoutes = require("./routes/rewardsHubRoutes");
const rewardsHubEntryRoutes = require("./routes/rewardsHubEntryRoutes");
const rewardsHubGameRoutes = require("./routes/rewardsHubGameRoutes");
const rewardsHubLeaderboardRoutes = require("./routes/rewardsHubLeaderboardRoutes");
const rewardsHubAnalyticsRoutes = require("./routes/rewardsHubAnalyticsRoutes");
const teamHubRoutes = require("./routes/teamHubRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const chartOfAccountsRoutes = require("./routes/chartOfAccountsRoutes");
const journalEntryRoutes = require("./routes/journalEntryRoutes");
const generalLedgerRoutes = require("./routes/generalLedgerRoutes");
const trialBalanceRoutes = require("./routes/trialBalanceRoutes");
const accountingRoutes = require("./routes/accountingRoutes");
const cashFlowRoutes = require("./routes/cashFlowRoutes");
const fixedAssetRoutes = require("./routes/fixedAssetRoutes");
const accountsPayableRoutes = require("./routes/accountsPayableRoutes");
const bankingRoutes = require("./routes/bankingRoutes");
const debtManagerRoutes = require("./routes/debtManagerRoutes");
const unmatchedPackageRoutes = require("./routes/unmatchedPackageRoutes");
const integrationLogRoutes = require("./routes/integrationLogRoutes");
const freightPartnerRoutes = require("./routes/freightPartnerRoutes");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(customerInvoiceUploadsDir)) {
  fs.mkdirSync(customerInvoiceUploadsDir, { recursive: true });
}

if (!fs.existsSync(supportAttachmentsDir)) {
  fs.mkdirSync(supportAttachmentsDir, { recursive: true });
}

if (!fs.existsSync(hrDocumentsDir)) {
  fs.mkdirSync(hrDocumentsDir, { recursive: true });
}

if (!fs.existsSync(expenseReceiptsDir)) {
  fs.mkdirSync(expenseReceiptsDir, { recursive: true });
}

if (!fs.existsSync(amazonAssociateDir)) {
  fs.mkdirSync(amazonAssociateDir, { recursive: true });
}

if (!fs.existsSync(noticeBoardDir)) {
  fs.mkdirSync(noticeBoardDir, { recursive: true });
}

if (!fs.existsSync(rewardsHubDir)) {
  fs.mkdirSync(rewardsHubDir, { recursive: true });
}

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (
        process.env.NODE_ENV !== "production" ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(attachUserIfPresent);
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }

      if (filePath.match(/\.(jpg|jpeg|png|webp)$/i)) {
        res.setHeader("Content-Disposition", "inline");
      }
    },
  })
);

app.get("/uploads/:folder/:filename", (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(__dirname, "uploads", folder, filename);

  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.status(404).send("File not found");
});

app.get("/", (req, res) => {
  res.send("Eltham Konnect Backend Running");
});

app.use("/api/customers", customerRoutes);
app.use("/api/customer-auth", customerAuthRoutes);
app.use("/api/customer-invoices", customerInvoiceRoutes);
app.use("/api/customer-notifications", customerNotificationRoutes);
app.use("/api/pre-alerts", preAlertRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/manifests", manifestRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/support-tickets", supportRoutes);
app.use("/api/communication", communicationRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/system-users", systemUserRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/leave-requests", leaveRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/import", importRoutes);
app.use("/api/shipping-rates", shippingRateRoutes);
app.use("/api/marketing", marketingRoutes);
app.use("/api/financial-accounts", financialAccountRoutes);
app.use("/api/account-transactions", accountTransactionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/hr-analytics", hrAnalyticsRoutes);
app.use("/api/amazon-associate", amazonAssociateRoutes);
app.use("/api/documents", require("./routes/documentRoutes"));
app.use("/api/referrals", referralRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/rewards-hub", rewardsHubRoutes);
app.use("/api/rewards-hub-entries", rewardsHubEntryRoutes);
app.use("/api/rewards-hub-games", rewardsHubGameRoutes);
app.use("/api/rewards-hub-leaderboard", rewardsHubLeaderboardRoutes);
app.use("/api/rewards-hub-analytics", rewardsHubAnalyticsRoutes);
app.use("/api/team-hub", teamHubRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/chart-of-accounts", chartOfAccountsRoutes);
app.use("/api/journal-entries", journalEntryRoutes);
app.use("/api/general-ledger", generalLedgerRoutes);
app.use("/api/trial-balance", trialBalanceRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/cash-flow", cashFlowRoutes);
app.use("/api/fixed-assets", fixedAssetRoutes);
app.use("/api/accounts-payable", accountsPayableRoutes);
app.use("/api/banking", bankingRoutes);
app.use("/api/debt-manager", debtManagerRoutes);
app.use("/api/unmatched-packages", unmatchedPackageRoutes);
app.use("/api/integration-logs", integrationLogRoutes);
app.use("/api/freight-partners", freightPartnerRoutes);
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });