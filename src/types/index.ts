export type JobStatus =
  | "Applied"
  | "Phone Screen"
  | "Interview"
  | "Technical"
  | "Offer"
  | "Rejected"
  | "Ghosted";

export interface JobApplication {
  company: string;
  position: string;
  dateApplied: string; // ISO date
  status: JobStatus;
  salaryRange?: string;
  location?: string;
  jobLink?: string;
  emailThreadLink?: string;
  followUpDate?: string; // ISO date
  notes?: string;
  sourceEmail: string; // subject line for debugging
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  body: string; // plain text or stripped HTML
  htmlBody?: string;
}

export type EmailCategory =
  | "application_confirmation"
  | "rejection"
  | "interview_invitation"
  | "offer"
  | "follow_up"
  | "unknown";

export interface ClassifiedEmail extends ParsedEmail {
  category: EmailCategory;
  application: JobApplication;
}

export interface ProcessingState {
  lastProcessedTimestamp: string; // ISO date - emails after this are new
}
