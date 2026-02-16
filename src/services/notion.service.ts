import { Client } from "@notionhq/client";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { JobApplication } from "../types";

const notion = new Client({ auth: config.notion.token });
const databaseId = config.notion.databaseId;

export async function createOrUpdateApplication(
  app: JobApplication
): Promise<void> {
  // Check if entry already exists for this company + position combo
  const existing = await findExisting(app.company, app.position);

  if (existing) {
    await updateApplication(existing.id, app);
  } else {
    await createApplication(app);
  }
}

async function findExisting(
  company: string,
  position: string
): Promise<{ id: string } | null> {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        and: [
          {
            property: "Company",
            title: { equals: company },
          },
          {
            property: "Position",
            rich_text: { equals: position },
          },
        ],
      },
    });

    if (response.results.length > 0) {
      return { id: response.results[0].id };
    }
    return null;
  } catch (error) {
    logger.error("Failed to query Notion database", error);
    return null;
  }
}

async function createApplication(app: JobApplication): Promise<void> {
  try {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: buildProperties(app),
    });
    logger.info(`Created Notion entry: ${app.company} - ${app.position}`);
  } catch (error) {
    logger.error(
      `Failed to create Notion entry for ${app.company}`,
      error
    );
    throw error;
  }
}

async function updateApplication(
  pageId: string,
  app: JobApplication
): Promise<void> {
  try {
    // Only update status if it's a "progression" (don't downgrade)
    const statusOrder = [
      "Applied",
      "Phone Screen",
      "Interview",
      "Technical",
      "Offer",
      "Rejected",
    ];
    const properties = buildProperties(app);

    // For updates, we want to keep the original date applied
    // and only update status + notes
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Status: properties.Status,
        Notes: properties.Notes,
        ...(app.followUpDate
          ? { "Follow-up Date": properties["Follow-up Date"] }
          : {}),
        ...(app.salaryRange
          ? { "Salary Range": properties["Salary Range"] }
          : {}),
        ...(app.location ? { Location: properties.Location } : {}),
      },
    });
    logger.info(
      `Updated Notion entry: ${app.company} - ${app.position} → ${app.status}`
    );
  } catch (error) {
    logger.error(
      `Failed to update Notion entry for ${app.company}`,
      error
    );
    throw error;
  }
}

function buildProperties(app: JobApplication): Record<string, any> {
  const properties: Record<string, any> = {
    Company: {
      title: [{ text: { content: app.company } }],
    },
    Position: {
      rich_text: [{ text: { content: app.position } }],
    },
    "Date Applied": {
      date: { start: app.dateApplied },
    },
    Status: {
      select: { name: app.status },
    },
    "Source Email": {
      rich_text: [
        {
          text: {
            content: app.sourceEmail.slice(0, 2000), // Notion limit
          },
        },
      ],
    },
  };

  if (app.salaryRange) {
    properties["Salary Range"] = {
      rich_text: [{ text: { content: app.salaryRange } }],
    };
  }

  if (app.location) {
    properties["Location"] = {
      rich_text: [{ text: { content: app.location } }],
    };
  }

  if (app.jobLink) {
    properties["Job Link"] = {
      url: app.jobLink,
    };
  }

  if (app.emailThreadLink) {
    properties["Email Thread"] = {
      url: app.emailThreadLink,
    };
  }

  if (app.followUpDate) {
    properties["Follow-up Date"] = {
      date: { start: app.followUpDate },
    };
  }

  if (app.notes) {
    properties["Notes"] = {
      rich_text: [{ text: { content: app.notes } }],
    };
  }

  return properties;
}

/**
 * Verify the database exists and has the right schema.
 */
export async function verifyDatabase(): Promise<boolean> {
  try {
    const db = await notion.databases.retrieve({
      database_id: databaseId,
    });

    const required = [
      "Company",
      "Position",
      "Date Applied",
      "Status",
      "Source Email",
    ];
    const properties = Object.keys(db.properties);
    const missing = required.filter((r) => !properties.includes(r));

    if (missing.length > 0) {
      logger.error(
        `Notion database is missing properties: ${missing.join(", ")}`
      );
      logger.info(
        "Required properties: Company (Title), Position (Text), Date Applied (Date), Status (Select), Salary Range (Text), Location (Text), Job Link (URL), Email Thread (URL), Follow-up Date (Date), Notes (Text), Source Email (Text)"
      );
      return false;
    }

    logger.info("Notion database verified successfully");
    return true;
  } catch (error) {
    logger.error("Failed to verify Notion database", error);
    return false;
  }
}
