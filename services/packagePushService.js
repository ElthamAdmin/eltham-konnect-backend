const webPush = require("web-push");
const CustomerPushSubscription = require("../models/CustomerPushSubscription");

async function sendPackageStatusPush(pkg) {
  if (!["At Warehouse", "Ready for Pickup"].includes(pkg.status)) return;

  const customerEkonId = pkg.customerEkonId;
  if (!customerEkonId) return;

  const subscriptions = await CustomerPushSubscription.find({
    customerEkonId,
  }).lean();

  if (subscriptions.length === 0) return;

  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error("Package push sender is missing its VAPID settings.");
  }

  // sw.js uses this exact status to select the customer-facing message.
  const payload = JSON.stringify({ status: pkg.status });
  const options = {
    vapidDetails: { subject, publicKey, privateKey },
    TTL: 3600,
    timeout: 5000,
  };

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload,
          options
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await CustomerPushSubscription.deleteOne({
            _id: subscription._id,
            customerEkonId,
            endpoint: subscription.endpoint,
          });
          return;
        }

        // Keep endpoint URLs and subscription keys out of application logs.
        throw new Error(`Push service returned ${error.statusCode || "a network error"}.`);
      }
    })
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new Error(`Package alert failed for ${failures.length} device(s).`);
  }
}

module.exports = { sendPackageStatusPush };