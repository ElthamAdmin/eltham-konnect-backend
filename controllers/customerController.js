const bcrypt = require("bcryptjs");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");
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

const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Customers retrieved successfully",
      totalCustomers: customers.length,
      data: customers,
    });
  } catch (error) {
    console.error("Error getting customers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve customers",
    });
  }
};

const createCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      branch,
      address,
      signUpDate,
      lastActivityDate,
      status,
    } = req.body;

    if (!name || !email || !phone || !branch) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone, and branch are required",
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

    const lastCustomer = await Customer.findOne()
      .sort({ ekonId: -1 })
      .select("ekonId");

    let nextNumber = 1;

    if (lastCustomer && lastCustomer.ekonId) {
      const lastNumber = parseInt(lastCustomer.ekonId.replace("EKON", ""), 10);
      nextNumber = lastNumber + 1;
    }

    const ekonId = `EKON${String(nextNumber).padStart(5, "0")}`;
    const today = new Date().toISOString().split("T")[0];

    const newCustomer = new Customer({
      ekonId,
      name,
      email,
      phone,
      branch,
      address: address || "",
      pointsBalance: 0,
      signUpDate: signUpDate || today,
      lastActivityDate: lastActivityDate || today,
      status: status || "Active",
      passwordHash: "",
      termsAccepted: false,
      termsAcceptedAt: null,
      privacyAccepted: false,
      privacyAcceptedAt: null,
      marketingOptIn: true,
      marketingOptOutDate: "",
    });

    await newCustomer.save();

    if (req.user) {
      await writeAuditLog({
        req,
        action: "CREATE_CUSTOMER",
        module: "Customers",
        description: `Customer ${newCustomer.name} (${newCustomer.ekonId}) was created`,
        targetType: "Customer",
        targetId: newCustomer.ekonId,
        metadata: {
          email: newCustomer.email,
          phone: newCustomer.phone,
          branch: newCustomer.branch,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: newCustomer,
    });
  } catch (error) {
    console.error("Error creating customer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create customer",
      error: error.message,
    });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const { ekonId } = req.params;

    const customer = await Customer.findOne({ ekonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    customer.name = req.body.name ?? customer.name;
    customer.email = req.body.email ?? customer.email;
    customer.phone = req.body.phone ?? customer.phone;
    customer.branch = req.body.branch ?? customer.branch;
    customer.address = req.body.address ?? customer.address;
    customer.pointsBalance = req.body.pointsBalance ?? customer.pointsBalance;
    customer.signUpDate = req.body.signUpDate ?? customer.signUpDate;
    customer.lastActivityDate =
      req.body.lastActivityDate ?? customer.lastActivityDate;
    customer.status = req.body.status ?? customer.status;

    if (req.body.marketingOptIn !== undefined) {
      const nextMarketingOptIn = Boolean(req.body.marketingOptIn);
      const currentMarketingOptIn =
        customer.marketingOptIn !== undefined ? customer.marketingOptIn : true;

      customer.marketingOptIn = nextMarketingOptIn;

      if (currentMarketingOptIn && !nextMarketingOptIn) {
        customer.marketingOptOutDate = getJamaicaDateString();
      }

      if (nextMarketingOptIn) {
        customer.marketingOptOutDate = "";
      }
    }

    await customer.save();

    if (req.user) {
      await writeAuditLog({
        req,
        action: "UPDATE_CUSTOMER",
        module: "Customers",
        description: `Customer ${customer.name} (${customer.ekonId}) was updated`,
        targetType: "Customer",
        targetId: customer.ekonId,
        metadata: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          branch: customer.branch,
          status: customer.status,
          marketingOptIn: customer.marketingOptIn,
          marketingOptOutDate: customer.marketingOptOutDate,
        },
      });
    }

    res.json({
      success: true,
      message: "Customer updated successfully",
      data: customer,
    });
  } catch (error) {
    console.error("Error updating customer:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update customer",
      error: error.message,
    });
  }
};

const resetCustomerPassword = async (req, res) => {
  try {
    const { ekonId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    const customer = await Customer.findOne({ ekonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    customer.passwordHash = await bcrypt.hash(password, 10);
    await customer.save();

    if (req.user) {
      await writeAuditLog({
        req,
        action: "RESET_CUSTOMER_PASSWORD",
        module: "Customers",
        description: `Password was reset for customer ${customer.name} (${customer.ekonId})`,
        targetType: "Customer",
        targetId: customer.ekonId,
        metadata: {
          email: customer.email,
        },
      });
    }

    res.json({
      success: true,
      message: "Customer password reset successfully",
    });
  } catch (error) {
    console.error("Error resetting customer password:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset customer password",
      error: error.message,
    });
  }
};

const getPointsHistory = async (req, res) => {
  try {
    const records = await PointsHistory.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Points history retrieved successfully",
      totalRecords: records.length,
      data: records,
    });
  } catch (error) {
    console.error("Error retrieving points history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve points history",
    });
  }
};

const expireInactivePoints = async (req, res) => {
  try {
    const today = new Date();
    const customers = await Customer.find();

    let expiredCustomers = 0;

    for (const customer of customers) {
      if (!customer.lastActivityDate) continue;

      const lastActivity = new Date(customer.lastActivityDate);
      const diffTime = today.getTime() - lastActivity.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 120 && customer.pointsBalance > 0) {
        const expiredPoints = customer.pointsBalance;

        customer.pointsBalance = 0;
        await customer.save();

        await PointsHistory.create({
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          action: "Points expired after 4 months inactivity",
          points: -expiredPoints,
          date: new Date().toISOString().split("T")[0],
        });

        if (req.user) {
          await writeAuditLog({
            req,
            action: "EXPIRE_POINTS",
            module: "Points History",
            description: `Points expired for ${customer.name} (${customer.ekonId}) after inactivity`,
            targetType: "Customer",
            targetId: customer.ekonId,
            metadata: {
              expiredPoints,
            },
          });
        }

        expiredCustomers += 1;
      }
    }

    res.json({
      success: true,
      message: "Inactive points expiry check completed",
      expiredCustomers,
    });
  } catch (error) {
    console.error("Error expiring inactive points:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process inactive points expiry",
    });
  }
};

module.exports = {
  getCustomers,
  createCustomer,
  updateCustomer,
  resetCustomerPassword,
  getPointsHistory,
  expireInactivePoints,
};