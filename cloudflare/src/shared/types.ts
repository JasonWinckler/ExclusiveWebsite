export type AgeStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED"
  | "RETRY_REQUIRED";

export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "PAID"
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "DISPUTED"
  | "REVERSED";

export type EntitlementTier =
  | "EXCLUSIVE_BASIC"
  | "EXCLUSIVE_PREMIUM"
  | "EXCLUSIVE_VIP";

export interface AppwriteUser {
  $id: string;
  email: string;
  name: string;
  emailVerification: boolean;
  status: boolean;
  labels: string[];
  accessedAt?: string;
}

export interface AuthenticatedIdentity {
  userId: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  labels: readonly string[];
  appwriteAccessedAt: string | null;
}

export interface BaseEnv {
  DB: D1Database;
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  SITE_ORIGINS?: string;
  MAX_JSON_BODY_BYTES?: string;
  MAX_UPSTREAM_JSON_BYTES?: string;
}

export interface MembershipEnv extends BaseEnv {
  USER_RATE_LIMITER: RateLimit;
  VERIFICATION_UPLOADS: R2Bucket;
  CONTENT_MEDIA: R2Bucket;
  IDENTITY_PROJECTION: Service;
  LABEL_SYNC_SERVICE_SECRET: string;
  DEVICE_LIMIT?: string;
  INACTIVE_ACCOUNT_DAYS?: string;
  DELETION_GRACE_DAYS?: string;
  PROTECTED_CONTENT_MODE?: string;
  AGE_REVIEW_MODE?: string;
  AGE_UPLOAD_WINDOW_MINUTES?: string;
  AGE_IMAGE_MAX_BYTES?: string;
  AGE_VIDEO_MAX_BYTES?: string;
  SEPA_TRANSFER_MODE?: string;
  SEPA_BENEFICIARY_NAME?: string;
  SEPA_IBAN?: string;
  SEPA_BIC?: string;
  SEPA_ORDER_EXPIRY_DAYS?: string;
  SEPA_ORDER_EXPIRY_HOURS?: string;
  INVOICE_SELLER_NAME?: string;
  INVOICE_SELLER_ADDRESS?: string;
  INVOICE_SELLER_EMAIL?: string;
  INVOICE_TAX_NOTE?: string;
}

export interface AdminEnv extends BaseEnv {
  ADMIN_RATE_LIMITER: RateLimit;
  ADMIN_LABEL?: string;
  IDENTITY_PROJECTION: Service;
  LABEL_SYNC_SERVICE_SECRET: string;
  VERIFICATION_UPLOADS: R2Bucket;
  CONTENT_MEDIA: R2Bucket;
  AGE_EVIDENCE_RETENTION_DAYS?: string;
  AGE_APPROVAL_VALID_DAYS?: string;
  N26_CSV_IMPORT_MODE?: string;
  MAX_N26_CSV_BYTES?: string;
  CONTENT_IMAGE_MAX_BYTES?: string;
  CONTENT_VIDEO_MAX_BYTES?: string;
}

export interface PaymentReconciliationEnv {
  DB: D1Database;
  RECONCILIATION_RATE_LIMITER: RateLimit;
  IDENTITY_PROJECTION: Service;
  LABEL_SYNC_SERVICE_SECRET: string;
  BANK_RECONCILIATION_SERVICE_SECRET: string;
  BANK_RECONCILIATION_MODE?: string;
  MAX_JSON_BODY_BYTES?: string;
}

export interface IdentityProjectionEnv {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_SERVER_API_KEY: string;
  LABEL_SYNC_SERVICE_SECRET: string;
  ACCOUNT_LIFECYCLE_SERVICE_SECRET: string;
  MAX_UPSTREAM_JSON_BYTES?: string;
}

export interface MaintenanceEnv {
  DB: D1Database;
  IDENTITY_PROJECTION: Service;
  LABEL_SYNC_SERVICE_SECRET: string;
  ACCOUNT_LIFECYCLE_SERVICE_SECRET: string;
  VERIFICATION_UPLOADS: R2Bucket;
  INACTIVE_ACCOUNT_DAYS?: string;
  DELETION_GRACE_DAYS?: string;
  MAINTENANCE_BATCH_SIZE?: string;
  AUDIT_RETENTION_DAYS?: string;
}

export interface UserProfileRow {
  appwrite_user_id: string;
  email: string;
  display_name: string;
  email_verified: number;
  account_status: "EMAIL_PENDING" | "ACTIVE" | "RESTRICTED" | "DELETION_PENDING" | "DELETED";
  age_status: AgeStatus;
  jurisdiction_code: string | null;
  last_active_at: string | null;
  last_appwrite_access_at: string | null;
  administrative_hold: number;
  legal_retention_until: string | null;
  deletion_job_hold: number;
  version: number;
}

export interface EntitlementRow {
  id: string;
  tier: EntitlementTier;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  starts_at: string;
  expires_at: string;
}

export interface ContentItemRow {
  id: string;
  slug: string;
  content_status: "DISABLED" | "REVIEW" | "ACTIVE" | "RETIRED";
  required_tier: "FREE" | EntitlementTier;
  jurisdiction_policy: string | null;
  storage_key: string | null;
}

export interface RegisteredDeviceRow {
  id: string;
  status: "ACTIVE" | "REVOKED";
}

export type AgeEvidenceKind = "DOCUMENT_FRONT" | "DOCUMENT_BACK" | "VIDEO";

export interface AgeEvidenceRow {
  id: string;
  age_case_id: string;
  evidence_kind: AgeEvidenceKind;
  r2_object_key: string;
  content_type: string;
  size_bytes: number;
  object_etag: string;
  deleted_at: string | null;
}
