const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");

const createNextEkonId = async () => {
  const lastCustomer = await Customer.findOne()
    .sort({ ekonId: -1 })
    .select("ekonId");

  let nextNumber = 1;

  if (lastCustomer && lastCustomer.ekonId) {
    const lastNumber = parseInt(lastCustomer.ekonId.replace("EKON", ""), 10);
    nextNumber = lastNumber + 1;
  }

  return `EKON${String(nextNumber).padStart(5, "0")}`;
};

const validBranches = ["Eltham Park Mainstore", "Brown's Town Square"];

const signupCustomer = async (req, res) => {
  try {
    const { name, email, phone, branch, password } = req.body;

    if (!name || !email || !phone || !branch || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone, branch, and password are required",
      });
    }

    if (!validBranches.includes(branch)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid branch",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingCustomer = await Customer.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        message: "A customer with that email or phone already exists",
      });
    }

    const ekonId = await createNextEkonId();
    const today = new Date().toISOString().split("T")[0];
    const passwordHash = await bcrypt.hash(password, 10);

    const customer = await Customer.create({
      ekonId,
      name,
      email,
      phone,
      branch,
      address: "",
      pointsBalance: 0,
      signUpDate: today,
      lastActivityDate: today,
      status: "Active",
      passwordHash,
      termsAccepted: false,
      termsAcceptedAt: null,
      privacyAccepted: false,
      privacyAcceptedAt: null,
      marketingOptIn: true,
      marketingOptOutDate: "",
    });

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

    res.status(201).json({
      success: true,
      message: "Customer account created successfully",
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
        marketingOptIn: customer.marketingOptIn,
        marketingOptOutDate: customer.marketingOptOutDate,
      },
    });
  } catch (error) {
    console.error("Customer signup error:", error);
    res.status(500).json({
      success: false,
      message: "Customer signup failed",
      error: error.message,
    });
  }
};

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
        marketingOptIn: customer.marketingOptIn,
        marketingOptOutDate: customer.marketingOptOutDate,
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

const updateCustomerMe = async (req, res) => {
  try {
    const { ekonId, userType } = req.user || {};

    if (userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim();
    const phone = String(req.body.phone || "").trim();
    const marketingOptIn =
      req.body.marketingOptIn !== false;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and phone are required",
      });
    }

    const customer = await Customer.findOne({
      ekonId,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const duplicateCustomer =
      await Customer.findOne({
        _id: { $ne: customer._id },
        $or: [{ email }, { phone }],
      }).select("_id");

    if (duplicateCustomer) {
      return res.status(400).json({
        success: false,
        message:
          "Another customer already uses that email or phone number",
      });
    }

    const previouslyOptedIn =
      customer.marketingOptIn !== false;

    customer.name = name;
    customer.email = email;
    customer.phone = phone;
    customer.marketingOptIn = marketingOptIn;
    customer.lastActivityDate = new Date()
      .toISOString()
      .split("T")[0];

    if (
      previouslyOptedIn &&
      !marketingOptIn
    ) {
      customer.marketingOptOutDate =
        new Date().toISOString();
    }

    if (marketingOptIn) {
      customer.marketingOptOutDate = "";
    }

    await customer.save();

    return res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        ekonId: customer.ekonId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        branch: customer.branch,
        address: customer.address,
        pointsBalance: customer.pointsBalance,
        signUpDate: customer.signUpDate,
        lastActivityDate:
          customer.lastActivityDate,
        status: customer.status,
        termsAccepted:
          customer.termsAccepted,
        termsAcceptedAt:
          customer.termsAcceptedAt,
        privacyAccepted:
          customer.privacyAccepted,
        privacyAcceptedAt:
          customer.privacyAcceptedAt,
        marketingOptIn:
          customer.marketingOptIn,
        marketingOptOutDate:
          customer.marketingOptOutDate,
      },
    });
  } catch (error) {
    console.error(
      "Update customer profile error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not update customer profile",
      error: error.message,
    });
  }
};

const changeCustomerPassword = async (
  req,
  res
) => {
  try {
    const { ekonId, userType } = req.user || {};

    if (userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    const currentPassword = String(
      req.body.currentPassword || ""
    );

    const newPassword = String(
      req.body.newPassword || ""
    );

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 6 characters",
      });
    }

    const customer = await Customer.findOne({
      ekonId,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!customer.passwordHash) {
      return res.status(400).json({
        success: false,
        message:
          "This customer account does not have a portal password",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        currentPassword,
        customer.passwordHash
      );

    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message:
          "The current password is incorrect",
      });
    }

    const samePassword =
      await bcrypt.compare(
        newPassword,
        customer.passwordHash
      );

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message:
          "The new password must be different from the current password",
      });
    }

    customer.passwordHash = await bcrypt.hash(
      newPassword,
      10
    );

    customer.lastActivityDate = new Date()
      .toISOString()
      .split("T")[0];

    await customer.save();

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error(
      "Change customer password error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not update password",
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

const setupCustomerPassword = async (req, res) => {
  try {
    const { ekonId, email, phone, password } = req.body;

    if (!ekonId || !password || (!email && !phone)) {
      return res.status(400).json({
        success: false,
        message: "EKON ID, password, and email or phone are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const customer = await Customer.findOne({
      ekonId,
      $or: [{ email }, { phone }],
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found. Please check your details.",
      });
    }

    if (customer.passwordHash) {
      return res.status(400).json({
        success: false,
        message: "Password already set. Please log in.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    customer.passwordHash = passwordHash;
    customer.lastActivityDate = new Date().toISOString().split("T")[0];

    await customer.save();

    return res.json({
      success: true,
      message: "Password set successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Setup password error:", error);
    res.status(500).json({
      success: false,
      message: "Could not set password",
      error: error.message,
    });
  }
};

module.exports = {
  signupCustomer,
  loginCustomer,
  getCustomerMe,
  updateCustomerMe,
  changeCustomerPassword,
  acceptPolicies,
  setupCustomerPassword,
};