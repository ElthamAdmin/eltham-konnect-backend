const express = require("express");
const router = express.Router();

const {
  createManifest,
  addPackageToManifest,
  departManifest,
  arriveManifest,
  getManifests,
} = require("../controllers/manifestController");

router.get("/", getManifests);
router.post("/", createManifest);
router.post("/:manifestNumber/add-package", addPackageToManifest);
router.put("/:manifestNumber/depart", departManifest);
router.put("/:manifestNumber/arrive", arriveManifest);

module.exports = router;