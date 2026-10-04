export interface PaymentProvider {
  createIntent(input: {
    amount: number;
    currency: string;
    metadata: Record<string, any>;
    // Same key => same intent. Retries after a timeout must reuse it.
    idempotencyKey: string;
  }): Promise<{
    providerRef: string;
    clientSecret?: string;
    status: "REQUIRES_ACTION" | "PAID" | "FAILED" | "PENDING";
    snapshot?: any;
  }>;
 
  lookup(providerRef: string): Promise<{
    status: "PAID" | "FAILED" | "PENDING";
    providerRef?: string;
    // Amount actually collected, in minor units (cents); null if unknown
    amountReceived: number | null;
    currency: string | null;
    snapshot?: any;
  }>;
 
  refund(input: {
    providerRef: string;
    amount: number;
  }): Promise<{
    providerRef: string;
    snapshot?: any;
  }>;
 
  // Optional: not all providers support cancellation
  cancel?(input: { providerRef: string }): Promise<void>;
}