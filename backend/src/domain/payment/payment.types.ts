export interface PaymentIntentResult {
    providerRef: string;
    clientSecret?: string;
    status: "REQUIRES_ACTION" | "PAID" | "FAILED" | "PENDING";
    snapshot?: any;
}
 
export interface PaymentLookupResult {
    status: "PAID" | "FAILED" | "PENDING";
    providerRef?: string;
    snapshot?: any;
}
 
export interface RefundResult {
    providerRef: string;
    snapshot?: any;
}
 
export interface FraudPayload {
    tenantUserUuid?: string;
    paymentUuid?: string;
    orderUuid?: string;
    tenantUuid?: string;
    storeUuid?: string;
    provider?: string;
    failureCode?: string;
    failureReason?: string;
    amount?: number;
    ipAddress?: string;
    refundUuid?: string;
}
 
export interface ReconciliationResult {
    hasDiscrepancy: boolean;
    paymentVariance: number;
    refundVariance: number;
    netVariance: number;
    missingInOurSystem: string[];
    missingInProvider: string[];
}