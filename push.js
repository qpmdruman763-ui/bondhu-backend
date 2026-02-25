/**
 * FCM push notifications for private chat messages.
 * Set FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON) or GOOGLE_APPLICATION_CREDENTIALS (path to key file).
 * Optional: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY to fall back to profile fcmToken from DB when not in memory.
 */

let admin = null;
let appwriteDatabases = null;
let appwriteQuery = null;
const APPWRITE_DB_ID = "bondhu_db";
const APPWRITE_COLLECTION_PROFILES = "profiles";
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

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
if (endpoint && projectId && apiKey) {
  try {
    const { Client, Databases, Query } = await import("node-appwrite");
    const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    appwriteDatabases = new Databases(client);
    appwriteQuery = Query;
    console.log("[Bondhu] Appwrite fallback for FCM tokens enabled");
  } catch (err) {
    console.warn("[Bondhu] Appwrite fallback not configured:", err.message);
  }
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

/** Fetch FCM token from Appwrite profiles collection (userId = email). Returns null if not configured or not found. */
async function getFcmTokenFromAppwrite(email) {
  if (!appwriteDatabases || !appwriteQuery || !email) return null;
  const key = String(email).toLowerCase().trim();
  try {
    const res = await appwriteDatabases.listDocuments({
      databaseId: APPWRITE_DB_ID,
      collectionId: APPWRITE_COLLECTION_PROFILES,
      queries: [appwriteQuery.equal("userId", key)],
    });
    const doc = res?.documents?.[0];
    const token = (doc && (doc.fcmToken ?? doc.data?.fcmToken)) || null;
    if (token && typeof token === "string" && token.length > 10) {
      fcmTokens.set(key, token);
      return token;
    }
  } catch (err) {
    console.warn("[Bondhu] Appwrite FCM lookup failed for", key, err.message);
  }
  return null;
}

export async function sendPushToUser(targetEmail, { title, body, chatId, type, callType }) {
  console.log("[Bondhu] sendPushToUser", { targetEmail, adminOk: !!admin });
  if (!admin) return;
  let token = getFcmToken(targetEmail);
  if (!token && appwriteDatabases) {
    token = await getFcmTokenFromAppwrite(targetEmail);
    if (token) console.log("[Bondhu] FCM token for recipient", targetEmail, "loaded from Appwrite");
  }
  if (!token) {
    console.log("[Bondhu] FCM token for recipient", targetEmail, "missing (memory and DB)");
    return;
  }
  const data = {};
  if (chatId != null) data.chatId = String(chatId);
  if (type != null) data.type = String(type);
  if (callType != null) data.callType = String(callType);
  try {
    await admin.messaging().send({
      token,
      notification: { title: title || "New message", body: body || "" },
      data,
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
