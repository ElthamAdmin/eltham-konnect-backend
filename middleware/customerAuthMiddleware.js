const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");

const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || "").trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return secret;
};

const protectCustomer = async (req, res, next) => {
  try {
    const authHeader = String(req.headers.authorization || "");

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Customer authentication is required.",
      });
    }

    const token = authHeader.slice(7).trim();
    const decoded = jwt.verify(token, getJwtSecret());

    if (
      decoded.userType !== "customer" ||
      !decoded.customerId ||
      !decoded.ekonId
    ) {
      return res.status(403).json({
        success: false,
        message: "This token is not authorized for the customer portal.",
      });
    }

    const customer = await Customer.findOne({
      _id: decoded.customerId,
      ekonId: decoded.ekonId,
    })
      .select("_id ekonId name email phone branch status")
      .lean();

    if (!customer || customer.status !== "Active") {
      return res.status(401).json({
        success: false,
        message: "This customer session is no longer active.",
      });
    }

    req.user = {
      customerId: customer._id.toString(),
      ekonId: customer.ekonId,
      email: customer.email,
      name: customer.name,
      branch: customer.branch,
      status: customer.status,
      userType: "customer",
    };

    return next();
  } catch (error) {
    console.error("Customer authentication middleware error:", error.message);

    return res.status(401).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "Your customer session has expired. Please log in again."
          : "Invalid customer session. Please log in again.",
    });
  }
};

module.exports = {
  protectCustomer,
};