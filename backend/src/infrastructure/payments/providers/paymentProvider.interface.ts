export interface PaymentProvider {
  createIntent(input: {
    amount: number;
    currency: string;
    metadata: Record<string, any>;
  }): Promise<{
    providerRef: string;
    clientSecret?: string;
    status: "REQUIRES_ACTION" | "PAID" | "FAILED" | "PENDING";
    snapshot?: any;
  }>;
 
  lookup(providerRef: string): Promise<{
    status: "PAID" | "FAILED" | "PENDING";
    providerRef?: string;
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