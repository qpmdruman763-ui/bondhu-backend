/**
 * FCM push notifications for private chat messages.
 * Set FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON) or GOOGLE_APPLICATION_CREDENTIALS (path to key file).
 */

let admin = null;
try {
  const firebaseAdmin = await import("firebase-admin");
  const cred = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (cred) {
    const key = JSON.parse(cred);
    admin = firebaseAdmin.default.initializeApp({ credential: firebaseAdmin.default.credential.cert(key) });
  } else if (path) {
    admin = firebaseAdmin.default.initializeApp({ credential: firebaseAdmin.default.credential.applicationDefault() });
  }
} catch (err) {
  console.warn("[Bondhu] FCM not configured:", err.message);
}
if (admin) {
  console.log("[Bondhu] FCM initialized (push notifications enabled)");
}

const fcmTokens = new Map(); // email (lowercase) -> FCM token

export function registerFcmToken(email, token) {
  if (!email || !token) return;
  const key = String(email).toLowerCase().trim();
  fcmTokens.set(key, token);
}

export function getFcmToken(email) {
  if (!email) return null;
  return fcmTokens.get(String(email).toLowerCase().trim()) || null;
}

export async function sendPushToUser(targetEmail, { title, body, chatId }) {
  console.log("[Bondhu] sendPushToUser", { targetEmail, adminOk: !!admin });
  if (!admin) return;
  const token = getFcmToken(targetEmail);
  console.log("[Bondhu] FCM token for recipient", targetEmail, token ? "found" : "missing");
  if (!token) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title: title || "New message", body: body || "" },
      data: chatId != null ? { chatId: String(chatId) } : {},
      android: { priority: "high", notification: { channelId: "bondhu_chat" } },
      apns: { payload: { aps: { sound: "default" } } },
    });
    console.log("[Bondhu] FCM send OK for", targetEmail);
  } catch (err) {
    if (err.code === "messaging/invalid-registration-token" || err.code === "messaging/registration-token-not-registered") {
      fcmTokens.delete(String(targetEmail).toLowerCase().trim());
    }
    console.warn("[Bondhu] FCM send failed:", err.message);
  }
}
