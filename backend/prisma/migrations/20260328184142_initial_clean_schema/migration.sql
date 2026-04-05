-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('FULL', 'READ_ONLY', 'LIMITED');

-- CreateEnum
CREATE TYPE "AddOnBillingType" AS ENUM ('ONE_TIME', 'RECURRING', 'USAGE_BASED');

-- CreateEnum
CREATE TYPE "AddOnStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AddOnType" AS ENUM ('FEATURE', 'QUOTA', 'USAGE', 'SUPPORT', 'SERVICE');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('CREDIT', 'DEBIT', 'DISCOUNT', 'LATE_FEE', 'REFUND', 'WRITE_OFF', 'ROUNDING', 'GOODWILL');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('FINANCIAL', 'OPERATIONAL', 'SECURITY', 'TECHNICAL', 'COMPLIANCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertSource" AS ENUM ('SYSTEM', 'MONITORING', 'WEBHOOK', 'USER_REPORT', 'AUTOMATED_CHECK', 'MANUAL', 'USER', 'AUTOMATED_RULE', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'SNOOZED', 'EXPIRED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PAYMENT_FAILED', 'INVENTORY_LOW', 'ORDER_ISSUE', 'SYSTEM_ERROR', 'SECURITY_BREACH', 'SUBSCRIPTION_EXPIRING', 'QUOTA_EXCEEDED', 'PERFORMANCE_DEGRADED', 'INTEGRATION_FAILED', 'FRAUD_DETECTED', 'COMPLIANCE_VIOLATION', 'DATA_INCONSISTENCY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AnalyticsType" AS ENUM ('REVENUE', 'ORDERS', 'CUSTOMERS', 'PRODUCTS', 'INVENTORY', 'PERFORMANCE', 'ENGAGEMENT', 'CONVERSION', 'RETENTION');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('LARGE_CASH_PAYMENT', 'ROUND_AMOUNT', 'OFF_HOURS_PAYMENT', 'VELOCITY_SPIKE', 'AMOUNT_MISMATCH', 'DUPLICATE_RECEIPT', 'MISSING_CHANGE_CALC', 'STAFF_PATTERN', 'TERMINAL_ANOMALY', 'REFUND_ABUSE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('LATE_CLOCK_IN', 'MISSED_CLOCK_OUT', 'REFUND', 'VOID', 'CASH_VARIANCE', 'TIME_OFF', 'SCHEDULE_CHANGE', 'TEMP_PERMISSION');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_LOGIN', 'USER_LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_BANNED', 'USER_ROLE_CHANGED', 'STORE_CREATED', 'STORE_UPDATED', 'STORE_DELETED', 'STORE_STATUS_CHANGED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRODUCT_PRICE_CHANGED', 'ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_REFUNDED', 'PAYMENT_PROCESSED', 'PAYMENT_REFUNDED', 'PAYMENT_FAILED', 'PASSWORD_CHANGED', 'TWO_FA_ENABLED', 'TWO_FA_DISABLED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'SETTINGS_UPDATED', 'INTEGRATION_ADDED', 'INTEGRATION_REMOVED');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('AUTHENTICATION', 'AUTHORIZATION', 'DATA_ACCESS', 'DATA_MODIFICATION', 'FINANCIAL', 'SECURITY', 'CONFIGURATION', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'BIENNIAL', 'CUSTOM', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "BiometricType" AS ENUM ('FINGERPRINT', 'FACE_ID', 'IRIS', 'TOUCH_ID');

-- CreateEnum
CREATE TYPE "BrandingScope" AS ENUM ('PLATFORM', 'TENANT', 'STORE');

-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('PAID', 'UNPAID', 'MEAL');

-- CreateEnum
CREATE TYPE "CapacityType" AS ENUM ('SEATING', 'ORDER', 'DELIVERY', 'TAKEAWAY', 'STAFF');

-- CreateEnum
CREATE TYPE "CircuitStatus" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- CreateEnum
CREATE TYPE "CollectionMethod" AS ENUM ('CHARGE_AUTOMATICALLY', 'SEND_INVOICE');

-- CreateEnum
CREATE TYPE "CommissionPeriodType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('DATABASE', 'CACHE', 'PAYMENT_PROVIDER', 'EMAIL_SERVICE', 'STORAGE', 'API', 'QUEUE', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- CreateEnum
CREATE TYPE "CountType" AS ENUM ('OPEN', 'MID_SHIFT', 'CLOSE');

-- CreateEnum
CREATE TYPE "CouponDuration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');

-- CreateEnum
CREATE TYPE "DLQStatus" AS ENUM ('PENDING', 'FAILED', 'RETRYING', 'RETRY_SCHEDULED', 'INVESTIGATING', 'RESOLVED', 'ABANDONED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('MOBILE_IOS', 'MOBILE_ANDROID', 'WEB', 'DESKTOP', 'TABLET', 'UNKNOWN', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_TRIAL_EXTENSION');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('FRAUDULENT', 'DUPLICATE', 'PRODUCT_NOT_RECEIVED', 'PRODUCT_UNACCEPTABLE', 'SUBSCRIPTION_CANCELLED', 'CREDIT_NOT_PROCESSED', 'GENERAL');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('WON', 'LOST', 'ACCEPTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'NEEDS_RESPONSE', 'EVIDENCE_SUBMITTED', 'WON', 'LOST', 'ACCEPTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DistributionMethod" AS ENUM ('EQUAL_SPLIT', 'HOURS_WEIGHTED', 'ORDERS_WEIGHTED');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'CALCULATED', 'DISTRIBUTED');

-- CreateEnum
CREATE TYPE "DrawerStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED', 'DEPOSITED', 'RECONCILING');

-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('TRANSACTIONAL', 'MARKETING', 'NOTIFICATION', 'AUTHENTICATION', 'ADMINISTRATIVE');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'BOUNCE_SOFT', 'BOUNCE_HARD', 'COMPLAINED', 'UNSUBSCRIBED', 'DEFERRED', 'REJECTED', 'DROPPED');

-- CreateEnum
CREATE TYPE "EmailPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('SENDGRID', 'MAILGUN', 'SES', 'POSTMARK', 'RESEND', 'SMTP');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('MENU_VIEW', 'PRODUCT_INTERACTION', 'CART_ACTION', 'ORDER_ACTION', 'SEARCH', 'FILTER', 'LIFECYCLE', 'PAYMENT', 'CHANGE', 'SYSTEM', 'MENU', 'CATEGORY', 'PRODUCT', 'OPTION', 'USER_ACTION');

-- CreateEnum
CREATE TYPE "EventProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('HOLIDAY', 'SPECIAL_EVENT', 'MAINTENANCE', 'EMERGENCY', 'WEATHER', 'STAFF_SHORTAGE', 'RENOVATION', 'PRIVATE_EVENT', 'EARLY_CLOSURE', 'LATE_OPENING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('QUICKBOOKS_IIF', 'QUICKBOOKS_QBO', 'ADP_CSV', 'GUSTO_CSV', 'PAYCHEX_CSV', 'GENERIC_CSV', 'EXCEL');

-- CreateEnum
CREATE TYPE "FeatureType" AS ENUM ('BOOLEAN', 'QUANTITY', 'TEXT');

-- CreateEnum
CREATE TYPE "FlagScope" AS ENUM ('GLOBAL', 'TENANT', 'USER');

-- CreateEnum
CREATE TYPE "FraudCategory" AS ENUM ('AUTHENTICATION', 'PAYMENT', 'ORDER', 'ACCOUNT', 'DEVICE');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'CONFIRMED', 'FALSE_POSITIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FraudType" AS ENUM ('OTP_BRUTE_FORCE', 'MULTIPLE_FAILED_LOGINS', 'SUSPICIOUS_DEVICE', 'ACCOUNT_TAKEOVER_ATTEMPT', 'CREDENTIAL_STUFFING', 'PAYMENT_FAILED_MULTIPLE', 'PAYMENT_VELOCITY_EXCEEDED', 'REFUND_ABUSE', 'CHARGEBACK_FRAUD', 'ORDER_VELOCITY_EXCEEDED', 'SUSPICIOUS_ORDER_PATTERN');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'PICKED_UP', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FunnelStep" AS ENUM ('VIEW', 'ADD_TO_CART', 'CHECKOUT', 'PURCHASE');

-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPER_ADMIN', 'PLATFORM_MANAGER', 'ADMIN', 'USER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'DOWN', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "HourScheduleType" AS ENUM ('REGULAR', 'OVERRIDE', 'HOLIDAY', 'SPECIAL_EVENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED', 'BACKORDERED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceEventType" AS ENUM ('CREATED', 'SENT', 'VIEWED', 'PAYMENT_ATTEMPTED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'REMINDER_SENT', 'VOIDED', 'REFUNDED', 'ADJUSTED', 'LOCKED', 'PDF_GENERATED');

-- CreateEnum
CREATE TYPE "InvoiceSchedule" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUALLY', 'MILESTONE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'UNCOLLECTIBLE', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SUBSCRIPTION', 'ONE_TIME', 'USAGE_BASED', 'MILESTONE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "JobHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'CRITICAL');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('CRON', 'RECURRING', 'ONE_TIME', 'EVENT_DRIVEN');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('PAYMENT', 'REFUND', 'WALLET_CREDIT', 'WALLET_DEBIT', 'ADJUSTMENT', 'FEE');

-- CreateEnum
CREATE TYPE "LimitType" AS ENUM ('HARD', 'SOFT', 'THROTTLED');

-- CreateEnum
CREATE TYPE "LineItemType" AS ENUM ('SUBSCRIPTION', 'PRODUCT', 'SERVICE', 'ADDON', 'SETUP_FEE', 'USAGE', 'ADJUSTMENT', 'DISCOUNT', 'TAX', 'SHIPPING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MenuEntityType" AS ENUM ('CATEGORY', 'PRODUCT', 'OPTION_GROUP', 'OPTION');

-- CreateEnum
CREATE TYPE "MenuEventType" AS ENUM ('MENU_OPENED', 'CATEGORY_VIEWED', 'PRODUCT_VIEWED', 'PRODUCT_ADDED_TO_CART', 'PRODUCT_REMOVED_FROM_CART', 'SEARCH_PERFORMED', 'FILTER_APPLIED', 'CHECKOUT_STARTED', 'MENU_VIEW', 'MENU_SEARCH', 'CATEGORY_VIEW', 'CATEGORY_EXPAND', 'PRODUCT_VIEW', 'PRODUCT_ADD_TO_CART', 'PRODUCT_REMOVE_FROM_CART', 'OPTION_SELECTED', 'FAVORITE_ADDED', 'FAVORITE_REMOVED', 'SORT_APPLIED');

-- CreateEnum
CREATE TYPE "MenuSnapshotReason" AS ENUM ('AUTO', 'PRODUCT_CHANGE', 'CATEGORY_CHANGE', 'AVAILABILITY_CHANGE', 'STORE_OPEN', 'ADMIN_PREVIEW');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN', 'WASTE', 'TRANSFER', 'DAMAGE');

-- CreateEnum
CREATE TYPE "NormalizedProviderError" AS ENUM ('INSUFFICIENT_FUNDS', 'CARD_DECLINED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'FRAUD_SUSPECTED', 'AUTHENTICATION_REQUIRED', 'CARD_EXPIRED', 'INVALID_AMOUNT', 'NETWORK_ERROR', 'INVALID_CVV', 'AMOUNT_TOO_LARGE', 'AMOUNT_TOO_SMALL', 'CURRENCY_NOT_SUPPORTED', 'DUPLICATE_TRANSACTION', 'WALLET_DISABLED', 'UNKNOWN_ERROR');

-- CreateEnum
CREATE TYPE "OTPMethod" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'VOICE');

-- CreateEnum
CREATE TYPE "OptionDisplayStyle" AS ENUM ('LIST', 'GRID', 'RADIO', 'CHECKBOX', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'PAYMENT_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'CURBSIDE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "OverrideTarget" AS ENUM ('TENANT', 'USER', 'STORE');

-- CreateEnum
CREATE TYPE "PaymentFlow" AS ENUM ('CASHIER', 'PROVIDER');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'LOCKED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'CARD_TERMINAL', 'STRIPE', 'WALLET', 'BANK_TRANSFER', 'APPLE_PAY', 'GOOGLE_PAY');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'WALLET', 'CASH', 'CARD_TERMINAL', 'EVC_PLUS', 'ZAAD', 'EDAHAB', 'MPESA');

-- CreateEnum
CREATE TYPE "PaymentSnapshotStatus" AS ENUM ('PENDING', 'CAPTURED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'COMPLETED', 'PAID', 'FAILED', 'CANCELLED', 'VOIDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'EXPIRED', 'RETRYING');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PayrollPeriodType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'EXPORTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'MANAGE', 'APPROVE');

-- CreateEnum
CREATE TYPE "PermissionCategory" AS ENUM ('PRODUCTS', 'ORDERS', 'PAYMENTS', 'USERS', 'ANALYTICS', 'SETTINGS', 'SECURITY', 'SYSTEM', 'TENANT', 'STORE');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('GLOBAL', 'TENANT', 'STORE', 'OWN');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STARTER', 'STANDARD', 'PROFESSIONAL', 'PREMIUM', 'ENTERPRISE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('SUBSCRIPTION', 'USAGE_BASED', 'HYBRID', 'ONE_TIME', 'FREEMIUM');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WEB', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "PoolPeriodType" AS ENUM ('SHIFT', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('OPEN', 'CALCULATED', 'DISTRIBUTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('EQUAL_SPLIT', 'HOURS_WEIGHTED', 'PERFORMANCE_WEIGHTED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ProrationBehavior" AS ENUM ('CREATE_PRORATIONS', 'NONE', 'ALWAYS_INVOICE');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RECONCILED', 'NEEDS_REVIEW', 'HAS_DISCREPANCY', 'RESOLVED', 'ESCALATED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'REFUNDED', 'FAILED', 'PENDING', 'APPROVED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ReplayStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ResetInterval" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'BILLING_CYCLE', 'NEVER');

-- CreateEnum
CREATE TYPE "RestrictionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('BLOCK_ALL_PAYMENTS', 'BLOCK_CARD_PAYMENTS', 'BLOCK_WALLET_PAYMENTS', 'DISABLE_RETRY', 'REQUIRE_MANUAL_REVIEW', 'LIMIT_TRANSACTION_AMOUNT', 'LIMIT_DAILY_VOLUME', 'REQUIRE_3DS', 'BLOCK_REFUNDS');

-- CreateEnum
CREATE TYPE "RetryStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "RetryStrategy" AS ENUM ('LINEAR', 'EXPONENTIAL', 'FIBONACCI');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('APPROVED', 'DISPUTED', 'CORRECTED', 'FRAUD_CONFIRMED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "RevokeReason" AS ENUM ('USER_LOGOUT', 'ADMIN_REVOKE', 'TOKEN_ROTATION', 'SUSPICIOUS_ACTIVITY', 'PASSWORD_CHANGED', 'TOKEN_REUSE_DETECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RolloutType" AS ENUM ('BOOLEAN', 'PERCENTAGE', 'TARGETED', 'MULTIVARIATE');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('WEATHER_BASED', 'CAPACITY_BASED', 'DEMAND_BASED', 'STAFF_BASED', 'INVENTORY_BASED', 'EVENT_BASED', 'EMERGENCY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('PENDING', 'EXECUTED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('RECURRING', 'PLAN_CHANGE', 'PRICE_CHANGE', 'QUANTITY_CHANGE', 'CANCELLATION', 'PAUSE', 'RESUME');

-- CreateEnum
CREATE TYPE "SecretStatus" AS ENUM ('PENDING', 'ACTIVE', 'ROTATING', 'EXPIRED', 'REVOKED', 'COMPROMISED');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('BRUTE_FORCE', 'CREDENTIAL_STUFFING', 'ACCOUNT_TAKEOVER', 'PRIVILEGE_ESCALATION', 'DATA_EXFILTRATION', 'SUSPICIOUS_LOGIN', 'IMPOSSIBLE_TRAVEL', 'RATE_LIMIT_HIT', 'MALICIOUS_PAYLOAD');

-- CreateEnum
CREATE TYPE "SelectionType" AS ENUM ('SINGLE', 'MULTIPLE', 'QUANTITY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('PLATFORM', 'TENANT');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY', 'ENCRYPTED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('REGULAR', 'OVERTIME', 'COVER', 'TRAINING');

-- CreateEnum
CREATE TYPE "SignatureAlgorithm" AS ENUM ('SHA256', 'SHA512');

-- CreateEnum
CREATE TYPE "SnapshotPeriodType" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "SnapshotReason" AS ENUM ('SCHEDULED_BACKUP', 'PRICE_CHANGE', 'MENU_UPDATE', 'PRODUCT_ADDED', 'PRODUCT_REMOVED', 'PRE_ORDER_CAPTURE', 'AUDIT_TRAIL', 'MANUAL_TRIGGER', 'ROLLBACK', 'PAYMENT_CREATED', 'PAYMENT_CAPTURED', 'PAYMENT_REFUNDED', 'DISPUTE_OPENED', 'COMPLIANCE', 'PAYMENT_DECLARED', 'PAYMENT_VERIFIED', 'PAYMENT_DISPUTED', 'PAYMENT_VOIDED', 'PAYMENT_RECONCILED', 'PAYMENT_CORRECTED', 'MANAGER_OVERRIDE', 'SYSTEM_AUTO_VERIFY', 'REFUND_ISSUED', 'FRAUD_DETECTED', 'MANUAL', 'AUTO', 'AVAILABILITY_CHANGE', 'ADMIN_PREVIEW');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('PENDING', 'CALCULATING', 'COMPLETED', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('MANUAL', 'AUTO_ON_CHANGE', 'SCHEDULED', 'ADMIN_PREVIEW');

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('GOOGLE', 'APPLE', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('UNITS', 'KILOGRAMS', 'GRAMS', 'LITERS', 'MILLILITERS', 'PIECES');

-- CreateEnum
CREATE TYPE "StoreRole" AS ENUM ('ADMIN', 'MANAGER', 'STORE_MANAGER', 'SHIFT_SUPERVISOR', 'CASHIER', 'BARISTA', 'KITCHEN_STAFF', 'STAFF');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubscriptionEvent" AS ENUM ('CREATED', 'MIGRATED', 'CANCELED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('CREATED', 'ACTIVATED', 'TRIAL_STARTED', 'TRIAL_ENDING', 'TRIAL_ENDED', 'RENEWED', 'PLAN_CHANGED', 'PRICE_CHANGED', 'QUANTITY_CHANGED', 'UPGRADED', 'DOWNGRADED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'PAYMENT_ACTION_REQUIRED', 'CANCELLED', 'CANCELLATION_SCHEDULED', 'PAUSED', 'RESUMED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'UNPAID', 'PAUSED', 'PENDING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('TENANT_ADMIN', 'REGIONAL_MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'REUSED');

-- CreateEnum
CREATE TYPE "TierMode" AS ENUM ('GRADUATED', 'VOLUME');

-- CreateEnum
CREATE TYPE "TimeGranularity" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "TipMethod" AS ENUM ('CASH', 'CARD', 'APP');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'REUSED');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('LICENSED', 'METERED');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('MISSED_BREAK', 'LATE_BREAK', 'SHORT_BREAK', 'NO_BREAK');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('TOP_UP', 'PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "WalletTxnStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "WalletTxnType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'ORDER_REFUNDED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRODUCT_OUT_OF_STOCK', 'INVENTORY_LOW_STOCK', 'INVENTORY_OUT_OF_STOCK', 'INVENTORY_RESTOCKED', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PAYMENT_FAILED', 'STORE_OPENED', 'STORE_CLOSED', 'SYSTEM_ALERT', 'FRAUD_DETECTED');

-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('STRIPE', 'PAYPAL', 'SQUARE', 'SENDGRID', 'TWILIO', 'INTERNAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED', 'CIRCUIT_OPEN', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "User" (
    "uuid" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "passwordHash" TEXT,
    "password" TEXT,
    "pinHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "profilePhoto" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "emergencyRelation" TEXT,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "certifications" JSONB,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "lastDeviceId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'CUSTOMER',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isGloballyBanned" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "bannedBy" TEXT,
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpMethod" "OTPMethod" NOT NULL DEFAULT 'SMS',
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "emailTokenExpiry" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "timezone" TEXT DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "uuid" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "tokenFamily" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentTokenUuid" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedFrom" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "status" "TokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedReason" "RevokeReason",
    "reused" BOOLEAN NOT NULL DEFAULT false,
    "reusedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Session" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "refreshTokenUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "deviceId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "deviceFingerprint" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceOS" TEXT,
    "deviceBrowser" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "geoLocation" TEXT,
    "geoCountry" TEXT,
    "geoCity" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "suspiciousActivity" BOOLEAN NOT NULL DEFAULT false,
    "suspicionReason" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedReason" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceType" TEXT NOT NULL,
    "deviceOS" TEXT,
    "deviceBrowser" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "trustedAt" TIMESTAMP(3),
    "trustRevokedAt" TIMESTAMP(3),
    "trustRevokedBy" TEXT,
    "ipAddress" TEXT NOT NULL,
    "geoLocation" TEXT,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "BiometricAuth" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "biometricType" "BiometricType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricAuth_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "profilePicture" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "uuid" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "tenantSlug" TEXT,
    "email" TEXT,
    "otpCode" TEXT NOT NULL,
    "otpMethod" "OTPMethod" NOT NULL DEFAULT 'SMS',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceFingerprint" TEXT,
    "geoLocation" TEXT,
    "blockUntil" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "success" BOOLEAN,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userUuid" TEXT,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Admin2FA" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'SHA1',
    "digits" INTEGER NOT NULL DEFAULT 6,
    "period" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "backupCodes" JSONB,
    "backupCodesUsed" INTEGER NOT NULL DEFAULT 0,
    "recoveryEmail" TEXT,
    "recoveryPhone" TEXT,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin2FA_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "FraudEvent" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "orderUuid" TEXT,
    "paymentUuid" TEXT,
    "sessionUuid" TEXT,
    "type" "FraudType" NOT NULL,
    "category" "FraudCategory" NOT NULL DEFAULT 'AUTHENTICATION',
    "ipAddress" TEXT,
    "deviceFingerprint" TEXT,
    "userAgent" TEXT,
    "geoLocation" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "severity" "FraudSeverity" NOT NULL,
    "metadata" JSONB,
    "status" "FraudStatus" NOT NULL DEFAULT 'PENDING',
    "actionTaken" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "eventType" "SecurityEventType" NOT NULL,
    "severity" "RiskLevel" NOT NULL,
    "userUuid" TEXT,
    "sessionUuid" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceFingerprint" TEXT,
    "description" TEXT NOT NULL,
    "details" JSONB,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "IPWhitelist" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "ipRange" TEXT,
    "description" TEXT,
    "allowedFor" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IPWhitelist_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "FraudIPAddress" (
    "uuid" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudIPAddress_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "actorUuid" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityUuid" TEXT,
    "category" "AuditCategory" NOT NULL,
    "performedBy" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetUuid" TEXT,
    "targetName" TEXT,
    "changesBefore" JSONB,
    "changesAfter" JSONB,
    "changeSummary" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "geoLocation" TEXT,
    "requestUuid" TEXT,
    "sessionUuid" TEXT,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userUuid" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PaymentAuditSnapshot" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "paymentUuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "reason" "SnapshotReason" NOT NULL,
    "triggeredBy" TEXT,
    "triggeredByRole" TEXT,
    "beforeStatus" "PaymentStatus",
    "afterStatus" "PaymentStatus" NOT NULL,
    "paymentState" JSONB NOT NULL,
    "orderState" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditSnapshot_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Role" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Permission" (
    "uuid" TEXT NOT NULL,
    "key" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "isSystemLevel" BOOLEAN NOT NULL DEFAULT false,
    "requiresMFA" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "isSystemPermission" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "uuid" TEXT NOT NULL,
    "roleUuid" TEXT NOT NULL,
    "permissionUuid" TEXT NOT NULL,
    "permissionId" TEXT,
    "scope" "PermissionScope" NOT NULL DEFAULT 'TENANT',
    "conditions" JSONB,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "permissionUuid" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TemporaryPermission" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "permissionUuid" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "usedFor" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemporaryPermission_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerUuid" TEXT NOT NULL,
    "businessName" TEXT,
    "taxUuid" TEXT,
    "industry" TEXT,
    "maxStores" INTEGER NOT NULL DEFAULT 1,
    "maxUsers" INTEGER NOT NULL DEFAULT 10,
    "maxOrders" INTEGER NOT NULL DEFAULT 1000,
    "billingEmail" TEXT,
    "billingAddress" JSONB,
    "features" JSONB NOT NULL DEFAULT '{}',
    "allowedIPs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TenantUser" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'STAFF',
    "displayName" TEXT,
    "employeeId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'PART_TIME',
    "payRate" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "paymentLocked" BOOLEAN NOT NULL DEFAULT false,
    "paymentLockedReason" TEXT,
    "paymentLockedAt" TIMESTAMP(3),
    "paymentLockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "walletUuid" TEXT,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TenantInvitation" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "storeAccess" JSONB,
    "invitedBy" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TenantSettings" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "serviceChargeRate" INTEGER NOT NULL DEFAULT 0,
    "orderAutoCompleteMinutes" INTEGER NOT NULL DEFAULT 30,
    "orderAutoCancelMinutes" INTEGER NOT NULL DEFAULT 15,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "businessHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Store" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "phone" TEXT,
    "email" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "serviceChargeRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Store_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "uuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "autoAcceptOrders" BOOLEAN NOT NULL DEFAULT false,
    "orderPrepTimeMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxOrdersPerHour" INTEGER NOT NULL DEFAULT 100,
    "allowPreorders" BOOLEAN NOT NULL DEFAULT false,
    "requireTableNumber" BOOLEAN NOT NULL DEFAULT false,
    "minimumOrderAmount" INTEGER,
    "deliveryFee" INTEGER,
    "deliveryRadius" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreOpeningHour" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "scheduleType" "HourScheduleType" NOT NULL DEFAULT 'REGULAR',
    "dayOfWeek" "DayOfWeek",
    "specificDate" TIMESTAMP(3),
    "periods" JSONB NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "is24Hours" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closesNextDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "notes" TEXT,
    "maxCapacity" INTEGER,
    "maxOrders" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMinuteChange" BOOLEAN NOT NULL DEFAULT false,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOpeningHour_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreCapacity" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "capacityType" "CapacityType" NOT NULL,
    "maxCapacity" INTEGER NOT NULL,
    "currentCapacity" INTEGER NOT NULL DEFAULT 0,
    "dayOfWeek" "DayOfWeek",
    "startTime" TEXT,
    "endTime" TEXT,
    "specificDate" TIMESTAMP(3),
    "alertThreshold" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCapacity_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreHourException" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "exceptionDate" TIMESTAMP(3) NOT NULL,
    "exceptionType" "ExceptionType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "is24Hours" BOOLEAN NOT NULL DEFAULT false,
    "customHours" JSONB,
    "notifyCustomers" BOOLEAN NOT NULL DEFAULT true,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notificationDate" TIMESTAMP(3),
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreHourException_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreAvailabilityCache" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "currentOrders" INTEGER NOT NULL DEFAULT 0,
    "maxOrders" INTEGER NOT NULL,
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "estimatedWaitMin" INTEGER,
    "unavailableReason" TEXT,
    "lastCalculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreAvailabilityCache_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreOpsMetrics" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "stalePreparingOrders" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOpsMetrics_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "BusinessHourRule" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggered" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessHourRule_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "UserStore" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "tenantUserUuid" TEXT,
    "tenantUuid" TEXT NOT NULL,
    "role" "StoreRole" NOT NULL DEFAULT 'CASHIER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canAccessPOS" BOOLEAN NOT NULL DEFAULT true,
    "canOpenDrawer" BOOLEAN NOT NULL DEFAULT false,
    "canCloseDrawer" BOOLEAN NOT NULL DEFAULT false,
    "canManageStaff" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "transferredFrom" TEXT,
    "transferDate" TIMESTAMP(3),
    "transferReason" TEXT,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'FULL',
    "permissions" JSONB,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStore_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantUserUuid" TEXT,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "UserDevice" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pushToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Category" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "parentUuid" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "iconUrl" TEXT,
    "color" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "alwaysVisible" BOOLEAN NOT NULL DEFAULT true,
    "availableDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeSlots" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "CategoryAvailability" (
    "uuid" TEXT NOT NULL,
    "categoryUuid" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryAvailability_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "CategoryDailyMetrics" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "categoryUuid" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "itemsSold" INTEGER NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryDailyMetrics_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Product" (
    "uuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "categoryUuid" TEXT,
    "tags" TEXT[],
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "basePrice" INTEGER NOT NULL,
    "pricingTiers" JSONB,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "imageUrls" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "calories" INTEGER,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietaryInfo" JSONB,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "lowStockThreshold" INTEGER,
    "currentStock" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "deletedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastPublishedAt" TIMESTAMP(3),
    "searchVector" TEXT,
    "visibleOnMenu" BOOLEAN NOT NULL DEFAULT true,
    "visibleOnline" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "preparationTime" INTEGER,
    "minOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "maxOrderQuantity" INTEGER,
    "dailyLimit" INTEGER,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "availableDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeSlots" JSONB,
    "searchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lastOrderedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ProductOptionGroup" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "optionGroupUuid" TEXT NOT NULL,
    "isRequired" BOOLEAN,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "multiSelect" BOOLEAN NOT NULL DEFAULT false,
    "minSelections" INTEGER,
    "maxSelections" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "displayStyle" "OptionDisplayStyle" NOT NULL DEFAULT 'LIST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "optionGroupUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "extraCost" INTEGER NOT NULL,
    "discountedCost" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER,
    "lowStockThreshold" INTEGER,
    "dailyLimit" INTEGER,
    "maxPerOrder" INTEGER,
    "calorieAdjustment" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ProductAvailability" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL DEFAULT 'RECURRING',
    "dayOfWeek" INTEGER,
    "startTime" TEXT,
    "endTime" TEXT,
    "specificDate" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER,
    "reason" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAvailability_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ProductSales" (
    "productUuid" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ProductSales_pkey" PRIMARY KEY ("productUuid","date")
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "tenantUserUuid" TEXT NOT NULL,
    "orderUuid" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "moderatedBy" TEXT,
    "moderationNotes" TEXT,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ProductDailyMetrics" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "revenueGross" INTEGER NOT NULL DEFAULT 0,
    "revenueNet" INTEGER NOT NULL DEFAULT 0,
    "avgSellingPrice" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "addToCartCount" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockAtStart" INTEGER,
    "stockAtEnd" INTEGER,
    "wasteCount" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDailyMetrics_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "selectionType" "SelectionType" NOT NULL DEFAULT 'SINGLE',
    "minSelections" INTEGER NOT NULL DEFAULT 0,
    "maxSelections" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Option" (
    "uuid" TEXT NOT NULL,
    "optionGroupUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "extraCost" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "currentStock" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "MenuSnapshot" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotType" "SnapshotType" NOT NULL DEFAULT 'MANUAL',
    "contentHash" TEXT NOT NULL,
    "categoriesHash" TEXT,
    "productsHash" TEXT,
    "pricesHash" TEXT,
    "categories" JSONB NOT NULL,
    "products" JSONB NOT NULL,
    "optionGroups" JSONB NOT NULL,
    "totalCategories" INTEGER NOT NULL,
    "totalProducts" INTEGER NOT NULL,
    "totalActiveProducts" INTEGER NOT NULL,
    "totalOptionGroups" INTEGER NOT NULL,
    "totalOptions" INTEGER NOT NULL,
    "reason" "SnapshotReason" NOT NULL,
    "triggeredBy" TEXT,
    "triggerEvent" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "previousVersionUuid" TEXT,
    "hasChanges" BOOLEAN,
    "changesSummary" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuSnapshot_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "MenuDiff" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "fromSnapshotUuid" TEXT NOT NULL,
    "toSnapshotUuid" TEXT NOT NULL,
    "totalChanges" INTEGER NOT NULL,
    "hasBreakingChanges" BOOLEAN NOT NULL DEFAULT false,
    "addedCategories" JSONB NOT NULL DEFAULT '[]',
    "removedCategories" JSONB NOT NULL DEFAULT '[]',
    "modifiedCategories" JSONB NOT NULL DEFAULT '[]',
    "addedProducts" JSONB NOT NULL DEFAULT '[]',
    "removedProducts" JSONB NOT NULL DEFAULT '[]',
    "modifiedProducts" JSONB NOT NULL DEFAULT '[]',
    "priceIncreases" JSONB NOT NULL DEFAULT '[]',
    "priceDecreases" JSONB NOT NULL DEFAULT '[]',
    "addedOptions" JSONB NOT NULL DEFAULT '[]',
    "removedOptions" JSONB NOT NULL DEFAULT '[]',
    "availabilityChanges" JSONB NOT NULL DEFAULT '[]',
    "affectedActiveOrders" INTEGER,
    "estimatedRevenueImpact" INTEGER,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuDiff_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "MenuCacheMetadata" (
    "uuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL,
    "lastInvalidated" TIMESTAMP(3) NOT NULL,
    "lastWarmed" TIMESTAMP(3),
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "cacheMisses" INTEGER NOT NULL DEFAULT 0,
    "avgLoadTime" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCacheMetadata_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "MenuAnalyticEvents" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "eventType" "MenuEventType" NOT NULL,
    "eventCategory" "EventCategory" NOT NULL,
    "entityType" "MenuEntityType",
    "entityUuid" TEXT,
    "entityName" TEXT,
    "userUuid" TEXT,
    "sessionId" TEXT,
    "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
    "deviceType" "DeviceType",
    "deviceId" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "ipAddress" TEXT,
    "country" TEXT,
    "city" TEXT,
    "timezone" TEXT,
    "metadata" JSONB,
    "productPrice" INTEGER,
    "quantity" INTEGER,
    "funnelStep" TEXT,
    "previousEvent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuAnalyticEvents_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "lastRestocked" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "reservedStock" INTEGER NOT NULL DEFAULT 0,
    "availableStock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "maxStock" INTEGER,
    "reorderPoint" INTEGER,
    "reorderQuantity" INTEGER,
    "unit" "StockUnit" NOT NULL DEFAULT 'UNITS',
    "lastPurchasePrice" INTEGER,
    "averageCost" INTEGER,
    "status" "InventoryStatus" NOT NULL DEFAULT 'IN_STOCK',
    "autoReorder" BOOLEAN NOT NULL DEFAULT false,
    "lastRestockedAt" TIMESTAMP(3),
    "lastRestockedBy" TEXT,
    "lastRestockQty" INTEGER,
    "lowStockAlertSent" BOOLEAN NOT NULL DEFAULT false,
    "outOfStockAlertSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "inventoryItemUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceUuid" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "inventoryItemUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "inventoryItemUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousQuantity" INTEGER,
    "newQuantity" INTEGER,
    "reason" TEXT NOT NULL,
    "orderUuid" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Order" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "tenantUserUuid" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "orderType" "OrderType" NOT NULL DEFAULT 'DINE_IN',
    "tableNumber" TEXT,
    "deliveryAddress" JSONB,
    "takenBy" TEXT,
    "preparedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "servedBy" TEXT,
    "tipAmount" INTEGER,
    "tipMethod" "TipMethod",
    "commissionableAmount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "serviceCharge" INTEGER NOT NULL DEFAULT 0,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "appliedPromos" JSONB,
    "taxBreakdown" JSONB,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "inventoryCommitted" BOOLEAN NOT NULL DEFAULT false,
    "inventoryReleased" BOOLEAN NOT NULL DEFAULT false,
    "estimatedReadyAt" TIMESTAMP(3),
    "actualReadyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "menuSnapshotUuid" TEXT,
    "menuVersion" INTEGER NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "customerNotes" TEXT,
    "kitchenNotes" TEXT,
    "internalNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "productUuid" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productImageUrl" TEXT,
    "categoryName" TEXT,
    "basePrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "selectedOptions" JSONB,
    "optionsCost" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "finalPrice" INTEGER NOT NULL,
    "taxRate" DECIMAL(5,4),
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "specialInstructions" TEXT,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
    "preparedBy" TEXT,
    "inventoryReserved" BOOLEAN NOT NULL DEFAULT false,
    "inventoryReleased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedBy" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "OrderDailyMetrics" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrders" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" INTEGER NOT NULL DEFAULT 0,
    "avgOrderValue" INTEGER NOT NULL DEFAULT 0,
    "avgPreparationTime" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDailyMetrics_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Payment" (
    "uuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "paymentFlow" "PaymentFlow" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "terminalId" TEXT,
    "ipAddress" TEXT,
    "amountTendered" INTEGER,
    "changeGiven" INTEGER,
    "receiptNumber" TEXT,
    "receiptPrinted" BOOLEAN NOT NULL DEFAULT false,
    "receiptPrintedAt" TIMESTAMP(3),
    "reconciledInReport" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationNotes" TEXT,
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "reviewOutcome" "ReviewOutcome",
    "correctedBy" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "originalAmount" INTEGER,
    "disputedBy" TEXT,
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "disputeResolution" TEXT,
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "provider" "PaymentProvider",
    "providerRef" TEXT,
    "clientSecret" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "retries" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "lastRetryAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failureCode" "NormalizedProviderError",
    "failureReason" TEXT,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "adminOverride" BOOLEAN NOT NULL DEFAULT false,
    "adminOverrideReason" TEXT,
    "adminOverrideBy" TEXT,
    "adminOverrideAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledBy" TEXT,
    "cancelledByUuid" TEXT,
    "snapshot" JSONB NOT NULL,
    "orderSnapshot" JSONB NOT NULL,
    "pricingRules" JSONB NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "fraudFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "drawerUuid" TEXT,
    "reconciliationReportUuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PaymentRisk" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "level" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "failedPayments" INTEGER NOT NULL DEFAULT 0,
    "chargebacks" INTEGER NOT NULL DEFAULT 0,
    "suspiciousActivity" INTEGER NOT NULL DEFAULT 0,
    "lastIncidentAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRisk_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PaymentRestriction" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "type" "RestrictionType" NOT NULL,
    "severity" "RestrictionSeverity" NOT NULL DEFAULT 'MEDIUM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "appliesToMethods" "PaymentMethod"[] DEFAULT ARRAY[]::"PaymentMethod"[],
    "maxAmount" INTEGER,
    "reason" TEXT NOT NULL,
    "triggerEvent" TEXT,
    "evidenceRef" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "canBeOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overriddenBy" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "overrideReason" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRestriction_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PaymentAnomaly" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "paymentUuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "anomalyType" "AnomalyType" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL DEFAULT 'MEDIUM',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "detectionMethod" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "expectedValue" JSONB,
    "actualValue" JSONB,
    "variance" DECIMAL(10,2),
    "status" "AnomalyStatus" NOT NULL DEFAULT 'PENDING',
    "autoResolved" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAnomaly_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PaymentDispute" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "paymentUuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerDisputeUuid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" "DisputeReason" NOT NULL,
    "reasonCode" TEXT,
    "status" "DisputeStatus" NOT NULL,
    "evidenceRequired" JSONB,
    "evidenceSubmitted" JSONB,
    "evidenceDueBy" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" "DisputeResolution",
    "resolutionNotes" TEXT,
    "chargedBackAmount" INTEGER,
    "chargedBackAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentDispute_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "CashDrawer" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "userUuid" TEXT,
    "terminalId" TEXT,
    "drawerNumber" TEXT,
    "sessionStart" TIMESTAMP(3),
    "sessionEnd" TIMESTAMP(3),
    "status" "DrawerStatus" NOT NULL DEFAULT 'CLOSED',
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "startingCash" INTEGER NOT NULL DEFAULT 0,
    "openedBy" TEXT,
    "openedAt" TIMESTAMP(3),
    "expectedCash" INTEGER NOT NULL DEFAULT 0,
    "expectedCard" INTEGER NOT NULL DEFAULT 0,
    "actualCash" INTEGER,
    "actualCard" INTEGER,
    "countedBy" TEXT,
    "countedAt" TIMESTAMP(3),
    "cashVariance" INTEGER NOT NULL DEFAULT 0,
    "cardVariance" INTEGER NOT NULL DEFAULT 0,
    "variance" INTEGER,
    "varianceApproved" BOOLEAN NOT NULL DEFAULT false,
    "varianceApprovedBy" TEXT,
    "cashSalesCount" INTEGER NOT NULL DEFAULT 0,
    "cardSalesCount" INTEGER NOT NULL DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "cashSales" INTEGER,
    "refunds" INTEGER,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "closingNotes" TEXT,
    "depositAmount" INTEGER,
    "depositedBy" TEXT,
    "depositedAt" TIMESTAMP(3),
    "depositReference" TEXT,
    "notes" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashDrawer_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "CashDrop" (
    "uuid" TEXT NOT NULL,
    "cashDrawerUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "droppedBy" TEXT NOT NULL,
    "droppedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL DEFAULT 'Excess cash removal',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDrop_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "uuid" TEXT NOT NULL,
    "cashDrawerUuid" TEXT NOT NULL,
    "countType" "CountType" NOT NULL DEFAULT 'CLOSE',
    "countedBy" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pennies" INTEGER NOT NULL DEFAULT 0,
    "nickels" INTEGER NOT NULL DEFAULT 0,
    "dimes" INTEGER NOT NULL DEFAULT 0,
    "quarters" INTEGER NOT NULL DEFAULT 0,
    "ones" INTEGER NOT NULL DEFAULT 0,
    "fives" INTEGER NOT NULL DEFAULT 0,
    "tens" INTEGER NOT NULL DEFAULT 0,
    "twenties" INTEGER NOT NULL DEFAULT 0,
    "fifties" INTEGER NOT NULL DEFAULT 0,
    "hundreds" INTEGER NOT NULL DEFAULT 0,
    "totalCoins" INTEGER NOT NULL,
    "totalBills" INTEGER NOT NULL,
    "totalCash" INTEGER NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "ourPaymentCount" INTEGER NOT NULL,
    "ourPaymentTotal" INTEGER NOT NULL,
    "ourRefundCount" INTEGER NOT NULL,
    "ourRefundTotal" INTEGER NOT NULL,
    "ourNetTotal" INTEGER NOT NULL,
    "providerPaymentCount" INTEGER NOT NULL,
    "providerPaymentTotal" INTEGER NOT NULL,
    "providerRefundCount" INTEGER NOT NULL,
    "providerRefundTotal" INTEGER NOT NULL,
    "providerNetTotal" INTEGER NOT NULL,
    "paymentCountVariance" INTEGER NOT NULL DEFAULT 0,
    "paymentAmountVariance" INTEGER NOT NULL DEFAULT 0,
    "refundCountVariance" INTEGER NOT NULL DEFAULT 0,
    "refundAmountVariance" INTEGER NOT NULL DEFAULT 0,
    "netVariance" INTEGER NOT NULL DEFAULT 0,
    "hasDiscrepancy" BOOLEAN NOT NULL DEFAULT false,
    "discrepancyDetails" JSONB,
    "missingInOurSystem" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingInProvider" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "providerReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT,
    "response" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "debitAccount" TEXT NOT NULL,
    "creditAccount" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refUuid" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "paymentUuid" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "providerPayoutId" TEXT,
    "grossAmount" INTEGER NOT NULL,
    "providerFee" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedSettlementAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Refund" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "orderUuid" TEXT NOT NULL,
    "paymentUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "type" "RefundType" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "snapshot" JSONB NOT NULL,
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "DailyReconciliation" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "ordersCount" INTEGER NOT NULL,
    "ordersTotal" INTEGER NOT NULL,
    "cashDeclared" INTEGER NOT NULL DEFAULT 0,
    "cardDeclared" INTEGER NOT NULL DEFAULT 0,
    "walletDeclared" INTEGER NOT NULL DEFAULT 0,
    "totalDeclared" INTEGER NOT NULL DEFAULT 0,
    "cashCounted" INTEGER,
    "cardReceipts" INTEGER,
    "providerTotal" INTEGER NOT NULL DEFAULT 0,
    "cashVariance" INTEGER NOT NULL DEFAULT 0,
    "cardVariance" INTEGER NOT NULL DEFAULT 0,
    "totalVariance" INTEGER NOT NULL DEFAULT 0,
    "variancePercent" DECIMAL(5,2) NOT NULL,
    "hasVariance" BOOLEAN NOT NULL DEFAULT false,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "missingPayments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extraPayments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disputedPayments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "reconciledBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReconciliation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxBalance" INTEGER,
    "minBalance" INTEGER NOT NULL DEFAULT 0,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastTxnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "walletUuid" TEXT NOT NULL,
    "type" "WalletTxnType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" TEXT NOT NULL,
    "refUuid" TEXT,
    "status" "WalletTxnStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Shift" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL DEFAULT 'REGULAR',
    "role" "StoreRole" NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "requiredBreaks" INTEGER NOT NULL DEFAULT 0,
    "breakDuration" INTEGER NOT NULL DEFAULT 30,
    "status" "ShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "shiftUuid" TEXT,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "clockInDevice" TEXT NOT NULL,
    "clockInLat" DOUBLE PRECISION,
    "clockInLng" DOUBLE PRECISION,
    "clockInDistanceM" DOUBLE PRECISION,
    "clockOutDevice" TEXT,
    "clockOutLat" DOUBLE PRECISION,
    "clockOutLng" DOUBLE PRECISION,
    "clockOutDistanceM" DOUBLE PRECISION,
    "hoursWorked" DOUBLE PRECISION,
    "breakMinutes" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalReason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "payRate" INTEGER,
    "totalPay" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "syncConflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "BreakEntry" (
    "uuid" TEXT NOT NULL,
    "timeEntryUuid" TEXT NOT NULL,
    "shiftUuid" TEXT,
    "breakStart" TIMESTAMP(3) NOT NULL,
    "breakEnd" TIMESTAMP(3),
    "breakType" "BreakType" NOT NULL DEFAULT 'UNPAID',
    "duration" INTEGER,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakEntry_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "BreakPolicy" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minShiftHours" DOUBLE PRECISION NOT NULL,
    "breakType" "BreakType" NOT NULL,
    "breakDuration" INTEGER NOT NULL,
    "isPaid" BOOLEAN NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 15,
    "allowSkip" BOOLEAN NOT NULL DEFAULT false,
    "earlyClockInGrace" INTEGER NOT NULL DEFAULT 5,
    "lateClockInGrace" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakPolicy_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "BreakViolation" (
    "uuid" TEXT NOT NULL,
    "timeEntryUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "breakPolicyUuid" TEXT NOT NULL,
    "violationType" "ViolationType" NOT NULL,
    "expectedBreakAt" TIMESTAMP(3) NOT NULL,
    "actualBreakAt" TIMESTAMP(3),
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "waived" BOOLEAN NOT NULL DEFAULT false,
    "waivedBy" TEXT,
    "waivedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakViolation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ShiftSwapRequest" (
    "uuid" TEXT NOT NULL,
    "shiftUuid" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedWith" TEXT,
    "reason" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING',
    "managerApproved" BOOLEAN NOT NULL DEFAULT false,
    "managerUuid" TEXT,
    "managerNotes" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ShiftAnnouncement" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "targetRoles" "StoreRole"[] DEFAULT ARRAY[]::"StoreRole"[],
    "targetUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeUntil" TIMESTAMP(3),
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAnnouncement_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StaffTask" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiresVerification" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "completionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StaffPerformance" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" "PeriodType" NOT NULL DEFAULT 'DAILY',
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "ordersCancelled" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" INTEGER NOT NULL DEFAULT 0,
    "avgOrderValue" INTEGER NOT NULL DEFAULT 0,
    "upsellsCount" INTEGER NOT NULL DEFAULT 0,
    "hoursWorked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateArrivals" INTEGER NOT NULL DEFAULT 0,
    "missedShifts" INTEGER NOT NULL DEFAULT 0,
    "refundsGiven" INTEGER NOT NULL DEFAULT 0,
    "voidsCreated" INTEGER NOT NULL DEFAULT 0,
    "complaints" INTEGER NOT NULL DEFAULT 0,
    "cashVariance" INTEGER,
    "cashShortages" INTEGER NOT NULL DEFAULT 0,
    "cashOverages" INTEGER NOT NULL DEFAULT 0,
    "tipsReceived" INTEGER,
    "performanceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPerformance_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StaffApprovalRequest" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvalType" "ApprovalType" NOT NULL,
    "requestData" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvalNotes" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffApprovalRequest_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TipPool" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" "PoolPeriodType" NOT NULL DEFAULT 'DAILY',
    "totalTips" INTEGER NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "distributionMethod" "DistributionMethod" NOT NULL DEFAULT 'EQUAL_SPLIT',
    "totalHoursWorked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PoolStatus" NOT NULL DEFAULT 'OPEN',
    "calculatedAt" TIMESTAMP(3),
    "distributedAt" TIMESTAMP(3),
    "distributedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipPool_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TipDistribution" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "tipPoolUuid" TEXT,
    "userUuid" TEXT,
    "hoursWorked" DOUBLE PRECISION,
    "ordersServed" INTEGER NOT NULL DEFAULT 0,
    "tipAmount" INTEGER,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "paymentMethod" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "poolType" "PoolType" NOT NULL DEFAULT 'EQUAL_SPLIT',
    "totalTips" INTEGER NOT NULL,
    "distributions" JSONB NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "distributedBy" TEXT,
    "distributedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipDistribution_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Commission" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" "CommissionPeriodType" NOT NULL DEFAULT 'MONTHLY',
    "totalSales" INTEGER NOT NULL,
    "commissionableAmount" INTEGER NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "salesTarget" INTEGER,
    "targetMet" BOOLEAN NOT NULL DEFAULT false,
    "bonusAmount" INTEGER NOT NULL DEFAULT 0,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" "PayrollPeriodType" NOT NULL DEFAULT 'BIWEEKLY',
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRegularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalOvertimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGrossPay" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3),
    "calculatedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "exportedAt" TIMESTAMP(3),
    "exportedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "uuid" TEXT NOT NULL,
    "payrollPeriodUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regularRate" INTEGER NOT NULL,
    "overtimeRate" INTEGER NOT NULL,
    "regularPay" INTEGER NOT NULL DEFAULT 0,
    "overtimePay" INTEGER NOT NULL DEFAULT 0,
    "tipIncome" INTEGER NOT NULL DEFAULT 0,
    "commissionIncome" INTEGER NOT NULL DEFAULT 0,
    "bonuses" INTEGER NOT NULL DEFAULT 0,
    "grossPay" INTEGER NOT NULL DEFAULT 0,
    "deductions" JSONB,
    "netPay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PayrollExport" (
    "uuid" TEXT NOT NULL,
    "payrollPeriodUuid" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "recordCount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "exportedBy" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollExport_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "LaborCostSnapshot" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "periodType" "SnapshotPeriodType" NOT NULL DEFAULT 'HOURLY',
    "scheduledStaff" INTEGER NOT NULL DEFAULT 0,
    "clockedInStaff" INTEGER NOT NULL DEFAULT 0,
    "totalLaborHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" INTEGER NOT NULL DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "laborCostPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesPerLaborHour" INTEGER NOT NULL DEFAULT 0,
    "isOverBudget" BOOLEAN NOT NULL DEFAULT false,
    "budgetVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborCostSnapshot_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "LaborBudget" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "targetLaborPercent" DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    "maxLaborPercent" DOUBLE PRECISION NOT NULL DEFAULT 35.0,
    "mondayTarget" DOUBLE PRECISION,
    "tuesdayTarget" DOUBLE PRECISION,
    "wednesdayTarget" DOUBLE PRECISION,
    "thursdayTarget" DOUBLE PRECISION,
    "fridayTarget" DOUBLE PRECISION,
    "saturdayTarget" DOUBLE PRECISION,
    "sundayTarget" DOUBLE PRECISION,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborBudget_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreDailyMetrics" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ordersTotal" INTEGER NOT NULL DEFAULT 0,
    "ordersCompleted" INTEGER NOT NULL DEFAULT 0,
    "ordersCancelled" INTEGER NOT NULL DEFAULT 0,
    "ordersPending" INTEGER NOT NULL DEFAULT 0,
    "revenueGross" INTEGER NOT NULL DEFAULT 0,
    "revenueNet" INTEGER NOT NULL DEFAULT 0,
    "revenueTax" INTEGER NOT NULL DEFAULT 0,
    "revenueDiscount" INTEGER NOT NULL DEFAULT 0,
    "revenueRefunded" INTEGER NOT NULL DEFAULT 0,
    "paymentsSucceeded" INTEGER NOT NULL DEFAULT 0,
    "paymentsFailed" INTEGER NOT NULL DEFAULT 0,
    "avgPaymentValue" INTEGER NOT NULL DEFAULT 0,
    "uniqueCustomers" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "returningCustomers" INTEGER NOT NULL DEFAULT 0,
    "itemsSold" INTEGER NOT NULL DEFAULT 0,
    "avgItemsPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPrepTimeMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgWaitTimeMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peakHourStart" TEXT,
    "peakHourOrders" INTEGER,
    "activeStaffCount" INTEGER,
    "hourlyBreakdown" JSONB,
    "topProducts" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreDailyMetrics_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "HourlyRevenue" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "revenue" INTEGER NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HourlyRevenue_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "storeUuid" TEXT,
    "type" "AnalyticsType" NOT NULL,
    "granularity" "TimeGranularity" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "dimensions" JSONB,
    "previousPeriod" JSONB,
    "changePercent" DOUBLE PRECISION,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'COMPLETED',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculationTime" INTEGER,
    "recordCount" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Plan" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "tagline" TEXT,
    "tier" "PlanTier" NOT NULL DEFAULT 'STANDARD',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "planType" "PlanType" NOT NULL DEFAULT 'SUBSCRIPTION',
    "supportedIntervals" "BillingInterval"[],
    "defaultInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "trialEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "trialRequiresCard" BOOLEAN NOT NULL DEFAULT false,
    "highlightedFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ctaText" TEXT,
    "allowAddOns" BOOLEAN NOT NULL DEFAULT true,
    "includedAddOns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customPricingAvailable" BOOLEAN NOT NULL DEFAULT false,
    "contactSales" BOOLEAN NOT NULL DEFAULT false,
    "setupFee" INTEGER,
    "activationFee" INTEGER,
    "allowDowngrade" BOOLEAN NOT NULL DEFAULT true,
    "downgradeCooldown" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deprecatedAt" TIMESTAMP(3),

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlanPrice" (
    "uuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" "BillingInterval" NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "region" TEXT,
    "isPromo" BOOLEAN NOT NULL DEFAULT false,
    "promoLabel" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "compareToPrice" INTEGER,
    "savingsPercent" INTEGER,
    "usageType" "UsageType",
    "tierMode" "TierMode",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "uuid" TEXT NOT NULL,
    "planPriceUuid" TEXT NOT NULL,
    "upTo" INTEGER,
    "unitPrice" INTEGER NOT NULL,
    "flatFee" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlanFeature" (
    "uuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "featureName" TEXT NOT NULL,
    "description" TEXT,
    "type" "FeatureType" NOT NULL DEFAULT 'BOOLEAN',
    "enabled" BOOLEAN,
    "quantity" INTEGER,
    "textValue" TEXT,
    "category" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "uuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "quotas" JSONB,
    "changeDescription" TEXT,
    "changedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlanQuota" (
    "uuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "quotaKey" TEXT NOT NULL,
    "quotaName" TEXT NOT NULL,
    "limitType" "LimitType" NOT NULL DEFAULT 'HARD',
    "limit" INTEGER NOT NULL,
    "softLimit" INTEGER,
    "allowOverage" BOOLEAN NOT NULL DEFAULT false,
    "overageFee" INTEGER,
    "resetInterval" "ResetInterval",
    "enforced" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanQuota_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "UsageQuota" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "quotaKey" TEXT NOT NULL,
    "quotaName" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "resetInterval" "ResetInterval",
    "lastResetAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageQuota_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AddOn" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "AddOnType" NOT NULL DEFAULT 'FEATURE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "availableForPlans" TEXT[],
    "requiredPlan" TEXT,
    "maxQuantity" INTEGER,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "metadata" JSONB,
    "stripeProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AddOnPrice" (
    "uuid" TEXT NOT NULL,
    "addOnUuid" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amount" INTEGER NOT NULL,
    "billingType" "AddOnBillingType" NOT NULL DEFAULT 'RECURRING',
    "interval" "BillingInterval",
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "tierMode" "TierMode",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddOnPrice_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AddOnPriceTier" (
    "uuid" TEXT NOT NULL,
    "addOnPriceUuid" TEXT NOT NULL,
    "upTo" INTEGER,
    "unitPrice" INTEGER NOT NULL,
    "flatFee" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AddOnPriceTier_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AddOnUsageRecord" (
    "uuid" TEXT NOT NULL,
    "tenantAddOnUuid" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "action" TEXT,
    "metadata" JSONB,
    "stripeUsageRecordId" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddOnUsageRecord_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "TenantAddOn" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT,
    "addOnUuid" TEXT NOT NULL,
    "addOnPriceUuid" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "billingType" "AddOnBillingType" NOT NULL,
    "interval" "BillingInterval",
    "status" "AddOnStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "stripeSubscriptionItemId" TEXT,
    "usageThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "lastUsageReset" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAddOn_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "planVersionUuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "planPriceUuid" TEXT NOT NULL,
    "subscriptionNumber" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "currentPeriodAmount" INTEGER NOT NULL,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "isInTrial" BOOLEAN NOT NULL DEFAULT false,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "lastPaymentAt" TIMESTAMP(3),
    "nextPaymentAt" TIMESTAMP(3),
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amount" INTEGER NOT NULL,
    "intervalCount" INTEGER NOT NULL,
    "billingCycleAnchor" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedUntil" TIMESTAMP(3),
    "pauseReason" TEXT,
    "resumedAt" TIMESTAMP(3),
    "scheduledChange" JSONB,
    "paymentMethod" TEXT,
    "collectionMethod" "CollectionMethod" NOT NULL DEFAULT 'CHARGE_AUTOMATICALLY',
    "daysUntilDue" INTEGER,
    "appliedCouponCode" TEXT,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2),
    "discountEnd" TIMESTAMP(3),
    "taxPercent" DECIMAL(5,4),
    "taxExempt" BOOLEAN NOT NULL,
    "stripeCustomerUuid" TEXT,
    "stripeSubUuid" TEXT,
    "stripeStatus" TEXT,
    "metadata" JSONB,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SubscriptionUsageRecord" (
    "uuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "unitPrice" INTEGER,
    "action" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "stripeUsageRecordId" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionUsageRecord_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SubscriptionSchedule" (
    "uuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL,
    "newPlanUuid" TEXT,
    "newPriceUuid" TEXT,
    "newQuantity" INTEGER,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "prorate" BOOLEAN NOT NULL DEFAULT true,
    "prorationBehavior" "ProrationBehavior" NOT NULL DEFAULT 'CREATE_PRORATIONS',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "executedAt" TIMESTAMP(3),
    "reason" TEXT,
    "scheduledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionSchedule_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "uuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "eventType" "SubscriptionEventType" NOT NULL,
    "eventCategory" "EventCategory" NOT NULL DEFAULT 'LIFECYCLE',
    "changesBefore" JSONB,
    "changesAfter" JSONB,
    "oldPlanUuid" TEXT,
    "newPlanUuid" TEXT,
    "oldPriceUuid" TEXT,
    "newPriceUuid" TEXT,
    "oldAmount" INTEGER,
    "newAmount" INTEGER,
    "proratedAmount" INTEGER,
    "proratedCredit" INTEGER,
    "performedBy" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SubscriptionRetention" (
    "id" SERIAL NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "cohortMonth" TIMESTAMP(3) NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "retentionRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionRetention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSnapshot" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "planVersionUuid" TEXT NOT NULL,
    "billingMonth" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "planName" TEXT NOT NULL,
    "planSlug" TEXT NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "subscriptionBase" INTEGER NOT NULL,
    "addOnsTotal" INTEGER NOT NULL DEFAULT 0,
    "usageTotal" INTEGER NOT NULL DEFAULT 0,
    "discountsTotal" INTEGER NOT NULL DEFAULT 0,
    "creditsApplied" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "planSnapshot" JSONB NOT NULL,
    "addOnsSnapshot" JSONB NOT NULL,
    "usageSnapshot" JSONB,
    "discountsSnapshot" JSONB,
    "taxSnapshot" JSONB,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "invoiceGenerated" BOOLEAN NOT NULL DEFAULT false,
    "invoiceUuid" TEXT,
    "metadata" JSONB,
    "proratedAmount" INTEGER,
    "prorationDetails" JSONB,
    "baseAmount" INTEGER NOT NULL,
    "addonsSnapshot" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSnapshot_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "uuid" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "amountOff" INTEGER,
    "percentOff" DECIMAL(5,2),
    "duration" "CouponDuration" NOT NULL,
    "durationInMonths" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "maxRedemptionsPerCustomer" INTEGER DEFAULT 1,
    "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "minimumAmount" INTEGER,
    "applicablePlans" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstTimeOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stripeCouponId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "EnterpriseContract" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "customPlan" JSONB NOT NULL,
    "annualValue" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewalTermMonths" INTEGER,
    "invoiceSchedule" "InvoiceSchedule" NOT NULL,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "customQuotas" JSONB NOT NULL,
    "supportLevel" TEXT NOT NULL,
    "slaUptime" DECIMAL(5,2),
    "slaResponse" TEXT,
    "accountManager" TEXT,
    "technicalContact" JSONB,
    "billingContact" JSONB,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "signedDocumentUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseContract_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "billingSnapshotUuid" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "purchaseOrderNumber" TEXT,
    "type" "InvoiceType" NOT NULL DEFAULT 'SUBSCRIPTION',
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "billTo" JSONB NOT NULL,
    "billFrom" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "creditApplied" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "appliedDiscounts" JSONB,
    "appliedCredits" JSONB,
    "taxBreakdown" JSONB,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "taxExemptReason" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "paidMethod" TEXT,
    "paymentTerms" TEXT,
    "lateFeePolicy" JSONB,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerRef" TEXT,
    "providerData" JSONB,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "termsAndConditions" TEXT,
    "footerText" TEXT,
    "customFields" JSONB,
    "attemptedCollectionAt" TIMESTAMP(3),
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdBy" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "uuid" TEXT NOT NULL,
    "invoiceUuid" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "itemType" "LineItemType" NOT NULL DEFAULT 'SERVICE',
    "productUuid" TEXT,
    "planUuid" TEXT,
    "addOnUuid" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2),
    "subtotal" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "taxRate" DECIMAL(5,4),
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "metadata" JSONB,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "uuid" TEXT NOT NULL,
    "invoiceUuid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentProvider" TEXT,
    "providerRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "allocatedAmount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InvoiceAdjustment" (
    "uuid" TEXT NOT NULL,
    "invoiceUuid" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceUuid" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAdjustment_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "uuid" TEXT NOT NULL,
    "invoiceUuid" TEXT NOT NULL,
    "eventType" "InvoiceEventType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "actorUuid" TEXT,
    "actorType" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AdminAlert" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "alertType" "AlertType" NOT NULL,
    "category" "AlertCategory" NOT NULL DEFAULT 'SYSTEM',
    "level" "AlertLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "actionRequired" TEXT,
    "context" JSONB,
    "affectedEntity" TEXT,
    "affectedEntityId" TEXT,
    "source" "AlertSource" NOT NULL DEFAULT 'SYSTEM',
    "sourceRef" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "assignedTo" TEXT,
    "assignedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "resolutionTime" INTEGER,
    "snoozedUntil" TIMESTAMP(3),
    "snoozedBy" TEXT,
    "groupKey" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "parentAlertUuid" TEXT,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "priority" "AlertPriority" NOT NULL DEFAULT 'MEDIUM',
    "expiresAt" TIMESTAMP(3),
    "notificationsSent" JSONB,
    "lastNotifiedAt" TIMESTAMP(3),
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "escalatedTo" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AlertAction" (
    "uuid" TEXT NOT NULL,
    "alertUuid" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "notes" TEXT,
    "changes" JSONB,
    "result" TEXT,
    "successful" BOOLEAN,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertAction_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "storeUuid" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "EmailCategory" NOT NULL DEFAULT 'TRANSACTIONAL',
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "preheader" TEXT,
    "availableVars" JSONB NOT NULL,
    "sampleData" JSONB,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "localized" JSONB,
    "layout" TEXT,
    "cssInline" BOOLEAN NOT NULL DEFAULT true,
    "customCss" TEXT,
    "headerImageUrl" TEXT,
    "footerContent" TEXT,
    "brandingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "primaryColor" TEXT,
    "fontFamily" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentUuid" TEXT,
    "testRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastTestedAt" TIMESTAMP(3),
    "openRate" DOUBLE PRECISION,
    "clickRate" DOUBLE PRECISION,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastModifiedBy" TEXT,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "storeUuid" TEXT,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "preheader" TEXT,
    "templateKey" TEXT,
    "templateUuid" TEXT,
    "templateData" JSONB,
    "attachments" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "sendAfter" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "priority" "EmailPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "provider" "EmailProvider",
    "providerMessageId" TEXT,
    "providerResponse" JSONB,
    "lastError" TEXT,
    "errorType" TEXT,
    "errorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "uuid" TEXT NOT NULL,
    "emailUuid" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "eventData" JSONB,
    "providerEventId" TEXT,
    "provider" "EmailProvider",
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "deviceType" TEXT,
    "linkUrl" TEXT,
    "linkPosition" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT,
    "type" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SMSOutbox" (
    "uuid" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SMSOutbox_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PushNotificationOutbox" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushNotificationOutbox_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "uuid" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL DEFAULT 'PLATFORM',
    "tenantUuid" TEXT,
    "key" TEXT NOT NULL,
    "category" TEXT,
    "valueType" "SettingValueType" NOT NULL,
    "value" JSONB NOT NULL,
    "defaultValue" JSONB,
    "validationRules" JSONB,
    "possibleValues" JSONB,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "helpText" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "requiresRestart" BOOLEAN NOT NULL DEFAULT false,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousValue" JSONB,
    "updatedBy" TEXT,
    "updatedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SystemHealth" (
    "uuid" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "responseTime" INTEGER,
    "errorRate" DOUBLE PRECISION,
    "uptime" DOUBLE PRECISION,
    "lastError" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT,
    "metadata" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemHealth_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "BrandingSetting" (
    "uuid" TEXT NOT NULL,
    "scope" "BrandingScope" NOT NULL DEFAULT 'PLATFORM',
    "tenantUuid" TEXT,
    "storeUuid" TEXT,
    "name" TEXT,
    "logoUrl" TEXT,
    "logoLightUrl" TEXT,
    "logoDarkUrl" TEXT,
    "faviconUrl" TEXT,
    "bannerUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "backgroundColor" TEXT,
    "textColor" TEXT,
    "errorColor" TEXT,
    "successColor" TEXT,
    "warningColor" TEXT,
    "fontFamily" TEXT,
    "headingFont" TEXT,
    "appName" TEXT NOT NULL,
    "appTagline" TEXT,
    "companyName" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "contactUrl" TEXT,
    "websiteUrl" TEXT,
    "facebookUrl" TEXT,
    "twitterUrl" TEXT,
    "instagramUrl" TEXT,
    "linkedinUrl" TEXT,
    "termsUrl" TEXT,
    "privacyUrl" TEXT,
    "customCss" TEXT,
    "customHead" TEXT,
    "emailLogoUrl" TEXT,
    "emailHeader" TEXT,
    "emailFooter" TEXT,
    "appIconUrl" TEXT,
    "splashScreenUrl" TEXT,
    "theme" TEXT,
    "customTheme" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingSetting_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SettingHistory" (
    "uuid" TEXT NOT NULL,
    "settingUuid" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "changedBy" TEXT,
    "changeReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingHistory_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "uuid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "maxRequests" INTEGER NOT NULL,
    "windowSeconds" INTEGER NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedUntil" TIMESTAMP(3),
    "lastRequestAt" TIMESTAMP(3),
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "uuid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "scope" "FlagScope" NOT NULL DEFAULT 'GLOBAL',
    "tenantUuid" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutType" "RolloutType" NOT NULL DEFAULT 'BOOLEAN',
    "rolloutPercentage" INTEGER,
    "targetingRules" JSONB,
    "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blacklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "variants" JSONB,
    "enabledFrom" TIMESTAMP(3),
    "enabledUntil" TIMESTAMP(3),
    "requiresFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conflictsWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isDeprecated" BOOLEAN NOT NULL DEFAULT false,
    "deprecationDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "FeatureFlagEvaluation" (
    "uuid" TEXT NOT NULL,
    "flagUuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "userUuid" TEXT,
    "sessionId" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "variant" TEXT,
    "evaluationTime" INTEGER NOT NULL,
    "metadata" JSONB,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlagEvaluation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "FeatureFlagOverride" (
    "uuid" TEXT NOT NULL,
    "flagUuid" TEXT NOT NULL,
    "targetType" "OverrideTarget" NOT NULL,
    "targetUuid" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "variant" TEXT,
    "reason" TEXT,
    "setBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "DeadLetterJob" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "jobType" TEXT NOT NULL,
    "jobUuid" TEXT,
    "queueName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadSize" INTEGER,
    "error" TEXT NOT NULL,
    "errorType" TEXT,
    "errorStack" TEXT,
    "originalAttempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DLQStatus" NOT NULL DEFAULT 'PENDING',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "investigatedBy" TEXT,
    "investigationNotes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "groupKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "DLQRetry" (
    "uuid" TEXT NOT NULL,
    "dlqJobUuid" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "RetryStatus" NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "DLQRetry_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "JobHeartbeat" (
    "uuid" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL DEFAULT 'CRON',
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL,
    "health" "JobHealth" NOT NULL DEFAULT 'HEALTHY',
    "avgDuration" INTEGER,
    "lastDuration" INTEGER,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "errorRate" DOUBLE PRECISION,
    "schedule" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunBy" TEXT,
    "currentlyRunningOn" TEXT,
    "alertOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "alertThreshold" INTEGER NOT NULL DEFAULT 3,
    "lastAlertSentAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobHeartbeat_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "JobExecution" (
    "uuid" TEXT NOT NULL,
    "jobHeartbeatUuid" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "executedBy" TEXT,
    "executedOn" TEXT,
    "success" BOOLEAN,
    "error" TEXT,
    "errorStack" TEXT,
    "result" JSONB,
    "processedRecords" INTEGER,
    "memoryUsed" INTEGER,
    "cpuUsed" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "EventFailureLog" (
    "uuid" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "stack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFailureLog_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "eventTypes" "WebhookEventType"[],
    "eventFilters" JSONB,
    "secretHash" TEXT NOT NULL,
    "algorithm" "SignatureAlgorithm" NOT NULL DEFAULT 'SHA256',
    "version" INTEGER NOT NULL DEFAULT 1,
    "httpMethod" TEXT NOT NULL DEFAULT 'POST',
    "headers" JSONB,
    "timeout" INTEGER NOT NULL DEFAULT 30000,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryBackoff" "RetryStrategy" NOT NULL DEFAULT 'EXPONENTIAL',
    "retryDelayMs" INTEGER NOT NULL DEFAULT 1000,
    "maxRetryDelayMs" INTEGER NOT NULL DEFAULT 60000,
    "retryDelay" INTEGER NOT NULL DEFAULT 60,
    "status" "WebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ipWhitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitBreakerStatus" "CircuitStatus" NOT NULL DEFAULT 'CLOSED',
    "circuitOpenedAt" TIMESTAMP(3),
    "rateLimit" INTEGER,
    "rateLimitWindow" INTEGER,
    "allowedIPs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requireTLS" BOOLEAN NOT NULL DEFAULT true,
    "verifySSL" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "lastModifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "webhookUuid" TEXT NOT NULL,
    "eventType" "WebhookEventType" NOT NULL,
    "eventUuid" TEXT NOT NULL,
    "eventSource" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadSize" INTEGER NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "httpMethod" TEXT NOT NULL DEFAULT 'POST',
    "headers" JSONB,
    "signature" TEXT NOT NULL,
    "signatureAlgorithm" TEXT NOT NULL DEFAULT 'sha256',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "retriedAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "responseHeaders" JSONB,
    "responseTime" INTEGER,
    "lastError" TEXT,
    "errorType" TEXT,
    "errorTrace" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestUrl" TEXT NOT NULL,
    "requestHeaders" JSONB NOT NULL,
    "requestBody" JSONB NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WebhookAttempt" (
    "uuid" TEXT NOT NULL,
    "deliveryUuid" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestHeaders" JSONB,
    "requestBody" JSONB,
    "responseStatus" INTEGER,
    "responseHeaders" JSONB,
    "responseBody" TEXT,
    "responseTime" INTEGER,
    "succeeded" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "errorType" TEXT,
    "ipAddress" TEXT,
    "dnsLookupTime" INTEGER,
    "connectionTime" INTEGER,
    "tlsHandshakeTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookAttempt_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "uuid" TEXT NOT NULL,
    "provider" "WebhookProvider" NOT NULL,
    "providerEventUuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "storeUuid" TEXT,
    "eventUuid" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceIp" TEXT NOT NULL,
    "userAgent" TEXT,
    "payload" JSONB NOT NULL,
    "payloadSize" INTEGER NOT NULL,
    "rawPayload" TEXT,
    "signature" TEXT,
    "signatureHeader" TEXT,
    "signatureValid" BOOLEAN,
    "verifiedAt" TIMESTAMP(3),
    "status" "EventProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "originalEventUuid" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "resultActions" JSONB,
    "affectedEntities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "providerEventId" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WebhookDeadLetter" (
    "uuid" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventUuid" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "status" "DLQStatus" NOT NULL DEFAULT 'FAILED',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDeadLetter_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WebhookSecret" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT,
    "webhookUuid" TEXT,
    "provider" "WebhookProvider",
    "secretHash" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'sha256',
    "version" INTEGER NOT NULL DEFAULT 1,
    "keyDerivation" TEXT,
    "salt" TEXT,
    "iterations" INTEGER,
    "status" "SecretStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedReason" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebhookSecret_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WebhookReplay" (
    "uuid" TEXT NOT NULL,
    "webhookEventUuid" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventUuid" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ReplayStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReplay_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "WebhookOutbox" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "storeUuid" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WebhookOutbox_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

-- CreateIndex
CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tokenVersion_idx" ON "User"("tokenVersion");

-- CreateIndex
CREATE INDEX "User_isGloballyBanned_isBanned_idx" ON "User"("isGloballyBanned", "isBanned");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userUuid_status_idx" ON "RefreshToken"("userUuid", "status");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenFamily_version_idx" ON "RefreshToken"("tokenFamily", "version");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_status_idx" ON "RefreshToken"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "RefreshToken_deviceFingerprint_userUuid_idx" ON "RefreshToken"("deviceFingerprint", "userUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenUuid_key" ON "Session"("refreshTokenUuid");

-- CreateIndex
CREATE INDEX "Session_userUuid_status_idx" ON "Session"("userUuid", "status");

-- CreateIndex
CREATE INDEX "Session_tenantUuid_userUuid_idx" ON "Session"("tenantUuid", "userUuid");

-- CreateIndex
CREATE INDEX "Session_deviceFingerprint_userUuid_idx" ON "Session"("deviceFingerprint", "userUuid");

-- CreateIndex
CREATE INDEX "Session_expiresAt_status_idx" ON "Session"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "Session_riskLevel_suspiciousActivity_idx" ON "Session"("riskLevel", "suspiciousActivity");

-- CreateIndex
CREATE INDEX "TrustedDevice_userUuid_trusted_isActive_idx" ON "TrustedDevice"("userUuid", "trusted", "isActive");

-- CreateIndex
CREATE INDEX "TrustedDevice_deviceFingerprint_idx" ON "TrustedDevice"("deviceFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_userUuid_deviceFingerprint_key" ON "TrustedDevice"("userUuid", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "BiometricAuth_deviceId_tokenHash_idx" ON "BiometricAuth"("deviceId", "tokenHash");

-- CreateIndex
CREATE INDEX "BiometricAuth_userUuid_enabled_idx" ON "BiometricAuth"("userUuid", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricAuth_userUuid_deviceId_key" ON "BiometricAuth"("userUuid", "deviceId");

-- CreateIndex
CREATE INDEX "SocialAccount_userUuid_provider_idx" ON "SocialAccount"("userUuid", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_provider_providerId_key" ON "SocialAccount"("provider", "providerId");

-- CreateIndex
CREATE INDEX "LoginAttempt_phoneNumber_tenantSlug_createdAt_idx" ON "LoginAttempt"("phoneNumber", "tenantSlug", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_expiresAt_used_idx" ON "LoginAttempt"("expiresAt", "used");

-- CreateIndex
CREATE INDEX "LoginAttempt_blocked_blockUntil_idx" ON "LoginAttempt"("blocked", "blockUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Admin2FA_userUuid_key" ON "Admin2FA"("userUuid");

-- CreateIndex
CREATE INDEX "Admin2FA_userUuid_enabled_idx" ON "Admin2FA"("userUuid", "enabled");

-- CreateIndex
CREATE INDEX "FraudEvent_tenantUuid_storeUuid_severity_idx" ON "FraudEvent"("tenantUuid", "storeUuid", "severity");

-- CreateIndex
CREATE INDEX "FraudEvent_userUuid_createdAt_idx" ON "FraudEvent"("userUuid", "createdAt");

-- CreateIndex
CREATE INDEX "FraudEvent_status_severity_createdAt_idx" ON "FraudEvent"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "FraudEvent_type_severity_idx" ON "FraudEvent"("type", "severity");

-- CreateIndex
CREATE INDEX "SecurityEvent_tenantUuid_eventType_createdAt_idx" ON "SecurityEvent"("tenantUuid", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_resolved_idx" ON "SecurityEvent"("severity", "resolved");

-- CreateIndex
CREATE INDEX "IPWhitelist_tenantUuid_isActive_idx" ON "IPWhitelist"("tenantUuid", "isActive");

-- CreateIndex
CREATE INDEX "IPWhitelist_ipAddress_idx" ON "IPWhitelist"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "FraudIPAddress_ipAddress_key" ON "FraudIPAddress"("ipAddress");

-- CreateIndex
CREATE INDEX "FraudIPAddress_riskScore_idx" ON "FraudIPAddress"("riskScore");

-- CreateIndex
CREATE INDEX "AuditLog_tenantUuid_actorUuid_createdAt_idx" ON "AuditLog"("tenantUuid", "actorUuid", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantUuid_action_createdAt_idx" ON "AuditLog"("tenantUuid", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_storeUuid_createdAt_idx" ON "AuditLog"("storeUuid", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetUuid_idx" ON "AuditLog"("targetType", "targetUuid");

-- CreateIndex
CREATE INDEX "PaymentAuditSnapshot_tenantUuid_paymentUuid_createdAt_idx" ON "PaymentAuditSnapshot"("tenantUuid", "paymentUuid", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAuditSnapshot_orderUuid_idx" ON "PaymentAuditSnapshot"("orderUuid");

-- CreateIndex
CREATE INDEX "PaymentAuditSnapshot_reason_createdAt_idx" ON "PaymentAuditSnapshot"("reason", "createdAt");

-- CreateIndex
CREATE INDEX "Role_tenantUuid_isActive_idx" ON "Role"("tenantUuid", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantUuid_slug_key" ON "Role"("tenantUuid", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_slug_key" ON "Permission"("slug");

-- CreateIndex
CREATE INDEX "Permission_resource_action_idx" ON "Permission"("resource", "action");

-- CreateIndex
CREATE INDEX "Permission_key_idx" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_roleUuid_idx" ON "RolePermission"("roleUuid");

-- CreateIndex
CREATE INDEX "RolePermission_permissionUuid_idx" ON "RolePermission"("permissionUuid");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleUuid_permissionUuid_key" ON "RolePermission"("roleUuid", "permissionUuid");

-- CreateIndex
CREATE INDEX "UserPermission_userUuid_storeUuid_idx" ON "UserPermission"("userUuid", "storeUuid");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userUuid_storeUuid_permissionUuid_key" ON "UserPermission"("userUuid", "storeUuid", "permissionUuid");

-- CreateIndex
CREATE INDEX "TemporaryPermission_userUuid_storeUuid_validUntil_idx" ON "TemporaryPermission"("userUuid", "storeUuid", "validUntil");

-- CreateIndex
CREATE INDEX "TemporaryPermission_validUntil_revoked_idx" ON "TemporaryPermission"("validUntil", "revoked");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_ownerUuid_key" ON "Tenant"("ownerUuid");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_createdAt_idx" ON "Tenant"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Tenant_ownerUuid_idx" ON "Tenant"("ownerUuid");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_slug_key" ON "TenantUser"("slug");

-- CreateIndex
CREATE INDEX "TenantUser_tenantUuid_role_idx" ON "TenantUser"("tenantUuid", "role");

-- CreateIndex
CREATE INDEX "TenantUser_userUuid_idx" ON "TenantUser"("userUuid");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_tenantUuid_userUuid_key" ON "TenantUser"("tenantUuid", "userUuid");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_token_key" ON "TenantInvitation"("token");

-- CreateIndex
CREATE INDEX "TenantInvitation_tenantUuid_status_idx" ON "TenantInvitation"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "TenantInvitation_email_status_idx" ON "TenantInvitation"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantUuid_key" ON "TenantSettings"("tenantUuid");

-- CreateIndex
CREATE INDEX "TenantSettings_tenantUuid_idx" ON "TenantSettings"("tenantUuid");

-- CreateIndex
CREATE INDEX "Store_tenantUuid_status_idx" ON "Store"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "Store_tenantUuid_active_idx" ON "Store"("tenantUuid", "active");

-- CreateIndex
CREATE INDEX "Store_createdAt_idx" ON "Store"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Store_tenantUuid_slug_key" ON "Store"("tenantUuid", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettings_storeUuid_key" ON "StoreSettings"("storeUuid");

-- CreateIndex
CREATE INDEX "StoreSettings_storeUuid_idx" ON "StoreSettings"("storeUuid");

-- CreateIndex
CREATE INDEX "StoreOpeningHour_tenantUuid_storeUuid_isActive_idx" ON "StoreOpeningHour"("tenantUuid", "storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "StoreOpeningHour_storeUuid_dayOfWeek_isActive_idx" ON "StoreOpeningHour"("storeUuid", "dayOfWeek", "isActive");

-- CreateIndex
CREATE INDEX "StoreOpeningHour_storeUuid_specificDate_idx" ON "StoreOpeningHour"("storeUuid", "specificDate");

-- CreateIndex
CREATE INDEX "StoreOpeningHour_scheduleType_isActive_idx" ON "StoreOpeningHour"("scheduleType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StoreOpeningHour_tenantUuid_storeUuid_dayOfWeek_scheduleTyp_key" ON "StoreOpeningHour"("tenantUuid", "storeUuid", "dayOfWeek", "scheduleType");

-- CreateIndex
CREATE INDEX "StoreCapacity_tenantUuid_storeUuid_capacityType_idx" ON "StoreCapacity"("tenantUuid", "storeUuid", "capacityType");

-- CreateIndex
CREATE INDEX "StoreCapacity_storeUuid_isActive_idx" ON "StoreCapacity"("storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "StoreHourException_tenantUuid_storeUuid_exceptionDate_idx" ON "StoreHourException"("tenantUuid", "storeUuid", "exceptionDate");

-- CreateIndex
CREATE INDEX "StoreHourException_exceptionDate_isActive_idx" ON "StoreHourException"("exceptionDate", "isActive");

-- CreateIndex
CREATE INDEX "StoreHourException_storeUuid_recurring_idx" ON "StoreHourException"("storeUuid", "recurring");

-- CreateIndex
CREATE UNIQUE INDEX "StoreHourException_tenantUuid_storeUuid_exceptionDate_key" ON "StoreHourException"("tenantUuid", "storeUuid", "exceptionDate");

-- CreateIndex
CREATE INDEX "StoreAvailabilityCache_storeUuid_idx" ON "StoreAvailabilityCache"("storeUuid");

-- CreateIndex
CREATE INDEX "StoreAvailabilityCache_expiresAt_idx" ON "StoreAvailabilityCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreAvailabilityCache_tenantUuid_storeUuid_key" ON "StoreAvailabilityCache"("tenantUuid", "storeUuid");

-- CreateIndex
CREATE UNIQUE INDEX "StoreOpsMetrics_tenantUuid_storeUuid_key" ON "StoreOpsMetrics"("tenantUuid", "storeUuid");

-- CreateIndex
CREATE INDEX "BusinessHourRule_tenantUuid_storeUuid_isActive_priority_idx" ON "BusinessHourRule"("tenantUuid", "storeUuid", "isActive", "priority");

-- CreateIndex
CREATE INDEX "UserStore_storeUuid_isActive_idx" ON "UserStore"("storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "UserStore_userUuid_isActive_idx" ON "UserStore"("userUuid", "isActive");

-- CreateIndex
CREATE INDEX "UserStore_tenantUuid_idx" ON "UserStore"("tenantUuid");

-- CreateIndex
CREATE UNIQUE INDEX "UserStore_userUuid_storeUuid_key" ON "UserStore"("userUuid", "storeUuid");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userUuid_key" ON "UserPreferences"("userUuid");

-- CreateIndex
CREATE INDEX "UserPreferences_userUuid_idx" ON "UserPreferences"("userUuid");

-- CreateIndex
CREATE INDEX "UserFavorite_userUuid_storeUuid_idx" ON "UserFavorite"("userUuid", "storeUuid");

-- CreateIndex
CREATE INDEX "UserFavorite_productUuid_idx" ON "UserFavorite"("productUuid");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userUuid_productUuid_key" ON "UserFavorite"("userUuid", "productUuid");

-- CreateIndex
CREATE INDEX "UserDevice_userUuid_isActive_idx" ON "UserDevice"("userUuid", "isActive");

-- CreateIndex
CREATE INDEX "Category_tenantUuid_storeUuid_isActive_idx" ON "Category"("tenantUuid", "storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "Category_storeUuid_parentUuid_displayOrder_idx" ON "Category"("storeUuid", "parentUuid", "displayOrder");

-- CreateIndex
CREATE INDEX "Category_isActive_isVisible_idx" ON "Category"("isActive", "isVisible");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantUuid_storeUuid_slug_key" ON "Category"("tenantUuid", "storeUuid", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_storeUuid_name_key" ON "Category"("storeUuid", "name");

-- CreateIndex
CREATE INDEX "CategoryAvailability_categoryUuid_dayOfWeek_idx" ON "CategoryAvailability"("categoryUuid", "dayOfWeek");

-- CreateIndex
CREATE INDEX "CategoryDailyMetrics_tenantUuid_storeUuid_date_idx" ON "CategoryDailyMetrics"("tenantUuid", "storeUuid", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryDailyMetrics_tenantUuid_categoryUuid_storeUuid_date_key" ON "CategoryDailyMetrics"("tenantUuid", "categoryUuid", "storeUuid", "date");

-- CreateIndex
CREATE INDEX "Product_tenantUuid_storeUuid_isActive_idx" ON "Product"("tenantUuid", "storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "Product_storeUuid_categoryUuid_displayOrder_idx" ON "Product"("storeUuid", "categoryUuid", "displayOrder");

-- CreateIndex
CREATE INDEX "Product_isActive_isDeleted_visibleOnMenu_idx" ON "Product"("isActive", "isDeleted", "visibleOnMenu");

-- CreateIndex
CREATE INDEX "Product_tenantUuid_storeUuid_isActive_isDeleted_idx" ON "Product"("tenantUuid", "storeUuid", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "Product_searchVector_idx" ON "Product"("searchVector");

-- CreateIndex
CREATE INDEX "Product_tags_idx" ON "Product"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantUuid_storeUuid_sku_key" ON "Product"("tenantUuid", "storeUuid", "sku");

-- CreateIndex
CREATE INDEX "ProductOptionGroup_tenantUuid_productUuid_idx" ON "ProductOptionGroup"("tenantUuid", "productUuid");

-- CreateIndex
CREATE INDEX "ProductOptionGroup_productUuid_displayOrder_idx" ON "ProductOptionGroup"("productUuid", "displayOrder");

-- CreateIndex
CREATE INDEX "ProductOptionGroup_tenantUuid_productUuid_isActive_idx" ON "ProductOptionGroup"("tenantUuid", "productUuid", "isActive");

-- CreateIndex
CREATE INDEX "ProductOption_tenantUuid_optionGroupUuid_idx" ON "ProductOption"("tenantUuid", "optionGroupUuid");

-- CreateIndex
CREATE INDEX "ProductOption_optionGroupUuid_displayOrder_idx" ON "ProductOption"("optionGroupUuid", "displayOrder");

-- CreateIndex
CREATE INDEX "ProductOption_tenantUuid_optionGroupUuid_isActive_idx" ON "ProductOption"("tenantUuid", "optionGroupUuid", "isActive");

-- CreateIndex
CREATE INDEX "ProductAvailability_tenantUuid_productUuid_isActive_idx" ON "ProductAvailability"("tenantUuid", "productUuid", "isActive");

-- CreateIndex
CREATE INDEX "ProductAvailability_productUuid_dayOfWeek_isActive_idx" ON "ProductAvailability"("productUuid", "dayOfWeek", "isActive");

-- CreateIndex
CREATE INDEX "ProductAvailability_productUuid_specificDate_idx" ON "ProductAvailability"("productUuid", "specificDate");

-- CreateIndex
CREATE INDEX "ProductAvailability_scheduleType_isActive_idx" ON "ProductAvailability"("scheduleType", "isActive");

-- CreateIndex
CREATE INDEX "ProductAvailability_tenantUuid_storeUuid_productUuid_isActi_idx" ON "ProductAvailability"("tenantUuid", "storeUuid", "productUuid", "isActive");

-- CreateIndex
CREATE INDEX "ProductReview_tenantUuid_productUuid_status_idx" ON "ProductReview"("tenantUuid", "productUuid", "status");

-- CreateIndex
CREATE INDEX "ProductReview_rating_createdAt_idx" ON "ProductReview"("rating", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_tenantUuid_orderUuid_productUuid_key" ON "ProductReview"("tenantUuid", "orderUuid", "productUuid");

-- CreateIndex
CREATE INDEX "ProductDailyMetrics_tenantUuid_storeUuid_date_idx" ON "ProductDailyMetrics"("tenantUuid", "storeUuid", "date");

-- CreateIndex
CREATE INDEX "ProductDailyMetrics_productUuid_date_idx" ON "ProductDailyMetrics"("productUuid", "date");

-- CreateIndex
CREATE INDEX "ProductDailyMetrics_date_quantitySold_idx" ON "ProductDailyMetrics"("date", "quantitySold");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDailyMetrics_tenantUuid_productUuid_storeUuid_date_key" ON "ProductDailyMetrics"("tenantUuid", "productUuid", "storeUuid", "date");

-- CreateIndex
CREATE INDEX "OptionGroup_storeUuid_isActive_idx" ON "OptionGroup"("storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "OptionGroup_tenantUuid_storeUuid_idx" ON "OptionGroup"("tenantUuid", "storeUuid");

-- CreateIndex
CREATE INDEX "Option_optionGroupUuid_idx" ON "Option"("optionGroupUuid");

-- CreateIndex
CREATE INDEX "Option_isActive_isAvailable_idx" ON "Option"("isActive", "isAvailable");

-- CreateIndex
CREATE INDEX "MenuSnapshot_tenantUuid_storeUuid_createdAt_idx" ON "MenuSnapshot"("tenantUuid", "storeUuid", "createdAt");

-- CreateIndex
CREATE INDEX "MenuSnapshot_storeUuid_isActive_idx" ON "MenuSnapshot"("storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "MenuSnapshot_contentHash_idx" ON "MenuSnapshot"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "MenuSnapshot_tenantUuid_storeUuid_version_key" ON "MenuSnapshot"("tenantUuid", "storeUuid", "version");

-- CreateIndex
CREATE INDEX "MenuDiff_tenantUuid_storeUuid_createdAt_idx" ON "MenuDiff"("tenantUuid", "storeUuid", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuDiff_fromSnapshotUuid_toSnapshotUuid_key" ON "MenuDiff"("fromSnapshotUuid", "toSnapshotUuid");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCacheMetadata_storeUuid_key" ON "MenuCacheMetadata"("storeUuid");

-- CreateIndex
CREATE INDEX "MenuCacheMetadata_storeUuid_idx" ON "MenuCacheMetadata"("storeUuid");

-- CreateIndex
CREATE INDEX "MenuAnalyticEvents_tenantUuid_storeUuid_occurredAt_idx" ON "MenuAnalyticEvents"("tenantUuid", "storeUuid", "occurredAt");

-- CreateIndex
CREATE INDEX "MenuAnalyticEvents_eventType_occurredAt_idx" ON "MenuAnalyticEvents"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "MenuAnalyticEvents_entityType_entityUuid_occurredAt_idx" ON "MenuAnalyticEvents"("entityType", "entityUuid", "occurredAt");

-- CreateIndex
CREATE INDEX "MenuAnalyticEvents_sessionId_occurredAt_idx" ON "MenuAnalyticEvents"("sessionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_productUuid_key" ON "InventoryItem"("productUuid");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantUuid_storeUuid_status_idx" ON "InventoryItem"("tenantUuid", "storeUuid", "status");

-- CreateIndex
CREATE INDEX "InventoryItem_status_currentStock_idx" ON "InventoryItem"("status", "currentStock");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantUuid_storeUuid_productUuid_key" ON "InventoryItem"("tenantUuid", "storeUuid", "productUuid");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantUuid_inventoryItemUuid_createdAt_idx" ON "InventoryMovement"("tenantUuid", "inventoryItemUuid", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceType_referenceUuid_idx" ON "InventoryMovement"("referenceType", "referenceUuid");

-- CreateIndex
CREATE INDEX "InventoryReservation_orderUuid_status_idx" ON "InventoryReservation"("orderUuid", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_expiresAt_status_idx" ON "InventoryReservation"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_tenantUuid_storeUuid_idx" ON "InventoryReservation"("tenantUuid", "storeUuid");

-- CreateIndex
CREATE INDEX "InventoryTransaction_tenantUuid_productUuid_createdAt_idx" ON "InventoryTransaction"("tenantUuid", "productUuid", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_orderUuid_idx" ON "InventoryTransaction"("orderUuid");

-- CreateIndex
CREATE INDEX "Order_tenantUuid_storeUuid_status_idx" ON "Order"("tenantUuid", "storeUuid", "status");

-- CreateIndex
CREATE INDEX "Order_tenantUuid_tenantUserUuid_createdAt_idx" ON "Order"("tenantUuid", "tenantUserUuid", "createdAt");

-- CreateIndex
CREATE INDEX "Order_storeUuid_createdAt_idx" ON "Order"("storeUuid", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantUuid_orderNumber_key" ON "Order"("tenantUuid", "orderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_tenantUuid_orderUuid_idx" ON "OrderItem"("tenantUuid", "orderUuid");

-- CreateIndex
CREATE INDEX "OrderItem_productUuid_idx" ON "OrderItem"("productUuid");

-- CreateIndex
CREATE INDEX "OrderItem_status_idx" ON "OrderItem"("status");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_tenantUuid_orderUuid_createdAt_idx" ON "OrderStatusHistory"("tenantUuid", "orderUuid", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_toStatus_createdAt_idx" ON "OrderStatusHistory"("toStatus", "createdAt");

-- CreateIndex
CREATE INDEX "OrderDailyMetrics_tenantUuid_storeUuid_date_idx" ON "OrderDailyMetrics"("tenantUuid", "storeUuid", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDailyMetrics_tenantUuid_storeUuid_date_key" ON "OrderDailyMetrics"("tenantUuid", "storeUuid", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderUuid_key" ON "Payment"("orderUuid");

-- CreateIndex
CREATE INDEX "Payment_tenantUuid_storeUuid_status_idx" ON "Payment"("tenantUuid", "storeUuid", "status");

-- CreateIndex
CREATE INDEX "Payment_paymentFlow_status_idx" ON "Payment"("paymentFlow", "status");

-- CreateIndex
CREATE INDEX "Payment_processedBy_processedAt_idx" ON "Payment"("processedBy", "processedAt");

-- CreateIndex
CREATE INDEX "Payment_flaggedForReview_reviewedAt_idx" ON "Payment"("flaggedForReview", "reviewedAt");

-- CreateIndex
CREATE INDEX "Payment_reconciledAt_idx" ON "Payment"("reconciledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRisk_tenantUuid_userUuid_key" ON "PaymentRisk"("tenantUuid", "userUuid");

-- CreateIndex
CREATE INDEX "PaymentRestriction_tenantUuid_userUuid_active_idx" ON "PaymentRestriction"("tenantUuid", "userUuid", "active");

-- CreateIndex
CREATE INDEX "PaymentRestriction_type_active_idx" ON "PaymentRestriction"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRestriction_tenantUuid_userUuid_type_effectiveFrom_key" ON "PaymentRestriction"("tenantUuid", "userUuid", "type", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PaymentAnomaly_tenantUuid_storeUuid_status_idx" ON "PaymentAnomaly"("tenantUuid", "storeUuid", "status");

-- CreateIndex
CREATE INDEX "PaymentAnomaly_anomalyType_severity_status_idx" ON "PaymentAnomaly"("anomalyType", "severity", "status");

-- CreateIndex
CREATE INDEX "PaymentAnomaly_detectedAt_idx" ON "PaymentAnomaly"("detectedAt");

-- CreateIndex
CREATE INDEX "PaymentDispute_tenantUuid_status_idx" ON "PaymentDispute"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "PaymentDispute_paymentUuid_idx" ON "PaymentDispute"("paymentUuid");

-- CreateIndex
CREATE INDEX "PaymentDispute_status_evidenceDueBy_idx" ON "PaymentDispute"("status", "evidenceDueBy");

-- CreateIndex
CREATE INDEX "CashDrawer_tenantUuid_storeUuid_sessionStart_idx" ON "CashDrawer"("tenantUuid", "storeUuid", "sessionStart");

-- CreateIndex
CREATE INDEX "CashDrawer_terminalId_sessionStart_idx" ON "CashDrawer"("terminalId", "sessionStart");

-- CreateIndex
CREATE INDEX "CashDrawer_storeUuid_status_idx" ON "CashDrawer"("storeUuid", "status");

-- CreateIndex
CREATE INDEX "CashDrawer_userUuid_status_idx" ON "CashDrawer"("userUuid", "status");

-- CreateIndex
CREATE INDEX "CashDrawer_openedAt_idx" ON "CashDrawer"("openedAt");

-- CreateIndex
CREATE INDEX "CashDrop_cashDrawerUuid_idx" ON "CashDrop"("cashDrawerUuid");

-- CreateIndex
CREATE INDEX "CashDrop_storeUuid_droppedAt_idx" ON "CashDrop"("storeUuid", "droppedAt");

-- CreateIndex
CREATE INDEX "CashCount_cashDrawerUuid_idx" ON "CashCount"("cashDrawerUuid");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_provider_periodStart_idx" ON "PaymentReconciliation"("provider", "periodStart");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_status_idx" ON "PaymentReconciliation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_tenantUuid_provider_periodStart_key" ON "PaymentReconciliation"("tenantUuid", "provider", "periodStart");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantUuid_key_route_key" ON "IdempotencyKey"("tenantUuid", "key", "route");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantUuid_storeUuid_createdAt_idx" ON "LedgerEntry"("tenantUuid", "storeUuid", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_refType_refUuid_idx" ON "LedgerEntry"("refType", "refUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_paymentUuid_key" ON "Settlement"("paymentUuid");

-- CreateIndex
CREATE INDEX "Settlement_tenantUuid_status_idx" ON "Settlement"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "Settlement_provider_status_idx" ON "Settlement"("provider", "status");

-- CreateIndex
CREATE INDEX "Settlement_paymentUuid_idx" ON "Settlement"("paymentUuid");

-- CreateIndex
CREATE INDEX "Settlement_providerRef_idx" ON "Settlement"("providerRef");

-- CreateIndex
CREATE INDEX "Settlement_settledAt_idx" ON "Settlement"("settledAt");

-- CreateIndex
CREATE INDEX "Refund_tenantUuid_storeUuid_status_idx" ON "Refund"("tenantUuid", "storeUuid", "status");

-- CreateIndex
CREATE INDEX "Refund_orderUuid_idx" ON "Refund"("orderUuid");

-- CreateIndex
CREATE INDEX "Refund_paymentUuid_idx" ON "Refund"("paymentUuid");

-- CreateIndex
CREATE INDEX "DailyReconciliation_tenantUuid_storeUuid_date_idx" ON "DailyReconciliation"("tenantUuid", "storeUuid", "date");

-- CreateIndex
CREATE INDEX "DailyReconciliation_status_date_idx" ON "DailyReconciliation"("status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReconciliation_storeUuid_date_key" ON "DailyReconciliation"("storeUuid", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userUuid_key" ON "Wallet"("userUuid");

-- CreateIndex
CREATE INDEX "Wallet_tenantUuid_status_idx" ON "Wallet"("tenantUuid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_tenantUuid_userUuid_key" ON "Wallet"("tenantUuid", "userUuid");

-- CreateIndex
CREATE INDEX "WalletTransaction_tenantUuid_walletUuid_createdAt_idx" ON "WalletTransaction"("tenantUuid", "walletUuid", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_refType_refUuid_idx" ON "WalletTransaction"("refType", "refUuid");

-- CreateIndex
CREATE INDEX "Shift_storeUuid_scheduledStart_idx" ON "Shift"("storeUuid", "scheduledStart");

-- CreateIndex
CREATE INDEX "Shift_userUuid_scheduledStart_idx" ON "Shift"("userUuid", "scheduledStart");

-- CreateIndex
CREATE INDEX "Shift_status_scheduledStart_idx" ON "Shift"("status", "scheduledStart");

-- CreateIndex
CREATE INDEX "TimeEntry_storeUuid_clockInAt_idx" ON "TimeEntry"("storeUuid", "clockInAt");

-- CreateIndex
CREATE INDEX "TimeEntry_userUuid_clockInAt_idx" ON "TimeEntry"("userUuid", "clockInAt");

-- CreateIndex
CREATE INDEX "TimeEntry_syncConflict_idx" ON "TimeEntry"("syncConflict");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_shiftUuid_key" ON "TimeEntry"("shiftUuid");

-- CreateIndex
CREATE INDEX "BreakEntry_timeEntryUuid_idx" ON "BreakEntry"("timeEntryUuid");

-- CreateIndex
CREATE INDEX "BreakEntry_shiftUuid_idx" ON "BreakEntry"("shiftUuid");

-- CreateIndex
CREATE INDEX "BreakPolicy_tenantUuid_isActive_idx" ON "BreakPolicy"("tenantUuid", "isActive");

-- CreateIndex
CREATE INDEX "BreakPolicy_storeUuid_isActive_idx" ON "BreakPolicy"("storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "BreakViolation_timeEntryUuid_idx" ON "BreakViolation"("timeEntryUuid");

-- CreateIndex
CREATE INDEX "BreakViolation_userUuid_storeUuid_idx" ON "BreakViolation"("userUuid", "storeUuid");

-- CreateIndex
CREATE INDEX "BreakViolation_violationType_acknowledged_idx" ON "BreakViolation"("violationType", "acknowledged");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_shiftUuid_status_idx" ON "ShiftSwapRequest"("shiftUuid", "status");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_requestedBy_idx" ON "ShiftSwapRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "ShiftAnnouncement_storeUuid_activeFrom_idx" ON "ShiftAnnouncement"("storeUuid", "activeFrom");

-- CreateIndex
CREATE INDEX "ShiftAnnouncement_priority_activeFrom_idx" ON "ShiftAnnouncement"("priority", "activeFrom");

-- CreateIndex
CREATE INDEX "StaffTask_storeUuid_status_idx" ON "StaffTask"("storeUuid", "status");

-- CreateIndex
CREATE INDEX "StaffTask_assignedTo_status_idx" ON "StaffTask"("assignedTo", "status");

-- CreateIndex
CREATE INDEX "StaffTask_dueAt_idx" ON "StaffTask"("dueAt");

-- CreateIndex
CREATE INDEX "StaffPerformance_storeUuid_periodStart_idx" ON "StaffPerformance"("storeUuid", "periodStart");

-- CreateIndex
CREATE INDEX "StaffPerformance_userUuid_periodStart_idx" ON "StaffPerformance"("userUuid", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPerformance_userUuid_storeUuid_periodStart_periodType_key" ON "StaffPerformance"("userUuid", "storeUuid", "periodStart", "periodType");

-- CreateIndex
CREATE INDEX "StaffApprovalRequest_storeUuid_status_idx" ON "StaffApprovalRequest"("storeUuid", "status");

-- CreateIndex
CREATE INDEX "StaffApprovalRequest_requestedBy_status_idx" ON "StaffApprovalRequest"("requestedBy", "status");

-- CreateIndex
CREATE INDEX "StaffApprovalRequest_approvedBy_status_idx" ON "StaffApprovalRequest"("approvedBy", "status");

-- CreateIndex
CREATE INDEX "TipPool_storeUuid_periodStart_idx" ON "TipPool"("storeUuid", "periodStart");

-- CreateIndex
CREATE INDEX "TipPool_status_idx" ON "TipPool"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TipPool_storeUuid_periodStart_periodType_key" ON "TipPool"("storeUuid", "periodStart", "periodType");

-- CreateIndex
CREATE INDEX "TipDistribution_storeUuid_periodStart_idx" ON "TipDistribution"("storeUuid", "periodStart");

-- CreateIndex
CREATE INDEX "TipDistribution_status_idx" ON "TipDistribution"("status");

-- CreateIndex
CREATE INDEX "Commission_storeUuid_periodStart_idx" ON "Commission"("storeUuid", "periodStart");

-- CreateIndex
CREATE INDEX "Commission_userUuid_idx" ON "Commission"("userUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_userUuid_storeUuid_periodStart_periodType_key" ON "Commission"("userUuid", "storeUuid", "periodStart", "periodType");

-- CreateIndex
CREATE INDEX "PayrollPeriod_storeUuid_periodStart_idx" ON "PayrollPeriod"("storeUuid", "periodStart");

-- CreateIndex
CREATE INDEX "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_tenantUuid_periodStart_periodType_key" ON "PayrollPeriod"("tenantUuid", "periodStart", "periodType");

-- CreateIndex
CREATE INDEX "PayrollRecord_payrollPeriodUuid_idx" ON "PayrollRecord"("payrollPeriodUuid");

-- CreateIndex
CREATE INDEX "PayrollRecord_userUuid_idx" ON "PayrollRecord"("userUuid");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRecord_payrollPeriodUuid_userUuid_storeUuid_key" ON "PayrollRecord"("payrollPeriodUuid", "userUuid", "storeUuid");

-- CreateIndex
CREATE INDEX "PayrollExport_payrollPeriodUuid_idx" ON "PayrollExport"("payrollPeriodUuid");

-- CreateIndex
CREATE INDEX "PayrollExport_format_idx" ON "PayrollExport"("format");

-- CreateIndex
CREATE INDEX "LaborCostSnapshot_storeUuid_snapshotDate_idx" ON "LaborCostSnapshot"("storeUuid", "snapshotDate");

-- CreateIndex
CREATE INDEX "LaborCostSnapshot_isOverBudget_idx" ON "LaborCostSnapshot"("isOverBudget");

-- CreateIndex
CREATE UNIQUE INDEX "LaborCostSnapshot_storeUuid_snapshotDate_periodType_key" ON "LaborCostSnapshot"("storeUuid", "snapshotDate", "periodType");

-- CreateIndex
CREATE INDEX "LaborBudget_storeUuid_isActive_idx" ON "LaborBudget"("storeUuid", "isActive");

-- CreateIndex
CREATE INDEX "StoreDailyMetrics_tenantUuid_date_idx" ON "StoreDailyMetrics"("tenantUuid", "date");

-- CreateIndex
CREATE INDEX "StoreDailyMetrics_storeUuid_date_idx" ON "StoreDailyMetrics"("storeUuid", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StoreDailyMetrics_tenantUuid_storeUuid_date_key" ON "StoreDailyMetrics"("tenantUuid", "storeUuid", "date");

-- CreateIndex
CREATE INDEX "HourlyRevenue_tenantUuid_storeUuid_hour_idx" ON "HourlyRevenue"("tenantUuid", "storeUuid", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "HourlyRevenue_tenantUuid_storeUuid_hour_key" ON "HourlyRevenue"("tenantUuid", "storeUuid", "hour");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_tenantUuid_type_periodStart_idx" ON "AnalyticsSnapshot"("tenantUuid", "type", "periodStart");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_type_granularity_periodStart_idx" ON "AnalyticsSnapshot"("type", "granularity", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_tenantUuid_storeUuid_type_granularity_per_key" ON "AnalyticsSnapshot"("tenantUuid", "storeUuid", "type", "granularity", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_slug_idx" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_tier_isActive_isPublic_idx" ON "Plan"("tier", "isActive", "isPublic");

-- CreateIndex
CREATE INDEX "Plan_isActive_displayOrder_idx" ON "Plan"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "PlanPrice_planUuid_isActive_isDefault_idx" ON "PlanPrice"("planUuid", "isActive", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_planUuid_currency_interval_region_key" ON "PlanPrice"("planUuid", "currency", "interval", "region");

-- CreateIndex
CREATE INDEX "PriceTier_planPriceUuid_displayOrder_idx" ON "PriceTier"("planPriceUuid", "displayOrder");

-- CreateIndex
CREATE INDEX "PlanFeature_planUuid_category_displayOrder_idx" ON "PlanFeature"("planUuid", "category", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeature_planUuid_featureKey_key" ON "PlanFeature"("planUuid", "featureKey");

-- CreateIndex
CREATE INDEX "PlanVersion_planUuid_isActive_idx" ON "PlanVersion"("planUuid", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_planUuid_version_key" ON "PlanVersion"("planUuid", "version");

-- CreateIndex
CREATE INDEX "PlanQuota_planUuid_enforced_idx" ON "PlanQuota"("planUuid", "enforced");

-- CreateIndex
CREATE UNIQUE INDEX "PlanQuota_planUuid_quotaKey_key" ON "PlanQuota"("planUuid", "quotaKey");

-- CreateIndex
CREATE INDEX "UsageQuota_tenantUuid_idx" ON "UsageQuota"("tenantUuid");

-- CreateIndex
CREATE UNIQUE INDEX "UsageQuota_tenantUuid_quotaKey_key" ON "UsageQuota"("tenantUuid", "quotaKey");

-- CreateIndex
CREATE UNIQUE INDEX "AddOn_slug_key" ON "AddOn"("slug");

-- CreateIndex
CREATE INDEX "AddOn_slug_idx" ON "AddOn"("slug");

-- CreateIndex
CREATE INDEX "AddOn_isActive_isPublic_idx" ON "AddOn"("isActive", "isPublic");

-- CreateIndex
CREATE INDEX "AddOnPrice_addOnUuid_isActive_idx" ON "AddOnPrice"("addOnUuid", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AddOnPrice_addOnUuid_currency_interval_key" ON "AddOnPrice"("addOnUuid", "currency", "interval");

-- CreateIndex
CREATE INDEX "AddOnPriceTier_addOnPriceUuid_displayOrder_idx" ON "AddOnPriceTier"("addOnPriceUuid", "displayOrder");

-- CreateIndex
CREATE INDEX "AddOnUsageRecord_tenantAddOnUuid_periodStart_periodEnd_idx" ON "AddOnUsageRecord"("tenantAddOnUuid", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "AddOnUsageRecord_timestamp_idx" ON "AddOnUsageRecord"("timestamp");

-- CreateIndex
CREATE INDEX "TenantAddOn_tenantUuid_status_idx" ON "TenantAddOn"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "TenantAddOn_subscriptionUuid_status_idx" ON "TenantAddOn"("subscriptionUuid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAddOn_tenantUuid_addOnUuid_subscriptionUuid_key" ON "TenantAddOn"("tenantUuid", "addOnUuid", "subscriptionUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantUuid_key" ON "Subscription"("tenantUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_subscriptionNumber_key" ON "Subscription"("subscriptionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubUuid_key" ON "Subscription"("stripeSubUuid");

-- CreateIndex
CREATE INDEX "Subscription_tenantUuid_status_idx" ON "Subscription"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Subscription_stripeSubUuid_idx" ON "Subscription"("stripeSubUuid");

-- CreateIndex
CREATE INDEX "Subscription_cancelAtPeriodEnd_currentPeriodEnd_idx" ON "Subscription"("cancelAtPeriodEnd", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Subscription_startDate_idx" ON "Subscription"("startDate");

-- CreateIndex
CREATE INDEX "Subscription_endDate_idx" ON "Subscription"("endDate");

-- CreateIndex
CREATE INDEX "SubscriptionUsageRecord_subscriptionUuid_metricName_periodS_idx" ON "SubscriptionUsageRecord"("subscriptionUuid", "metricName", "periodStart");

-- CreateIndex
CREATE INDEX "SubscriptionUsageRecord_timestamp_idx" ON "SubscriptionUsageRecord"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionUsageRecord_subscriptionUuid_idempotencyKey_key" ON "SubscriptionUsageRecord"("subscriptionUuid", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SubscriptionSchedule_subscriptionUuid_effectiveDate_status_idx" ON "SubscriptionSchedule"("subscriptionUuid", "effectiveDate", "status");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_subscriptionUuid_occurredAt_idx" ON "SubscriptionHistory"("subscriptionUuid", "occurredAt");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_eventType_occurredAt_idx" ON "SubscriptionHistory"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "SubscriptionRetention_tenantUuid_cohortMonth_idx" ON "SubscriptionRetention"("tenantUuid", "cohortMonth");

-- CreateIndex
CREATE INDEX "BillingSnapshot_tenantUuid_billingMonth_idx" ON "BillingSnapshot"("tenantUuid", "billingMonth");

-- CreateIndex
CREATE INDEX "BillingSnapshot_subscriptionUuid_periodStart_idx" ON "BillingSnapshot"("subscriptionUuid", "periodStart");

-- CreateIndex
CREATE INDEX "BillingSnapshot_paymentStatus_periodEnd_idx" ON "BillingSnapshot"("paymentStatus", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSnapshot_tenantUuid_subscriptionUuid_billingMonth_key" ON "BillingSnapshot"("tenantUuid", "subscriptionUuid", "billingMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_isActive_idx" ON "Coupon"("code", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseContract_tenantUuid_key" ON "EnterpriseContract"("tenantUuid");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseContract_contractNumber_key" ON "EnterpriseContract"("contractNumber");

-- CreateIndex
CREATE INDEX "EnterpriseContract_tenantUuid_status_idx" ON "EnterpriseContract"("tenantUuid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_tenantUuid_status_dueDate_idx" ON "Invoice"("tenantUuid", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionUuid_status_idx" ON "Invoice"("subscriptionUuid", "status");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceUuid_displayOrder_idx" ON "InvoiceLineItem"("invoiceUuid", "displayOrder");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceUuid_status_idx" ON "InvoicePayment"("invoiceUuid", "status");

-- CreateIndex
CREATE INDEX "InvoicePayment_providerRef_idx" ON "InvoicePayment"("providerRef");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_invoiceUuid_type_idx" ON "InvoiceAdjustment"("invoiceUuid", "type");

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceUuid_occurredAt_idx" ON "InvoiceEvent"("invoiceUuid", "occurredAt");

-- CreateIndex
CREATE INDEX "InvoiceEvent_eventType_occurredAt_idx" ON "InvoiceEvent"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "AdminAlert_tenantUuid_status_level_idx" ON "AdminAlert"("tenantUuid", "status", "level");

-- CreateIndex
CREATE INDEX "AdminAlert_tenantUuid_storeUuid_status_idx" ON "AdminAlert"("tenantUuid", "storeUuid", "status");

-- CreateIndex
CREATE INDEX "AdminAlert_status_priority_createdAt_idx" ON "AdminAlert"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAlert_assignedTo_status_idx" ON "AdminAlert"("assignedTo", "status");

-- CreateIndex
CREATE INDEX "AdminAlert_groupKey_createdAt_idx" ON "AdminAlert"("groupKey", "createdAt");

-- CreateIndex
CREATE INDEX "AlertAction_alertUuid_performedAt_idx" ON "AlertAction"("alertUuid", "performedAt");

-- CreateIndex
CREATE INDEX "EmailTemplate_tenantUuid_key_isActive_idx" ON "EmailTemplate"("tenantUuid", "key", "isActive");

-- CreateIndex
CREATE INDEX "EmailTemplate_category_isActive_idx" ON "EmailTemplate"("category", "isActive");

-- CreateIndex
CREATE INDEX "EmailTemplate_key_idx" ON "EmailTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_tenantUuid_storeUuid_key_locale_key" ON "EmailTemplate"("tenantUuid", "storeUuid", "key", "locale");

-- CreateIndex
CREATE INDEX "EmailOutbox_tenantUuid_status_scheduledAt_idx" ON "EmailOutbox"("tenantUuid", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_nextRetryAt_idx" ON "EmailOutbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_to_idx" ON "EmailOutbox"("to");

-- CreateIndex
CREATE INDEX "EmailOutbox_providerMessageId_idx" ON "EmailOutbox"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailEvent_emailUuid_eventType_occurredAt_idx" ON "EmailEvent"("emailUuid", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailEvent_eventType_occurredAt_idx" ON "EmailEvent"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailLog_userUuid_type_createdAt_idx" ON "EmailLog"("userUuid", "type", "createdAt");

-- CreateIndex
CREATE INDEX "SMSOutbox_status_createdAt_idx" ON "SMSOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PushNotificationOutbox_status_createdAt_idx" ON "PushNotificationOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformSetting_scope_category_idx" ON "PlatformSetting"("scope", "category");

-- CreateIndex
CREATE INDEX "PlatformSetting_tenantUuid_key_idx" ON "PlatformSetting"("tenantUuid", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_scope_tenantUuid_key_key" ON "PlatformSetting"("scope", "tenantUuid", "key");

-- CreateIndex
CREATE INDEX "SystemHealth_component_status_idx" ON "SystemHealth"("component", "status");

-- CreateIndex
CREATE INDEX "SystemHealth_checkedAt_idx" ON "SystemHealth"("checkedAt");

-- CreateIndex
CREATE INDEX "BrandingSetting_scope_isActive_idx" ON "BrandingSetting"("scope", "isActive");

-- CreateIndex
CREATE INDEX "BrandingSetting_tenantUuid_isActive_idx" ON "BrandingSetting"("tenantUuid", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BrandingSetting_scope_tenantUuid_storeUuid_key" ON "BrandingSetting"("scope", "tenantUuid", "storeUuid");

-- CreateIndex
CREATE INDEX "SettingHistory_settingUuid_changedAt_idx" ON "SettingHistory"("settingUuid", "changedAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowEnd_isBlocked_idx" ON "RateLimitBucket"("windowEnd", "isBlocked");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");

-- CreateIndex
CREATE INDEX "FeatureFlag_scope_enabled_idx" ON "FeatureFlag"("scope", "enabled");

-- CreateIndex
CREATE INDEX "FeatureFlag_tenantUuid_enabled_idx" ON "FeatureFlag"("tenantUuid", "enabled");

-- CreateIndex
CREATE INDEX "FeatureFlag_key_enabled_idx" ON "FeatureFlag"("key", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_scope_tenantUuid_key_key" ON "FeatureFlag"("scope", "tenantUuid", "key");

-- CreateIndex
CREATE INDEX "FeatureFlagEvaluation_flagUuid_evaluatedAt_idx" ON "FeatureFlagEvaluation"("flagUuid", "evaluatedAt");

-- CreateIndex
CREATE INDEX "FeatureFlagEvaluation_tenantUuid_evaluatedAt_idx" ON "FeatureFlagEvaluation"("tenantUuid", "evaluatedAt");

-- CreateIndex
CREATE INDEX "FeatureFlagOverride_targetType_targetUuid_idx" ON "FeatureFlagOverride"("targetType", "targetUuid");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlagOverride_flagUuid_targetType_targetUuid_key" ON "FeatureFlagOverride"("flagUuid", "targetType", "targetUuid");

-- CreateIndex
CREATE INDEX "DeadLetterJob_tenantUuid_status_idx" ON "DeadLetterJob"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "DeadLetterJob_jobType_status_idx" ON "DeadLetterJob"("jobType", "status");

-- CreateIndex
CREATE INDEX "DeadLetterJob_status_failedAt_idx" ON "DeadLetterJob"("status", "failedAt");

-- CreateIndex
CREATE INDEX "DeadLetterJob_groupKey_status_idx" ON "DeadLetterJob"("groupKey", "status");

-- CreateIndex
CREATE INDEX "DeadLetterJob_nextRetryAt_idx" ON "DeadLetterJob"("nextRetryAt");

-- CreateIndex
CREATE INDEX "DLQRetry_dlqJobUuid_attemptNumber_idx" ON "DLQRetry"("dlqJobUuid", "attemptNumber");

-- CreateIndex
CREATE INDEX "JobHeartbeat_status_health_idx" ON "JobHeartbeat"("status", "health");

-- CreateIndex
CREATE INDEX "JobHeartbeat_nextRunAt_idx" ON "JobHeartbeat"("nextRunAt");

-- CreateIndex
CREATE INDEX "JobHeartbeat_lockedAt_lockExpiresAt_idx" ON "JobHeartbeat"("lockedAt", "lockExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobHeartbeat_jobName_key" ON "JobHeartbeat"("jobName");

-- CreateIndex
CREATE UNIQUE INDEX "JobExecution_executionId_key" ON "JobExecution"("executionId");

-- CreateIndex
CREATE INDEX "JobExecution_jobHeartbeatUuid_startedAt_idx" ON "JobExecution"("jobHeartbeatUuid", "startedAt");

-- CreateIndex
CREATE INDEX "JobExecution_status_startedAt_idx" ON "JobExecution"("status", "startedAt");

-- CreateIndex
CREATE INDEX "EventFailureLog_event_createdAt_idx" ON "EventFailureLog"("event", "createdAt");

-- CreateIndex
CREATE INDEX "Webhook_tenantUuid_storeUuid_status_idx" ON "Webhook"("tenantUuid", "storeUuid", "status");

-- CreateIndex
CREATE INDEX "Webhook_status_isActive_idx" ON "Webhook"("status", "isActive");

-- CreateIndex
CREATE INDEX "Webhook_circuitBreakerStatus_idx" ON "Webhook"("circuitBreakerStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_tenantUuid_name_key" ON "Webhook"("tenantUuid", "name");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantUuid_status_nextRetryAt_idx" ON "WebhookDelivery"("tenantUuid", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookUuid_status_idx" ON "WebhookDelivery"("webhookUuid", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_eventType_status_idx" ON "WebhookDelivery"("eventType", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_scheduledAt_idx" ON "WebhookDelivery"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_webhookUuid_eventUuid_key" ON "WebhookDelivery"("webhookUuid", "eventUuid");

-- CreateIndex
CREATE INDEX "WebhookAttempt_deliveryUuid_attemptNumber_idx" ON "WebhookAttempt"("deliveryUuid", "attemptNumber");

-- CreateIndex
CREATE INDEX "WebhookAttempt_requestedAt_idx" ON "WebhookAttempt"("requestedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_tenantUuid_status_idx" ON "WebhookEvent"("tenantUuid", "status");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_eventType_receivedAt_idx" ON "WebhookEvent"("provider", "eventType", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "WebhookDeadLetter_provider_status_idx" ON "WebhookDeadLetter"("provider", "status");

-- CreateIndex
CREATE INDEX "WebhookDeadLetter_createdAt_idx" ON "WebhookDeadLetter"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookSecret_tenantUuid_webhookUuid_isActive_idx" ON "WebhookSecret"("tenantUuid", "webhookUuid", "isActive");

-- CreateIndex
CREATE INDEX "WebhookSecret_provider_isActive_idx" ON "WebhookSecret"("provider", "isActive");

-- CreateIndex
CREATE INDEX "WebhookSecret_status_expiresAt_idx" ON "WebhookSecret"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "WebhookReplay_provider_status_idx" ON "WebhookReplay"("provider", "status");

-- CreateIndex
CREATE INDEX "WebhookReplay_createdAt_idx" ON "WebhookReplay"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookOutbox_status_nextRetryAt_idx" ON "WebhookOutbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WebhookOutbox_tenantUuid_status_idx" ON "WebhookOutbox"("tenantUuid", "status");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_refreshTokenUuid_fkey" FOREIGN KEY ("refreshTokenUuid") REFERENCES "RefreshToken"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricAuth" ADD CONSTRAINT "BiometricAuth_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admin2FA" ADD CONSTRAINT "Admin2FA_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IPWhitelist" ADD CONSTRAINT "IPWhitelist_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUuid_fkey" FOREIGN KEY ("actorUuid") REFERENCES "TenantUser"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAuditSnapshot" ADD CONSTRAINT "PaymentAuditSnapshot_paymentUuid_fkey" FOREIGN KEY ("paymentUuid") REFERENCES "Payment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Permission"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleUuid_fkey" FOREIGN KEY ("roleUuid") REFERENCES "Role"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionUuid_fkey" FOREIGN KEY ("permissionUuid") REFERENCES "Permission"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionUuid_fkey" FOREIGN KEY ("permissionUuid") REFERENCES "Permission"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryPermission" ADD CONSTRAINT "TemporaryPermission_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryPermission" ADD CONSTRAINT "TemporaryPermission_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryPermission" ADD CONSTRAINT "TemporaryPermission_permissionUuid_fkey" FOREIGN KEY ("permissionUuid") REFERENCES "Permission"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerUuid_fkey" FOREIGN KEY ("ownerUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_walletUuid_fkey" FOREIGN KEY ("walletUuid") REFERENCES "Wallet"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOpeningHour" ADD CONSTRAINT "StoreOpeningHour_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOpeningHour" ADD CONSTRAINT "StoreOpeningHour_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCapacity" ADD CONSTRAINT "StoreCapacity_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCapacity" ADD CONSTRAINT "StoreCapacity_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreHourException" ADD CONSTRAINT "StoreHourException_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreHourException" ADD CONSTRAINT "StoreHourException_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAvailabilityCache" ADD CONSTRAINT "StoreAvailabilityCache_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAvailabilityCache" ADD CONSTRAINT "StoreAvailabilityCache_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOpsMetrics" ADD CONSTRAINT "StoreOpsMetrics_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOpsMetrics" ADD CONSTRAINT "StoreOpsMetrics_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessHourRule" ADD CONSTRAINT "BusinessHourRule_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessHourRule" ADD CONSTRAINT "BusinessHourRule_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_tenantUserUuid_fkey" FOREIGN KEY ("tenantUserUuid") REFERENCES "TenantUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_productUuid_fkey" FOREIGN KEY ("productUuid") REFERENCES "Product"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_tenantUserUuid_fkey" FOREIGN KEY ("tenantUserUuid") REFERENCES "TenantUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentUuid_fkey" FOREIGN KEY ("parentUuid") REFERENCES "Category"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAvailability" ADD CONSTRAINT "CategoryAvailability_categoryUuid_fkey" FOREIGN KEY ("categoryUuid") REFERENCES "Category"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDailyMetrics" ADD CONSTRAINT "CategoryDailyMetrics_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDailyMetrics" ADD CONSTRAINT "CategoryDailyMetrics_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDailyMetrics" ADD CONSTRAINT "CategoryDailyMetrics_categoryUuid_fkey" FOREIGN KEY ("categoryUuid") REFERENCES "Category"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryUuid_fkey" FOREIGN KEY ("categoryUuid") REFERENCES "Category"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productUuid_fkey" FOREIGN KEY ("productUuid") REFERENCES "Product"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_optionGroupUuid_fkey" FOREIGN KEY ("optionGroupUuid") REFERENCES "OptionGroup"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_optionGroupUuid_fkey" FOREIGN KEY ("optionGroupUuid") REFERENCES "ProductOptionGroup"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAvailability" ADD CONSTRAINT "ProductAvailability_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAvailability" ADD CONSTRAINT "ProductAvailability_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAvailability" ADD CONSTRAINT "ProductAvailability_productUuid_fkey" FOREIGN KEY ("productUuid") REFERENCES "Product"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productUuid_fkey" FOREIGN KEY ("productUuid") REFERENCES "Product"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_tenantUserUuid_fkey" FOREIGN KEY ("tenantUserUuid") REFERENCES "TenantUser"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyMetrics" ADD CONSTRAINT "ProductDailyMetrics_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyMetrics" ADD CONSTRAINT "ProductDailyMetrics_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyMetrics" ADD CONSTRAINT "ProductDailyMetrics_productUuid_fkey" FOREIGN KEY ("productUuid") REFERENCES "Product"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_optionGroupUuid_fkey" FOREIGN KEY ("optionGroupUuid") REFERENCES "OptionGroup"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuSnapshot" ADD CONSTRAINT "MenuSnapshot_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuSnapshot" ADD CONSTRAINT "MenuSnapshot_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuSnapshot" ADD CONSTRAINT "MenuSnapshot_previousVersionUuid_fkey" FOREIGN KEY ("previousVersionUuid") REFERENCES "MenuSnapshot"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuDiff" ADD CONSTRAINT "MenuDiff_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuDiff" ADD CONSTRAINT "MenuDiff_fromSnapshotUuid_fkey" FOREIGN KEY ("fromSnapshotUuid") REFERENCES "MenuSnapshot"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuDiff" ADD CONSTRAINT "MenuDiff_toSnapshotUuid_fkey" FOREIGN KEY ("toSnapshotUuid") REFERENCES "MenuSnapshot"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAnalyticEvents" ADD CONSTRAINT "MenuAnalyticEvents_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAnalyticEvents" ADD CONSTRAINT "MenuAnalyticEvents_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productUuid_fkey" FOREIGN KEY ("productUuid") REFERENCES "Product"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemUuid_fkey" FOREIGN KEY ("inventoryItemUuid") REFERENCES "InventoryItem"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryItemUuid_fkey" FOREIGN KEY ("inventoryItemUuid") REFERENCES "InventoryItem"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantUserUuid_fkey" FOREIGN KEY ("tenantUserUuid") REFERENCES "TenantUser"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_menuSnapshotUuid_fkey" FOREIGN KEY ("menuSnapshotUuid") REFERENCES "MenuSnapshot"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_takenBy_fkey" FOREIGN KEY ("takenBy") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_servedBy_fkey" FOREIGN KEY ("servedBy") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderUuid_fkey" FOREIGN KEY ("orderUuid") REFERENCES "Order"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productUuid_fkey" FOREIGN KEY ("productUuid") REFERENCES "Product"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderUuid_fkey" FOREIGN KEY ("orderUuid") REFERENCES "Order"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDailyMetrics" ADD CONSTRAINT "OrderDailyMetrics_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDailyMetrics" ADD CONSTRAINT "OrderDailyMetrics_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderUuid_fkey" FOREIGN KEY ("orderUuid") REFERENCES "Order"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_drawerUuid_fkey" FOREIGN KEY ("drawerUuid") REFERENCES "CashDrawer"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reconciliationReportUuid_fkey" FOREIGN KEY ("reconciliationReportUuid") REFERENCES "DailyReconciliation"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRestriction" ADD CONSTRAINT "PaymentRestriction_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAnomaly" ADD CONSTRAINT "PaymentAnomaly_paymentUuid_fkey" FOREIGN KEY ("paymentUuid") REFERENCES "Payment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAnomaly" ADD CONSTRAINT "PaymentAnomaly_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAnomaly" ADD CONSTRAINT "PaymentAnomaly_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_paymentUuid_fkey" FOREIGN KEY ("paymentUuid") REFERENCES "Payment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_orderUuid_fkey" FOREIGN KEY ("orderUuid") REFERENCES "Order"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawer" ADD CONSTRAINT "CashDrawer_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawer" ADD CONSTRAINT "CashDrawer_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawer" ADD CONSTRAINT "CashDrawer_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrop" ADD CONSTRAINT "CashDrop_cashDrawerUuid_fkey" FOREIGN KEY ("cashDrawerUuid") REFERENCES "CashDrawer"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrop" ADD CONSTRAINT "CashDrop_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_cashDrawerUuid_fkey" FOREIGN KEY ("cashDrawerUuid") REFERENCES "CashDrawer"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_paymentUuid_fkey" FOREIGN KEY ("paymentUuid") REFERENCES "Payment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderUuid_fkey" FOREIGN KEY ("orderUuid") REFERENCES "Order"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentUuid_fkey" FOREIGN KEY ("paymentUuid") REFERENCES "Payment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReconciliation" ADD CONSTRAINT "DailyReconciliation_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReconciliation" ADD CONSTRAINT "DailyReconciliation_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletUuid_fkey" FOREIGN KEY ("walletUuid") REFERENCES "Wallet"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_shiftUuid_fkey" FOREIGN KEY ("shiftUuid") REFERENCES "Shift"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakEntry" ADD CONSTRAINT "BreakEntry_timeEntryUuid_fkey" FOREIGN KEY ("timeEntryUuid") REFERENCES "TimeEntry"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakEntry" ADD CONSTRAINT "BreakEntry_shiftUuid_fkey" FOREIGN KEY ("shiftUuid") REFERENCES "Shift"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakPolicy" ADD CONSTRAINT "BreakPolicy_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakPolicy" ADD CONSTRAINT "BreakPolicy_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakViolation" ADD CONSTRAINT "BreakViolation_timeEntryUuid_fkey" FOREIGN KEY ("timeEntryUuid") REFERENCES "TimeEntry"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakViolation" ADD CONSTRAINT "BreakViolation_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakViolation" ADD CONSTRAINT "BreakViolation_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakViolation" ADD CONSTRAINT "BreakViolation_breakPolicyUuid_fkey" FOREIGN KEY ("breakPolicyUuid") REFERENCES "BreakPolicy"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_shiftUuid_fkey" FOREIGN KEY ("shiftUuid") REFERENCES "Shift"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAnnouncement" ADD CONSTRAINT "ShiftAnnouncement_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAnnouncement" ADD CONSTRAINT "ShiftAnnouncement_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPerformance" ADD CONSTRAINT "StaffPerformance_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPerformance" ADD CONSTRAINT "StaffPerformance_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPerformance" ADD CONSTRAINT "StaffPerformance_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffApprovalRequest" ADD CONSTRAINT "StaffApprovalRequest_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffApprovalRequest" ADD CONSTRAINT "StaffApprovalRequest_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffApprovalRequest" ADD CONSTRAINT "StaffApprovalRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffApprovalRequest" ADD CONSTRAINT "StaffApprovalRequest_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipPool" ADD CONSTRAINT "TipPool_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipPool" ADD CONSTRAINT "TipPool_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipDistribution" ADD CONSTRAINT "TipDistribution_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipDistribution" ADD CONSTRAINT "TipDistribution_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipDistribution" ADD CONSTRAINT "TipDistribution_tipPoolUuid_fkey" FOREIGN KEY ("tipPoolUuid") REFERENCES "TipPool"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipDistribution" ADD CONSTRAINT "TipDistribution_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_payrollPeriodUuid_fkey" FOREIGN KEY ("payrollPeriodUuid") REFERENCES "PayrollPeriod"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_payrollPeriodUuid_fkey" FOREIGN KEY ("payrollPeriodUuid") REFERENCES "PayrollPeriod"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborCostSnapshot" ADD CONSTRAINT "LaborCostSnapshot_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborCostSnapshot" ADD CONSTRAINT "LaborCostSnapshot_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborBudget" ADD CONSTRAINT "LaborBudget_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborBudget" ADD CONSTRAINT "LaborBudget_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreDailyMetrics" ADD CONSTRAINT "StoreDailyMetrics_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreDailyMetrics" ADD CONSTRAINT "StoreDailyMetrics_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyRevenue" ADD CONSTRAINT "HourlyRevenue_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyRevenue" ADD CONSTRAINT "HourlyRevenue_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_planPriceUuid_fkey" FOREIGN KEY ("planPriceUuid") REFERENCES "PlanPrice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanQuota" ADD CONSTRAINT "PlanQuota_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageQuota" ADD CONSTRAINT "UsageQuota_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnPrice" ADD CONSTRAINT "AddOnPrice_addOnUuid_fkey" FOREIGN KEY ("addOnUuid") REFERENCES "AddOn"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnPriceTier" ADD CONSTRAINT "AddOnPriceTier_addOnPriceUuid_fkey" FOREIGN KEY ("addOnPriceUuid") REFERENCES "AddOnPrice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnUsageRecord" ADD CONSTRAINT "AddOnUsageRecord_tenantAddOnUuid_fkey" FOREIGN KEY ("tenantAddOnUuid") REFERENCES "TenantAddOn"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAddOn" ADD CONSTRAINT "TenantAddOn_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAddOn" ADD CONSTRAINT "TenantAddOn_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAddOn" ADD CONSTRAINT "TenantAddOn_addOnUuid_fkey" FOREIGN KEY ("addOnUuid") REFERENCES "AddOn"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAddOn" ADD CONSTRAINT "TenantAddOn_addOnPriceUuid_fkey" FOREIGN KEY ("addOnPriceUuid") REFERENCES "AddOnPrice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planPriceUuid_fkey" FOREIGN KEY ("planPriceUuid") REFERENCES "PlanPrice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planVersionUuid_fkey" FOREIGN KEY ("planVersionUuid") REFERENCES "PlanVersion"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionUsageRecord" ADD CONSTRAINT "SubscriptionUsageRecord_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSchedule" ADD CONSTRAINT "SubscriptionSchedule_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSnapshot" ADD CONSTRAINT "BillingSnapshot_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSnapshot" ADD CONSTRAINT "BillingSnapshot_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSnapshot" ADD CONSTRAINT "BillingSnapshot_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSnapshot" ADD CONSTRAINT "BillingSnapshot_planVersionUuid_fkey" FOREIGN KEY ("planVersionUuid") REFERENCES "PlanVersion"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseContract" ADD CONSTRAINT "EnterpriseContract_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingSnapshotUuid_fkey" FOREIGN KEY ("billingSnapshotUuid") REFERENCES "BillingSnapshot"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceUuid_fkey" FOREIGN KEY ("invoiceUuid") REFERENCES "Invoice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceUuid_fkey" FOREIGN KEY ("invoiceUuid") REFERENCES "Invoice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_invoiceUuid_fkey" FOREIGN KEY ("invoiceUuid") REFERENCES "Invoice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceUuid_fkey" FOREIGN KEY ("invoiceUuid") REFERENCES "Invoice"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_parentAlertUuid_fkey" FOREIGN KEY ("parentAlertUuid") REFERENCES "AdminAlert"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertAction" ADD CONSTRAINT "AlertAction_alertUuid_fkey" FOREIGN KEY ("alertUuid") REFERENCES "AdminAlert"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_parentUuid_fkey" FOREIGN KEY ("parentUuid") REFERENCES "EmailTemplate"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_templateUuid_fkey" FOREIGN KEY ("templateUuid") REFERENCES "EmailTemplate"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_emailUuid_fkey" FOREIGN KEY ("emailUuid") REFERENCES "EmailOutbox"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandingSetting" ADD CONSTRAINT "BrandingSetting_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandingSetting" ADD CONSTRAINT "BrandingSetting_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingHistory" ADD CONSTRAINT "SettingHistory_settingUuid_fkey" FOREIGN KEY ("settingUuid") REFERENCES "PlatformSetting"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlagEvaluation" ADD CONSTRAINT "FeatureFlagEvaluation_flagUuid_fkey" FOREIGN KEY ("flagUuid") REFERENCES "FeatureFlag"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_flagUuid_fkey" FOREIGN KEY ("flagUuid") REFERENCES "FeatureFlag"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterJob" ADD CONSTRAINT "DeadLetterJob_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DLQRetry" ADD CONSTRAINT "DLQRetry_dlqJobUuid_fkey" FOREIGN KEY ("dlqJobUuid") REFERENCES "DeadLetterJob"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_jobHeartbeatUuid_fkey" FOREIGN KEY ("jobHeartbeatUuid") REFERENCES "JobHeartbeat"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookUuid_fkey" FOREIGN KEY ("webhookUuid") REFERENCES "Webhook"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookAttempt" ADD CONSTRAINT "WebhookAttempt_deliveryUuid_fkey" FOREIGN KEY ("deliveryUuid") REFERENCES "WebhookDelivery"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSecret" ADD CONSTRAINT "WebhookSecret_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSecret" ADD CONSTRAINT "WebhookSecret_webhookUuid_fkey" FOREIGN KEY ("webhookUuid") REFERENCES "Webhook"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookReplay" ADD CONSTRAINT "WebhookReplay_webhookEventUuid_fkey" FOREIGN KEY ("webhookEventUuid") REFERENCES "WebhookEvent"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
