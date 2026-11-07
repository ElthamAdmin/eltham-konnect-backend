const integrationDiscontinued = (req, res) => {
  return res.status(410).json({
    success: false,
    message: "This freight integration has been discontinued.",
  });
};

module.exports = {
  receiveFreightPackage: integrationDiscontinued,
  syncLtwPackages: integrationDiscontinued,
  getKpCustomers: integrationDiscontinued,
  receiveKpPackages: integrationDiscontinued,
  updateKpPackage: integrationDiscontinued,
  deleteKpPackage: integrationDiscontinued,
  updateKpManifest: integrationDiscontinued,
};