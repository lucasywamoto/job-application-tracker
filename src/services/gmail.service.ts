import { google, gmail_v1 } from "googleapis";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { ParsedEmail } from "../types";
import * as cheerio from "cheerio";

const oauth2Client = new google.auth.OAuth2(
  config.gmail.clientId,
  config.gmail.clientSecret,
  config.gmail.redirectUri
);

oauth2Client.setCredentials({
  refresh_token: config.gmail.refreshToken,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

// Queries to catch job-related emails
const JOB_QUERIES = [
  'subject:("application received" OR "thank you for applying" OR "application confirmation")',
  'subject:("unfortunately" OR "not moving forward" OR "other candidates" OR "position has been filled")',
  'subject:("interview" OR "phone screen" OR "schedule a call" OR "next steps")',
  'subject:("offer letter" OR "job offer" OR "we are pleased")',
  'from:(greenhouse.io OR lever.co OR workday.com OR icims.com OR myworkdayjobs.com OR smartrecruiters.com OR ashbyhq.com)',
];

export async function fetchJobEmails(
  afterTimestamp: string
): Promise<ParsedEmail[]> {
  const after = Math.floor(new Date(afterTimestamp).getTime() / 1000);
  const combinedQuery = `(${JOB_QUERIES.join(" OR ")}) after:${after}`;

  logger.info("Fetching emails with query", { after: afterTimestamp });
  logger.debug("Full query", combinedQuery);

  const allEmails: ParsedEmail[] = [];
  let pageToken: string | undefined;

  do {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: combinedQuery,
      maxResults: 50,
      pageToken,
    });

    const messages = response.data.messages || [];
    logger.info(`Found ${messages.length} messages in this page`);

    for (const msg of messages) {
      if (!msg.id) continue;
      const parsed = await parseMessage(msg.id);
      if (parsed) {
        allEmails.push(parsed);
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  logger.info(`Total job emails fetched: ${allEmails.length}`);
  return allEmails;
}

async function parseMessage(messageId: string): Promise<ParsedEmail | null> {
  try {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const message = response.data;
    const headers = message.payload?.headers || [];

    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value || "";

    const subject = getHeader("Subject");
    const from = getHeader("From");
    const date = getHeader("Date");

    const { text, html } = extractBody(message.payload);

    return {
      id: messageId,
      threadId: message.threadId || messageId,
      from,
      subject,
      date: new Date(date).toISOString(),
      body: html ? stripHtml(html) : text,
      htmlBody: html || undefined,
    };
  } catch (error) {
    logger.error(`Failed to parse message ${messageId}`, error);
    return null;
  }
}

function extractBody(payload?: gmail_v1.Schema$MessagePart): {
  text: string;
  html: string;
} {
  let text = "";
  let html = "";

  if (!payload) return { text, html };

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    text = decodeBase64(payload.body.data);
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    html = decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result.text) text = result.text;
      if (result.html) html = result.html;
    }
  }

  return { text, html };
}

function decodeBase64(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  // Remove style and script tags
  $("style, script").remove();
  // Get text and normalize whitespace
  return $("body").text().replace(/\s+/g, " ").trim();
}

/**
 * Add a label to processed emails so we don't reprocess them.
 * Creates the label if it doesn't exist.
 */
export async function labelAsProcessed(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  const labelId = await getOrCreateLabel("JobTracker/Processed");

  // Gmail batch modify supports up to 1000 IDs
  for (let i = 0; i < messageIds.length; i += 1000) {
    const batch = messageIds.slice(i, i + 1000);
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: batch,
        addLabelIds: [labelId],
      },
    });
  }

  logger.info(`Labeled ${messageIds.length} emails as processed`);
}

let cachedLabelId: string | null = null;

async function getOrCreateLabel(labelName: string): Promise<string> {
  if (cachedLabelId) return cachedLabelId;

  const labels = await gmail.users.labels.list({ userId: "me" });
  const existing = labels.data.labels?.find((l) => l.name === labelName);

  if (existing?.id) {
    cachedLabelId = existing.id;
    return existing.id;
  }

  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  cachedLabelId = created.data.id!;
  return cachedLabelId;
}
