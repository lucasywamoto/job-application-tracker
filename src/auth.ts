/**
 * One-time script to get Gmail OAuth refresh token.
 * Run: npm run auth
 *
 * Prerequisites:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a project (or use existing)
 * 3. Enable Gmail API
 * 4. Create OAuth 2.0 credentials (Desktop app type)
 * 5. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to .env
 * 6. Run this script and follow the URL
 * 7. Paste the code back here
 * 8. Copy the refresh token to .env as GMAIL_REFRESH_TOKEN
 */

import { google } from "googleapis";
import * as readline from "readline";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const redirectUri =
  process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Authorize the app and copy the code from the redirect URL");
console.log("   (the ?code= parameter)\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("3. Paste the code here: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(decodeURIComponent(code));
    console.log("\nSuccess! Add this to your .env file:\n");
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("\n(Access token and other fields are handled automatically)");
  } catch (error) {
    console.error("Failed to get token:", error);
  }
  rl.close();
});
