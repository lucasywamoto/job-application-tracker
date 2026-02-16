# Job Tracker

Automatically tracks job applications by scanning your Gmail inbox and syncing them to a Notion database. No more manually updating spreadsheets — just apply and let this tool keep your pipeline organized.

## How It Works

1. Scans Gmail for job-related emails (confirmations, rejections, interview invites, offers)
2. Classifies each email using pattern matching
3. Extracts company name, position, salary, location, and job links
4. Creates or updates entries in your Notion database
5. Runs on a schedule (default: every 15 minutes)

## Notion Database Properties

Your Notion database should have these properties:

| Property         | Type     |
| ---------------- | -------- |
| Company          | Title    |
| Position         | Text     |
| Status           | Select   |
| Date Applied     | Date     |
| Salary Range     | Text     |
| Location         | Text     |
| Job Link         | URL      |
| Email Thread     | URL      |
| Follow Up Date   | Date     |
| Notes            | Text     |

**Status options:** Applied, Phone Screen, Interview, Technical, Offer, Rejected, Ghosted

## Setup

### Prerequisites

- Node.js 18+
- A Google Cloud project with Gmail API enabled
- A Notion integration with access to your database

### 1. Clone and install

```bash
git clone <repo-url>
cd job-tracker
npm install
```

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the **Gmail API**
3. Create **OAuth 2.0 credentials** (Desktop app type)
4. Copy the client ID and secret to your `.env` file
5. Run the auth script to get a refresh token:

```bash
npm run auth
```

6. Follow the prompts — paste the resulting refresh token into `.env`

### 3. Configure Notion

1. Create an [internal integration](https://www.notion.so/my-integrations)
2. Share your database with the integration
3. Copy the integration token and database ID to `.env`

### 4. Environment variables

Create a `.env` file in the project root:

```env
# Gmail
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token

# Notion
NOTION_TOKEN=your-notion-integration-token
NOTION_DATABASE_ID=your-database-id

# Optional
CRON_SCHEDULE=*/15 * * * *      # how often to check (default: every 15 min)
INITIAL_LOOKBACK_HOURS=168      # how far back to scan on first run (default: 7 days)
```

## Usage

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The tracker will do an initial scan on startup, then continue checking on the configured schedule.

## Project Structure

```
src/
├── index.ts                 # Entry point — starts cron scheduler
├── auth.ts                  # One-time OAuth setup script
├── scheduler.ts             # Email fetch → parse → sync loop
├── services/
│   ├── gmail.service.ts     # Gmail API integration
│   ├── notion.service.ts    # Notion API integration
│   └── parser.service.ts    # Email classification & data extraction
├── types/
│   └── index.ts             # TypeScript interfaces
└── utils/
    ├── config.ts            # Environment variable loading
    └── logger.ts            # Logging utility
```

## Email Classification

Emails are classified into categories based on keyword patterns:

| Category                 | Example triggers                                       |
| ------------------------ | ------------------------------------------------------ |
| Application Confirmation | "application received", "thank you for applying"       |
| Interview Invitation     | "schedule an interview", "coding challenge", "on-site" |
| Rejection                | "unfortunately", "other candidates", "not moving forward" |
| Offer                    | "offer letter", "pleased to offer"                     |
| Follow Up                | "update on your application", "checking in"            |

Unclassified emails are skipped automatically.

## License

MIT
