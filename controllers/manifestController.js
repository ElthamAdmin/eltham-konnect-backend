const { packages } = require("./packageController");

let manifests = [];

const createManifest = (req, res) => {
  const { origin } = req.body;

  const manifest = {
    manifestNumber: `MFT-${Date.now()}`,
    origin,
    packageCount: 0,
    packages: [],
    status: "Created",
    createdAt: new Date().toISOString().split("T")[0],
  };

  manifests.push(manifest);

  res.json({
    success: true,
    message: "Manifest created",
    data: manifest,
  });
};

const addPackageToManifest = (req, res) => {
  const { manifestNumber } = req.params;
  const { trackingNumber } = req.body;

  const manifest = manifests.find(m => m.manifestNumber === manifestNumber);
  const pkg = packages.find(p => p.trackingNumber === trackingNumber);

  if (!manifest || !pkg) {
    return res.status(404).json({
      success:false,
      message:"Manifest or package not found"
    });
  }

  manifest.packages.push(trackingNumber);
  manifest.packageCount++;

  pkg.status = "In Transit";

  res.json({
    success:true,
    message:"Package added to manifest"
  });
};

const departManifest = (req,res) => {

  const { manifestNumber } = req.params;

  const manifest = manifests.find(m=>m.manifestNumber === manifestNumber);

  if(!manifest){
    return res.status(404).json({
      success:false,
      message:"Manifest not found"
    });
  }

  manifest.status = "In Transit";

  res.json({
    success:true,
    message:"Manifest departed"
  });

};

const arriveManifest = (req,res) => {

  const { manifestNumber } = req.params;

  const manifest = manifests.find(m=>m.manifestNumber === manifestNumber);

  if(!manifest){
    return res.status(404).json({
      success:false,
      message:"Manifest not found"
    });
  }

  manifest.status = "Arrived Jamaica";

  manifest.packages.forEach(tracking => {

    const pkg = packages.find(p=>p.trackingNumber === tracking);

    if(pkg){
      pkg.status = "In Transit to Branch";
    }

  });

  res.json({
    success:true,
    message:"Manifest arrived Jamaica"
  });

};

const getManifests = (req,res)=>{

  res.json({
    success:true,
    data:manifests
  });

};

module.exports = {
createManifest,
addPackageToManifest,
departManifest,
arriveManifest,
getManifests
};