# Render setup for Bondhu server

Your push code is already in this folder:
- **index.js** – listens for `register_fcm` and calls `sendPushToUser` when a private message is delivered
- **push.js** – saves FCM tokens and sends push via Firebase Admin

## What you do

1. **Push to GitHub**  
   Commit and push your `bondhu-v2` repo (including this `server/` folder) to GitHub.

2. **On Render**  
   - Open your **Web Service** that runs this server (e.g. bondhu-chat-server).
   - Go to **Environment**.
   - Add one variable:
     - **Key:** `FIREBASE_SERVICE_ACCOUNT_JSON`
     - **Value:** Paste the **full JSON** from Firebase (Project settings → Service accounts → Generate new private key). Copy the entire file content and paste it here.
   - Save and **Redeploy**.

3. **Done**  
   After deploy, the server will save FCM tokens when the app sends `register_fcm` and will send push notifications when someone gets a private message.

No code changes needed – just set the environment variable on Render and redeploy.
