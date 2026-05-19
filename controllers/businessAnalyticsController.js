const Customer = require("../models/Customer");
const Package = require("../models/Package");
const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const SupportTicket = require("../models/SupportTicket");
const SystemUser = require("../models/SystemUser");

const getBusinessAnalytics = async (req, res) => {
  try {
    const [
      customers,
      packages,
      invoices,
      expenses,
      tickets,
      users,
    ] = await Promise.all([
      Customer.find(),
      Package.find(),
      Invoice.find(),
      Expense.find(),
      SupportTicket.find(),
      SystemUser.find(),
    ]);

    const paidInvoices = invoices.filter(
      (inv) => inv.status === "Paid"
    );

    const unpaidInvoices = invoices.filter(
      (inv) => inv.status !== "Paid"
    );

    const totalRevenue = paidInvoices.reduce(
      (sum, inv) => sum + Number(inv.finalTotal || 0),
      0
    );

    const totalExpenses = expenses.reduce(
      (sum, exp) => sum + Number(exp.amount || 0),
      0
    );

    const estimatedProfit =
      totalRevenue - totalExpenses;

    const packagesReceived = packages.length;

    const readyForPickup = packages.filter(
      (pkg) => pkg.readyForPickup === true
    ).length;

    const deliveredPackages = packages.filter(
      (pkg) => pkg.invoiceStatus === "Paid"
    ).length;

    const supportResolved = tickets.filter(
      (ticket) =>
        ticket.status === "Resolved" ||
        ticket.status === "Closed"
    ).length;

    const avgResolutionMinutes =
      tickets.length > 0
        ? Math.round(
            tickets.reduce(
              (sum, ticket) =>
                sum + Number(ticket.resolutionMinutes || 0),
              0
            ) / tickets.length
          )
        : 0;

    const packageWeightAnalytics = {};

    packages.forEach((pkg) => {
      const roundedWeight = Math.ceil(
        Number(pkg.weight || 0)
      );

      packageWeightAnalytics[roundedWeight] =
        (packageWeightAnalytics[roundedWeight] || 0) + 1;
    });

    const branchAnalytics = {};

    customers.forEach((customer) => {
      const branch = customer.branch || "Unknown";

      if (!branchAnalytics[branch]) {
        branchAnalytics[branch] = {
          customers: 0,
        };
      }

      branchAnalytics[branch].customers += 1;
    });

    const freightAnalytics = {};

    packages.forEach((pkg) => {
      const courier = pkg.courier || "Unknown";

      if (!freightAnalytics[courier]) {
        freightAnalytics[courier] = {
          packages: 0,
        };
      }

      freightAnalytics[courier].packages += 1;
    });

    const staffProductivity = users.map((user) => {
      const assignedTickets = tickets.filter(
        (ticket) =>
          ticket.assignedToUserId === user.userId
      );

      return {
        fullName: user.fullName,
        role: user.role,
        assignedTickets: assignedTickets.length,
        resolvedTickets: assignedTickets.filter(
          (ticket) =>
            ticket.status === "Resolved" ||
            ticket.status === "Closed"
        ).length,
      };
    });

    const dailyRevenueMap = {};

    paidInvoices.forEach((invoice) => {
      const date = invoice.paidDate || "Unknown";

      dailyRevenueMap[date] =
        (dailyRevenueMap[date] || 0) +
        Number(invoice.finalTotal || 0);
    });

    const dailyRevenue = Object.entries(
      dailyRevenueMap
    ).map(([date, amount]) => ({
      date,
      amount,
    }));

    res.json({
      success: true,
      data: {
        totals: {
          customers: customers.length,
          packagesReceived,
          readyForPickup,
          deliveredPackages,
          totalRevenue,
          totalExpenses,
          estimatedProfit,
          unpaidInvoices: unpaidInvoices.length,
          supportTickets: tickets.length,
          supportResolved,
          avgResolutionMinutes,
        },

        dailyRevenue,

        packageWeightAnalytics,

        branchAnalytics,

        freightAnalytics,

        staffProductivity,
      },
    });
  } catch (error) {
    console.error(
      "Business analytics error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Could not load business analytics",
      error: error.message,
    });
  }
};

module.exports = {
  getBusinessAnalytics,
};