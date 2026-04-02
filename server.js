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
const { attachUserIfPresent } = require("./middleware/authMiddleware");

const app = express();

const uploadsDir = path.join(__dirname, "uploads");
const customerInvoiceUploadsDir = path.join(uploadsDir, "customer-invoices");
const supportAttachmentsDir = path.join(uploadsDir, "support-attachments");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

if (!fs.existsSync(customerInvoiceUploadsDir)) {
  fs.mkdirSync(customerInvoiceUploadsDir, { recursive: true });
}

if (!fs.existsSync(supportAttachmentsDir)) {
  fs.mkdirSync(supportAttachmentsDir, { recursive: true });
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
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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