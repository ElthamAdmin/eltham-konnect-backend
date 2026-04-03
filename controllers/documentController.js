const HREmployee = require("../models/HREmployee");
const path = require("path");
const fs = require("fs");

const uploadDocument = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const newDoc = {
      docId: `DOC-${Date.now()}`,
      fileName: req.file.originalname,
      filePath: req.file.filename,
      uploadedAt: new Date(),
      uploadedBy: req.user?.fullName || req.user?.email,
    };

    employee.documents = employee.documents || [];
    employee.documents.push(newDoc);

    await employee.save();

    res.json({
      success: true,
      message: "Document uploaded successfully",
      data: newDoc,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Upload failed",
      error: error.message,
    });
  }
};

const getEmployeeDocuments = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      data: employee.documents || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch documents",
      error: error.message,
    });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { employeeId, docId } = req.params;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const doc = employee.documents.find((d) => d.docId === docId);

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // delete file from disk
    const filePath = path.join(__dirname, "../uploads/hr-documents", doc.filePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    employee.documents = employee.documents.filter((d) => d.docId !== docId);

    await employee.save();

    res.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Delete failed",
      error: error.message,
    });
  }
};

module.exports = {
  uploadDocument,
  getEmployeeDocuments,
  deleteDocument,
};