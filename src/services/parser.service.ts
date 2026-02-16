import { ParsedEmail, EmailCategory, JobApplication, JobStatus } from "../types";
import { logger } from "../utils/logger";

// Pattern matching for email classification
const CATEGORY_PATTERNS: { category: EmailCategory; patterns: RegExp[] }[] = [
  {
    category: "offer",
    patterns: [
      /offer letter/i,
      /job offer/i,
      /we are pleased to offer/i,
      /extend an offer/i,
      /offer of employment/i,
      /congratulations.*offer/i,
    ],
  },
  {
    category: "interview_invitation",
    patterns: [
      /schedule.*interview/i,
      /interview.*schedule/i,
      /phone screen/i,
      /invite you to interview/i,
      /like to schedule/i,
      /next steps.*interview/i,
      /technical assessment/i,
      /coding challenge/i,
      /take-home/i,
      /onsite interview/i,
      /virtual interview/i,
      /meet the team/i,
    ],
  },
  {
    category: "rejection",
    patterns: [
      /unfortunately/i,
      /not moving forward/i,
      /other candidates/i,
      /position has been filled/i,
      /decided not to proceed/i,
      /will not be moving/i,
      /not be able to offer/i,
      /pursue other candidates/i,
      /after careful consideration/i,
      /regret to inform/i,
      /won't be moving forward/i,
    ],
  },
  {
    category: "application_confirmation",
    patterns: [
      /application.*received/i,
      /thank you for applying/i,
      /application.*submitted/i,
      /we received your application/i,
      /application confirmation/i,
      /successfully applied/i,
      /application.*review/i,
    ],
  },
  {
    category: "follow_up",
    patterns: [
      /following up/i,
      /checking in/i,
      /update on your application/i,
      /status.*application/i,
      /wanted to reach out/i,
    ],
  },
];

const STATUS_MAP: Record<EmailCategory, JobStatus> = {
  application_confirmation: "Applied",
  rejection: "Rejected",
  interview_invitation: "Interview",
  offer: "Offer",
  follow_up: "Applied",
  unknown: "Applied",
};

export function classifyEmail(email: ParsedEmail): EmailCategory {
  const text = `${email.subject} ${email.body}`;

  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      return category;
    }
  }

  return "unknown";
}

export function parseJobApplication(
  email: ParsedEmail,
  category: EmailCategory
): JobApplication {
  const company = extractCompany(email);
  const position = extractPosition(email);
  const salaryRange = extractSalary(email.body);
  const location = extractLocation(email.body);
  const jobLink = extractJobLink(email.htmlBody || email.body);

  const followUpDate =
    category === "application_confirmation"
      ? generateFollowUpDate(email.date, 7)
      : category === "interview_invitation"
        ? generateFollowUpDate(email.date, 1)
        : undefined;

  return {
    company,
    position,
    dateApplied: new Date(email.date).toISOString().split("T")[0],
    status: STATUS_MAP[category],
    salaryRange: salaryRange || undefined,
    location: location || undefined,
    jobLink: jobLink || undefined,
    emailThreadLink: `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`,
    followUpDate,
    notes: `Auto-tracked from email: ${category.replace(/_/g, " ")}`,
    sourceEmail: email.subject,
  };
}

function extractCompany(email: ParsedEmail): string {
  // Try to get company from "From" header
  // Format: "Company Name <email@company.com>" or "Name at Company <email>"
  const fromMatch = email.from.match(/^"?([^"<]+)"?\s*</);
  if (fromMatch) {
    const name = fromMatch[1].trim();
    // Filter out generic names like "No Reply", "Recruiting", etc.
    if (!/^(no[- ]?reply|recruiting|careers|talent|hr|jobs)/i.test(name)) {
      // Clean up common suffixes
      return name
        .replace(/\s*(recruiting|careers|talent|team|hr|jobs|hiring)$/i, "")
        .trim();
    }
  }

  // Try domain extraction from email
  const domainMatch = email.from.match(/@([^.>]+)\./);
  if (domainMatch) {
    const domain = domainMatch[1];
    // Skip generic email providers
    if (
      !["gmail", "yahoo", "hotmail", "outlook", "mail"].includes(
        domain.toLowerCase()
      )
    ) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  // Try ATS platforms - extract from subject
  const subjectCompany = email.subject.match(
    /(?:at|from|with)\s+([A-Z][A-Za-z0-9\s&]+?)(?:\s*[-–|]|\s*$)/
  );
  if (subjectCompany) {
    return subjectCompany[1].trim();
  }

  return "Unknown Company";
}

function extractPosition(email: ParsedEmail): string {
  const text = `${email.subject} ${email.body.slice(0, 1000)}`;

  // Common patterns for position extraction
  const patterns = [
    /(?:position|role|job)\s*(?:of|:)\s*([A-Za-z0-9\s/,.-]+?)(?:\s*(?:at|with|in)\s|[.\n])/i,
    /applied\s+(?:for|to)\s+(?:the\s+)?([A-Za-z0-9\s/,.-]+?)(?:\s+(?:position|role|at|with))/i,
    /(?:for the\s+)([A-Za-z0-9\s/,.-]+?)\s+(?:position|role|opening)/i,
    /(?:application|applied).*?(?:for|to)\s+([A-Za-z0-9\s/,.-]+?)(?:\.|,|\n)/i,
    // Subject line patterns
    /(?:re:\s*)?(?:your\s+)?application\s*[-–:]\s*([A-Za-z0-9\s/,.-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const position = match[1].trim();
      if (position.length > 3 && position.length < 100) {
        return position;
      }
    }
  }

  // Fallback: use subject line cleaned up
  const cleanSubject = email.subject
    .replace(
      /^(re:|fwd?:|application|confirmation|thank you|update)\s*/gi,
      ""
    )
    .replace(/\s*[-–|]\s*.+$/, "")
    .trim();

  return cleanSubject || "Unknown Position";
}

function extractSalary(text: string): string | null {
  const patterns = [
    /\$[\d,]+\s*[-–to]+\s*\$[\d,]+\s*(?:per\s+(?:year|annum|hr|hour))?/i,
    /\$[\d,]+\s*(?:k|K)?\s*[-–to]+\s*\$[\d,]+\s*(?:k|K)?/i,
    /salary\s*(?:range)?:?\s*\$[\d,]+/i,
    /compensation:?\s*\$[\d,]+/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }

  return null;
}

function extractLocation(text: string): string | null {
  const patterns = [
    /(?:location|based in|located in|office in):?\s*([A-Za-z\s,]+(?:,\s*[A-Z]{2})?)(?:\.|,|\n)/i,
    /(?:remote|hybrid|on-?site)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }

  return null;
}

function extractJobLink(text: string): string | null {
  // Look for job posting URLs
  const urlPattern =
    /https?:\/\/(?:[\w-]+\.)+[\w-]+(?:\/[\w\-./?%&=#]*)?(?:job|career|position|apply|opening)(?:\/[\w\-./?%&=#]*)?/gi;
  const match = text.match(urlPattern);
  if (match) return match[0];

  // Fallback: look for any ATS platform URLs
  const atsPattern =
    /https?:\/\/(?:[\w-]+\.)?(?:greenhouse|lever|workday|icims|smartrecruiters|ashbyhq|jobvite|bamboohr)[\w\-./?%&=#]*/gi;
  const atsMatch = text.match(atsPattern);
  if (atsMatch) return atsMatch[0];

  return null;
}

function generateFollowUpDate(
  fromDate: string,
  daysFromNow: number
): string {
  const date = new Date(fromDate);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0];
}

export function shouldProcess(email: ParsedEmail): boolean {
  const category = classifyEmail(email);
  if (category === "unknown") {
    logger.debug(`Skipping unclassified email: ${email.subject}`);
    return false;
  }
  return true;
}
