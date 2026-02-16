import * as fs from "fs";
import * as path from "path";
import { fetchJobEmails, labelAsProcessed } from "./services/gmail.service";
import {
  classifyEmail,
  parseJobApplication,
  shouldProcess,
} from "./services/parser.service";
import { createOrUpdateApplication } from "./services/notion.service";
import { logger } from "./utils/logger";
import { config } from "./utils/config";
import { ProcessingState } from "./types";

const STATE_FILE = path.resolve(__dirname, "../state.json");

function loadState(): ProcessingState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn("Failed to load state file, using default", error);
  }

  // Default: look back configured hours
  const lookback = new Date();
  lookback.setHours(lookback.getHours() - config.initialLookbackHours);
  return { lastProcessedTimestamp: lookback.toISOString() };
}

function saveState(state: ProcessingState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    logger.error("Failed to save state file", error);
  }
}

export async function processNewEmails(): Promise<void> {
  const state = loadState();
  logger.info(`Processing emails after: ${state.lastProcessedTimestamp}`);

  let emails;
  try {
    emails = await fetchJobEmails(state.lastProcessedTimestamp);
  } catch (error) {
    logger.error("Failed to fetch emails from Gmail", error);
    return;
  }

  if (emails.length === 0) {
    logger.info("No new job emails found");
    return;
  }

  const processedIds: string[] = [];
  let latestTimestamp = state.lastProcessedTimestamp;
  let successCount = 0;
  let skipCount = 0;

  for (const email of emails) {
    if (!shouldProcess(email)) {
      skipCount++;
      continue;
    }

    const category = classifyEmail(email);
    const application = parseJobApplication(email, category);

    logger.info(
      `Processing: [${category}] ${application.company} - ${application.position}`
    );

    try {
      await createOrUpdateApplication(application);
      processedIds.push(email.id);
      successCount++;

      // Track latest email timestamp
      if (email.date > latestTimestamp) {
        latestTimestamp = email.date;
      }
    } catch (error) {
      logger.error(
        `Failed to process email: ${email.subject}`,
        error
      );
    }
  }

  // Label processed emails in Gmail
  try {
    await labelAsProcessed(processedIds);
  } catch (error) {
    logger.error("Failed to label emails as processed", error);
  }

  // Update state
  saveState({ lastProcessedTimestamp: latestTimestamp });

  logger.info(
    `Run complete: ${successCount} processed, ${skipCount} skipped, ${emails.length - successCount - skipCount} errors`
  );
}
