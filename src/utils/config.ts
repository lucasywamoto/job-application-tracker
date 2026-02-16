import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  gmail: {
    clientId: required("GMAIL_CLIENT_ID"),
    clientSecret: required("GMAIL_CLIENT_SECRET"),
    redirectUri:
      process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback",
    refreshToken: required("GMAIL_REFRESH_TOKEN"),
  },
  notion: {
    token: required("NOTION_TOKEN"),
    databaseId: required("NOTION_DATABASE_ID"),
  },
  cron: {
    schedule: process.env.CRON_SCHEDULE || "*/15 * * * *",
  },
  initialLookbackHours: parseInt(
    process.env.INITIAL_LOOKBACK_HOURS || "168",
    10
  ),
};
