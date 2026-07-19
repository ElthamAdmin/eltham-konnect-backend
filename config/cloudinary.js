const { v2: cloudinary } = require("cloudinary");

const requiredEnvironmentVariables = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const getMissingCloudinaryVariables = () =>
  requiredEnvironmentVariables.filter(
    (variableName) =>
      !String(process.env[variableName] || "").trim()
  );

const configureCloudinary = () => {
  const missingVariables = getMissingCloudinaryVariables();

  if (missingVariables.length > 0) {
    throw new Error(
      `Cloudinary configuration is incomplete. Missing: ${missingVariables.join(
        ", "
      )}.`
    );
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return cloudinary;
};

module.exports = {
  cloudinary,
  configureCloudinary,
  getMissingCloudinaryVariables,
};