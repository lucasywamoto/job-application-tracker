import {
  ParsedEmail,
  EmailCategory,
  JobApplication,
  JobStatus,
} from "../types";
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
  const body = email.body.slice(0, 3000); // use more body text for extraction
  const company = extractCompany(email, body);
  const position = extractPosition(email, body);
  const salaryRange = extractSalary(body);
  const location = extractLocation(body);
  const jobLink = extractJobLink(email.htmlBody || body);

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

// Words that indicate a sender name is generic, not a company name
const GENERIC_SENDER_NAMES =
  /^(no[- ]?reply|do[- ]?not[- ]?reply|recruiting|careers|talent|hr|jobs|notifications?|info|support|admin|hello|team|mailer|updates?|alerts?)/i;

// Common suffixes in sender display names that aren't part of the company name
const SENDER_SUFFIXES =
  /\s+(recruiting|careers|talent acquisition|talent|team|hr|jobs|hiring|staffing|notifications?)\s*$/i;

// Known ATS platforms — emails from these should extract company from body/subject
const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "myworkdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "jobvite.com",
  "bamboohr.com",
  "applytojob.com",
  "recruitee.com",
  "breezy.hr",
  "jazz.co",
  "rippling.com",
];

function extractCompany(email: ParsedEmail, body: string): string {
  // Strategy 1: Extract from body text — most reliable for ATS emails
  const bodyCompany = extractCompanyFromBody(body);

  // Strategy 2: Extract from "From" display name
  const fromCompany = extractCompanyFromSender(email.from);

  // Strategy 3: Extract from subject line
  const subjectCompany = extractCompanyFromSubject(email.subject);

  // Strategy 4: Domain name as last resort
  const domainCompany = extractCompanyFromDomain(email.from);

  // If email is from an ATS platform, prefer body/subject extraction
  const isAts = ATS_DOMAINS.some((d) =>
    email.from.toLowerCase().includes(d)
  );

  if (isAts) {
    return bodyCompany || subjectCompany || fromCompany || domainCompany || "Unknown Company";
  }

  // For direct company emails, sender name is usually best
  return fromCompany || bodyCompany || subjectCompany || domainCompany || "Unknown Company";
}

function extractCompanyFromBody(body: string): string | null {
  const patterns = [
    // "your application to/at/with Company Name"
    /(?:your\s+)?application\s+(?:to|at|with|for)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s+(?:has been|was|is|for the|for a)\b)/i,
    // "applying to/at Company Name"
    /(?:applying|applied)\s+(?:to|at|with|for)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[.!,]|\s+(?:for|and|as)\b)/i,
    // "Thank you for your interest in Company Name"
    /interest\s+in\s+(?:working\s+(?:at|with)\s+)?([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[.!,]|\s+(?:and|we)\b)/i,
    // "on behalf of Company Name"
    /on\s+behalf\s+of\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[.!,])/i,
    // "position at Company Name"
    /(?:position|role|opportunity)\s+(?:at|with)\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[.!,]|\s+(?:and|has|is|we)\b)/i,
    // "Company Name has received"
    /^([A-Z][A-Za-z0-9\s&.,'-]+?)\s+(?:has\s+received|received|confirms|would like)/im,
    // "team at Company Name"
    /team\s+at\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[.!,])/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const name = cleanCompanyName(match[1]);
      if (name && name.length >= 2 && name.length < 80) {
        return name;
      }
    }
  }

  return null;
}

function extractCompanyFromSender(from: string): string | null {
  // Match display name: "Company Name <email>" or "Company Name" <email>
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
  if (!nameMatch) return null;

  const name = nameMatch[1].trim();

  // Skip generic sender names
  if (GENERIC_SENDER_NAMES.test(name)) return null;

  // Clean up the name
  const cleaned = cleanCompanyName(name);
  if (cleaned && cleaned.length >= 2 && cleaned.length < 80) {
    return cleaned;
  }

  return null;
}

function extractCompanyFromSubject(subject: string): string | null {
  const patterns = [
    // "... at Company Name"
    /\bat\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[-–|!]|\s*$)/,
    // "... from Company Name"
    /\bfrom\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[-–|!]|\s*$)/,
    // "... with Company Name"
    /\bwith\s+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\s*[-–|!]|\s*$)/,
    // "Company Name - ..."
    /^([A-Z][A-Za-z0-9\s&.,'-]+?)\s*[-–|:]\s/,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      const name = cleanCompanyName(match[1]);
      if (name && name.length >= 2 && name.length < 80) {
        return name;
      }
    }
  }

  return null;
}

function extractCompanyFromDomain(from: string): string | null {
  const domainMatch = from.match(/@([^.>]+)\./);
  if (!domainMatch) return null;

  const domain = domainMatch[1].toLowerCase();

  // Skip generic email providers and ATS platforms
  const skip = [
    "gmail",
    "yahoo",
    "hotmail",
    "outlook",
    "mail",
    "proton",
    "icloud",
    ...ATS_DOMAINS.map((d) => d.split(".")[0]),
  ];
  if (skip.includes(domain)) return null;

  // Capitalize and handle common patterns
  // "randstadservices" → "Randstad Services" (split camelCase/known words)
  return titleCase(domain);
}

function cleanCompanyName(name: string): string | null {
  let cleaned = name
    .replace(SENDER_SUFFIXES, "") // remove "Hiring", "Careers", etc.
    .replace(/\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|Co\.?)\s*$/i, "") // remove legal suffixes
    .replace(/\s+/g, " ") // normalize whitespace
    .trim();

  // Don't return obviously bad values
  const bad = [
    "the",
    "a",
    "an",
    "your",
    "our",
    "this",
    "that",
    "us",
    "we",
    "thank",
    "thanks",
    "hi",
    "hello",
    "dear",
    "application",
    "confirmation",
    "update",
    "status",
    "re",
    "fwd",
  ];
  if (bad.includes(cleaned.toLowerCase())) return null;

  return cleaned || null;
}

// Title-case a domain name, attempting to split concatenated words
function titleCase(domain: string): string {
  // Common compound domain splits
  const knownSplits: Record<string, string> = {
    randstadservices: "Randstad",
    smartrecruiters: "SmartRecruiters",
    bamboohr: "BambooHR",
  };
  if (knownSplits[domain]) return knownSplits[domain];

  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

// ---- Position extraction ----

// Job title keywords that indicate we found a real position
const JOB_TITLE_KEYWORDS =
  /\b(developer|engineer|designer|analyst|manager|director|coordinator|specialist|consultant|administrator|architect|lead|senior|junior|intern|associate|assistant|full[- ]?stack|front[- ]?end|back[- ]?end|devops|qa|sre|data|software|web|mobile|cloud|product|project|program|marketing|sales|support|operations|it\b|ux|ui)\b/i;

// Words that are definitely NOT job titles
const NOT_A_POSITION =
  /^(thank you|thanks|application|confirmation|update|status|their interest|your interest|our team|the team|dear|hi|hello|regarding|re|fwd|fw)/i;

function extractPosition(email: ParsedEmail, body: string): string {
  // Strategy 1: Extract from body (most reliable)
  const bodyPosition = extractPositionFromBody(body);
  if (bodyPosition) return bodyPosition;

  // Strategy 2: Extract from subject line with patterns
  const subjectPosition = extractPositionFromSubject(email.subject);
  if (subjectPosition) return subjectPosition;

  // Strategy 3: Clean subject line fallback, but validate it looks like a job title
  const cleanSubject = email.subject
    .replace(/^(re:|fwd?:|fw:)\s*/gi, "")
    .replace(
      /^(application|confirmation|thank you|update|your)\s*[-–:|]\s*/gi,
      ""
    )
    .replace(/\s*[-–|]\s*.+$/, "")
    .trim();

  if (
    cleanSubject &&
    JOB_TITLE_KEYWORDS.test(cleanSubject) &&
    !NOT_A_POSITION.test(cleanSubject)
  ) {
    return cleanSubject;
  }

  return "Unknown Position";
}

function extractPositionFromBody(body: string): string | null {
  const patterns = [
    // "for the Senior Developer position/role"
    /for\s+the\s+([A-Za-z0-9\s/,.-]+?)\s+(?:position|role|opening|opportunity)/i,
    // "position: Senior Developer" or "role: Senior Developer"
    /(?:position|role|job\s*title)\s*[:–-]\s*([A-Za-z0-9\s/,.-]+?)(?:\s*[.\n,;]|\s+(?:at|with|in|is)\b)/i,
    // "applied for Senior Developer"
    /(?:applied|applying)\s+(?:for|to)\s+(?:the\s+)?(?:position\s+of\s+)?([A-Za-z0-9\s/,.-]+?)(?:\s+(?:position|role|at|with)\b|\s*[.,;])/i,
    // "your application for Senior Developer"
    /application\s+for\s+(?:the\s+)?(?:position\s+of\s+)?([A-Za-z0-9\s/,.-]+?)(?:\s+(?:position|role|at|with|has)\b|\s*[.,;])/i,
    // "the Senior Developer role at" or "Senior Developer position at"
    /the\s+([A-Za-z0-9\s/,.-]+?)\s+(?:role|position|opening)\s+(?:at|with)\b/i,
    // "interested in the Senior Developer"
    /interested\s+in\s+(?:the\s+)?(?:position\s+of\s+)?([A-Za-z0-9\s/,.-]+?)(?:\s+(?:position|role|at|with)\b|\s*[.,;])/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const position = match[1].trim();
      if (isValidPosition(position)) {
        return position;
      }
    }
  }

  return null;
}

function extractPositionFromSubject(subject: string): string | null {
  const patterns = [
    // "Application: Senior Developer" or "Application - Senior Developer"
    /application\s*[-–:]\s*([A-Za-z0-9\s/,.-]+?)(?:\s+(?:at|with|-)\b|\s*$)/i,
    // "Senior Developer at Company"
    /^(?:re:\s*)?([A-Za-z0-9\s/,.-]+?)\s+(?:at|@)\s+/i,
    // "Your application for Senior Developer"
    /application\s+for\s+(?:the\s+)?([A-Za-z0-9\s/,.-]+?)(?:\s+(?:at|with)\b|\s*$)/i,
    // "Role: Senior Developer"
    /(?:role|position|job)\s*[-–:]\s*([A-Za-z0-9\s/,.-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      const position = match[1].trim();
      if (isValidPosition(position)) {
        return position;
      }
    }
  }

  return null;
}

function isValidPosition(text: string): boolean {
  if (!text || text.length < 3 || text.length > 100) return false;
  if (NOT_A_POSITION.test(text)) return false;
  // Should contain at least one job-title-ish keyword or be at least 2 words
  if (JOB_TITLE_KEYWORDS.test(text)) return true;
  // Allow multi-word titles even without keywords (e.g. "IT Analyst")
  if (text.split(/\s+/).length >= 2) return true;
  return false;
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

function generateFollowUpDate(fromDate: string, daysFromNow: number): string {
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
