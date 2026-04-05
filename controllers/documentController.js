const HREmployee = require("../models/HREmployee");
const path = require("path");
const fs = require("fs");

const uploadDocument = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { documentType, documentName } = req.body;

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

    const newDocument = {
      documentName: documentName || req.file.originalname,
      documentType: documentType || "Other",
      fileUrl: `/uploads/hr-documents/${req.file.filename}`,
      uploadedAt: new Date(),
    };

    employee.documents = employee.documents || [];
    employee.documents.push(newDocument);
    await employee.save();

    res.json({
      success: true,
      message: "Document uploaded successfully",
      data: newDocument,
    });
  } catch (error) {
    console.error("Upload document error:", error);
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

    const documents = (employee.documents || []).map((doc) => {
      let fileExists = false;

      if (doc?.fileUrl) {
        const filename = doc.fileUrl.split("/").pop();
        const filePath = path.join(__dirname, "../uploads/hr-documents", filename);
        fileExists = fs.existsSync(filePath);
      }

      return {
        ...doc.toObject(),
        fileExists,
      };
    });

    res.json({
      success: true,
      message: "Documents retrieved successfully",
      data: documents,
    });
  } catch (error) {
    console.error("Get employee documents error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch documents",
      error: error.message,
    });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { employeeId, index } = req.params;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const docIndex = Number(index);

    if (
      Number.isNaN(docIndex) ||
      docIndex < 0 ||
      docIndex >= (employee.documents || []).length
    ) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const doc = employee.documents[docIndex];

    if (doc?.fileUrl) {
      const filename = doc.fileUrl.split("/").pop();
      const filePath = path.join(__dirname, "../uploads/hr-documents", filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    employee.documents.splice(docIndex, 1);
    await employee.save();

    res.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({
      success: false,
      message: "Delete failed",
      error: error.message,
    });
  }
};

const removeMissingDocuments = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const originalCount = (employee.documents || []).length;

    employee.documents = (employee.documents || []).filter((doc) => {
      if (!doc?.fileUrl) return false;

      const filename = doc.fileUrl.split("/").pop();
      const filePath = path.join(__dirname, "../uploads/hr-documents", filename);

      return fs.existsSync(filePath);
    });

    const removedCount = originalCount - employee.documents.length;

    await employee.save();

    res.json({
      success: true,
      message: `${removedCount} missing document record(s) removed successfully`,
      removedCount,
      data: employee.documents,
    });
  } catch (error) {
    console.error("Remove missing documents error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove missing documents",
      error: error.message,
    });
  }
};

module.exports = {
  uploadDocument,
  getEmployeeDocuments,
  deleteDocument,
  removeMissingDocuments,
};