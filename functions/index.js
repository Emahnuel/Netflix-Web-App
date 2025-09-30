/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */



// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const stripe = require("stripe")(functions.config().stripe.secret_key);

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Setup express app for raw body parsing
const app = express();
app.use(express.raw({ type: "application/json" }));

// Stripe Webhook Handler
app.post("/", async (req, res) => {
  const endpointSecret = functions.config().stripe.webhook_secret;
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("❌ Webhook verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 🔄 Helper function to update user based on Stripe customer ID
  const updateUserByStripeId = async (stripeCustomerId, updates) => {
    const customerSnapshot = await db
      .collection("customers")
      .where("stripeId", "==", stripeCustomerId)
      .limit(1)
      .get();

    if (!customerSnapshot.empty) {
      const userDoc = customerSnapshot.docs[0];
      await userDoc.ref.set(updates, { merge: true });
      console.log(`✅ Updated Firestore for user ${userDoc.id}`);
    } else {
      console.warn("⚠️ No matching customer in Firestore for", stripeCustomerId);
    }
  };

  // 📦 Handle Events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      await updateUserByStripeId(customerId, {
        subscriptionId: subscriptionId,
        subscriptionStatus: "active",
        lastCheckout: admin.firestore.FieldValue.serverTimestamp(),
      });

      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      await updateUserByStripeId(customerId, {
        subscriptionStatus: "active",
        lastPayment: admin.firestore.Timestamp.fromMillis(invoice.created * 1000),
      });

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      await updateUserByStripeId(customerId, {
        subscriptionStatus: "payment_failed",
      });

      break;
    }

    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      await updateUserByStripeId(customerId, {
        subscriptionStatus: subscription.status,
        current_period_start: admin.firestore.Timestamp.fromMillis(
          subscription.current_period_start * 1000
        ),
        current_period_end: admin.firestore.Timestamp.fromMillis(
          subscription.current_period_end * 1000
        ),
      });

      break;
    }

    default:
      console.log(`🔔 Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
});

exports.handleStripeWebhook = functions.https.onRequest(app);
