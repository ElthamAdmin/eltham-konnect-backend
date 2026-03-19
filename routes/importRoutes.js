const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
importCustomers,
importRates
} = require("../controllers/importController");

const storage = multer.diskStorage({
destination:"uploads/",
filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname)
}
});

const upload = multer({storage});

router.post("/customers",upload.single("file"),importCustomers);
router.post("/rates",upload.single("file"),importRates);

module.exports = router;