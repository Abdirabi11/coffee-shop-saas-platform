import axios from "axios";
import { logWithContext } from "../../observability/logger.ts";
import { PaymentProviderAdapter } from "./paymentProvider.adapter.ts";

export class EVCPlusProvider implements PaymentProviderAdapter {
    private baseURL: string;
    private merchantUuid: string;
    private apiKey: string;
    constructor() {
        this.baseURL = process.env.EVC_PLUS_API_URL || "https://api.evcplus.so/v1";
        this.merchantUuid = process.env.EVC_PLUS_MERCHANT_UUID!;
        this.apiKey = process.env.EVC_PLUS_API_KEY!;
    }

    async createIntent(input: {
        amount: number;
        currency: string;
        metadata: Record<string, any>;
    }) {
        try {
            const response= await axios.post(
                `${this.baseURL}/payments`,
                {
                    merchant_uuid: this.merchantUuid,
                    amount: input.amount / 100, 
                    currency: input.currency,
                    phone_number: input.metadata.customerPhone, 
                    description: `Order ${input.metadata.orderUuid}`,
                    callback_url: `${process.env.APP_URL}/webhooks/evc`,
                    metadata: input.metadata,
                },
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            logWithContext("info", "EVC Plus payment created", {
                transactionId: response.data.transaction_id,
                amount: input.amount,
            });
        
            return {
                providerRef: response.data.transaction_id,
                clientSecret: response.data.payment_token, 
                status: this.normalizeStatus(response.data.status),
                snapshot: response.data,
            };
        } catch (error: any) {
            logWithContext("error", "EVC Plus payment creation failed", {
                error: error.response?.data || error.message,
            });
            throw this.normalizeError(error);
        }
    }

    async lookup(providerRef: string) {
        try {
            const response = await axios.get(
                `${this.baseURL}/payments/${providerRef}`,
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                    },
                }
            );
    
            return {
                status: this.normalizeStatus(response.data.status),
                providerRef: response.data.transaction_uuid,
                snapshot: response.data,
            };
        } catch (error: any) {
            logWithContext("error", "EVC Plus lookup failed", {
                providerRef,
                error: error.response?.data || error.message,
            });
            throw this.normalizeError(error);
        }
    }
    
    async refund(input: { providerRef: string; amount: number }) {
        try {
            const response = await axios.post(
                `${this.baseURL}/refunds`,
                {
                    merchant_uuid: this.merchantUuid,
                    transaction_id: input.providerRef,
                    amount: input.amount / 100,
                    reason: "Customer refund request",
                },
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json",
                    },
                }
            );
        
            logWithContext("info", "EVC Plus refund processed", {
                refundUuid: response.data.refund_uuid,
                amount: input.amount,
            });
    
            return {
                providerRef: response.data.refund_id,
                snapshot: response.data,
            };
        } catch (error: any) {
            logWithContext("error", "EVC Plus refund failed", {
                error: error.response?.data || error.message,
            });
            throw this.normalizeError(error);
        }
    }

    /**
     * Normalize EVC Plus status to our internal status
    */
    private normalizeStatus(status: string): "REQUIRES_ACTION" | "PAID" | "FAILED" | "PENDING" {
        switch (status.toLowerCase()) {
            case "pending":
            case "initiated":
                return "REQUIRES_ACTION";
            case "completed":
            case "success":
                return "PAID";
            case "failed":
            case "rejected":
            case "cancelled":
                return "FAILED";
            default:
                return "PENDING";
        }
    }

    /**
     * Normalize EVC Plus errors to our internal error codes
    */
    private normalizeError(error: any): Error {
        const errorCode = error.response?.data?.error_code || error.code;

        switch (errorCode) {
            case "INSUFFICIENT_BALANCE":
                return new Error("INSUFFICIENT_FUNDS");
            case "INVALID_PHONE":
            case "ACCOUNT_NOT_FOUND":
                return new Error("WALLET_DISABLED");
            case "TRANSACTION_LIMIT_EXCEEDED":
                return new Error("AMOUNT_TOO_LARGE");
            case "DUPLICATE_TRANSACTION":
                return new Error("DUPLICATE_TRANSACTION");
            case "TIMEOUT":
                return new Error("PROVIDER_TIMEOUT");
            default:
                return new Error("PROVIDER_UNAVAILABLE");
        }
    }

    /**
     * Verify webhook signature
    */
    verifyWebhook(payload: any, signature: string): boolean {
        const crypto = require("crypto");
        const secret = process.env.EVC_PLUS_WEBHOOK_SECRET!;

        const computed = crypto
          .createHmac("sha256", secret)
          .update(JSON.stringify(payload))
          .digest("hex");

        return computed === signature;
    }
};

