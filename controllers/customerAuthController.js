const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");

const loginCustomer = async (req, res) => {
  try {
    const { ekonId, password } = req.body;

    if (!ekonId || !password) {
      return res.status(400).json({
        success: false,
        message: "EKON ID and password are required",
      });
    }

    const customer = await Customer.findOne({ ekonId });

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "Invalid EKON ID or password",
      });
    }

    if (customer.status !== "Active") {
      return res.status(403).json({
        success: false,
        message: "This customer account is inactive",
      });
    }

    if (!customer.passwordHash) {
      return res.status(403).json({
        success: false,
        message: "Your portal password has not been set yet. Please contact admin.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, customer.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid EKON ID or password",
      });
    }

    const token = jwt.sign(
      {
        customerId: customer._id.toString(),
        ekonId: customer.ekonId,
        email: customer.email,
        name: customer.name,
        userType: "customer",
      },
      process.env.JWT_SECRET || "eltham-konnect-secret",
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      message: "Customer login successful",
      token,
      data: {
        ekonId: customer.ekonId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        branch: customer.branch,
        address: customer.address,
        pointsBalance: customer.pointsBalance,
        signUpDate: customer.signUpDate,
        lastActivityDate: customer.lastActivityDate,
        status: customer.status,
        termsAccepted: customer.termsAccepted,
        termsAcceptedAt: customer.termsAcceptedAt,
        privacyAccepted: customer.privacyAccepted,
        privacyAcceptedAt: customer.privacyAcceptedAt,
      },
    });
  } catch (error) {
    console.error("Customer login error:", error);
    res.status(500).json({
      success: false,
      message: "Customer login failed",
      error: error.message,
    });
  }
};

const getCustomerMe = async (req, res) => {
  try {
    const { ekonId, userType } = req.user || {};

    if (userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    const customer = await Customer.findOne({ ekonId }).select("-passwordHash");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.json({
      success: true,
      message: "Customer profile retrieved successfully",
      data: customer,
    });
  } catch (error) {
    console.error("Get customer profile error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve customer profile",
      error: error.message,
    });
  }
};

const acceptPolicies = async (req, res) => {
  try {
    const { ekonId, userType } = req.user || {};
    const { termsAccepted, privacyAccepted } = req.body;

    if (userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    if (!termsAccepted || !privacyAccepted) {
      return res.status(400).json({
        success: false,
        message: "Both Terms and Privacy Policy must be accepted",
      });
    }

    const customer = await Customer.findOne({ ekonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const now = new Date();

    customer.termsAccepted = true;
    customer.termsAcceptedAt = now;
    customer.privacyAccepted = true;
    customer.privacyAcceptedAt = now;

    await customer.save();

    res.json({
      success: true,
      message: "Policies accepted successfully",
      data: {
        termsAccepted: customer.termsAccepted,
        termsAcceptedAt: customer.termsAcceptedAt,
        privacyAccepted: customer.privacyAccepted,
        privacyAcceptedAt: customer.privacyAcceptedAt,
      },
    });
  } catch (error) {
    console.error("Accept customer policies error:", error);
    res.status(500).json({
      success: false,
      message: "Could not save policy acceptance",
      error: error.message,
    });
  }
};

module.exports = {
  loginCustomer,
  getCustomerMe,
  acceptPolicies,
};