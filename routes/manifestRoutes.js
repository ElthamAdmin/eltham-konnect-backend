const express = require("express");
const router = express.Router();

const {
  createManifest,
  addPackageToManifest,
  removePackageFromManifest,
  deleteManifest,
  updateManifest,
  departManifest,
  arriveManifest,
  getManifests,
} = require("../controllers/manifestController");

router.get("/", getManifests);

router.post("/", createManifest);
router.post("/:manifestNumber/add-package", addPackageToManifest);
router.post("/:manifestNumber/remove-package", removePackageFromManifest);

router.put("/:manifestNumber", updateManifest);
router.put("/:manifestNumber/depart", departManifest);
router.put("/:manifestNumber/arrive", arriveManifest);

router.delete("/:manifestNumber", deleteManifest);

module.exports = router;