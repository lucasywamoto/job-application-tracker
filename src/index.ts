import cron from "node-cron";
import { processNewEmails } from "./scheduler";
import { verifyDatabase } from "./services/notion.service";
import { config } from "./utils/config";
import { logger } from "./utils/logger";

async function main() {
  logger.info("Job Tracker starting up...");

  // Verify Notion database is set up correctly
  const dbOk = await verifyDatabase();
  if (!dbOk) {
    logger.error(
      "Notion database verification failed. Please check your database schema."
    );
    process.exit(1);
  }

  // Run once immediately
  logger.info("Running initial email scan...");
  await processNewEmails();

  // Schedule recurring runs
  logger.info(`Scheduling cron: ${config.cron.schedule}`);
  cron.schedule(config.cron.schedule, async () => {
    logger.info("Cron triggered - checking for new emails...");
    try {
      await processNewEmails();
    } catch (error) {
      logger.error("Cron run failed", error);
    }
  });

  logger.info("Job Tracker is running. Press Ctrl+C to stop.");
}

main().catch((error) => {
  logger.error("Fatal error", error);
  process.exit(1);
});
