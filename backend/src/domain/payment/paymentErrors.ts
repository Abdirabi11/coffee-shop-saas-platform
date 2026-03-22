export type NormalizedProviderError =
    | "INSUFFICIENT_FUNDS"
    | "CARD_DECLINED"
    | "CARD_EXPIRED"
    | "INVALID_CVV"
    | "AUTHENTICATION_REQUIRED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_UNAVAILABLE"
    | "FRAUD_SUSPECTED"
    | "AMOUNT_TOO_LARGE"
    | "AMOUNT_TOO_SMALL"
    | "CURRENCY_NOT_SUPPORTED"
    | "DUPLICATE_TRANSACTION"
    | "NETWORK_ERROR"
    | "WALLET_DISABLED"
    | "UNKNOWN_ERROR";
 
export class PaymentError extends Error {
    public code: string;
    public statusCode: number;
  
    constructor(code: string, message: string, statusCode: number = 400) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.name = "PaymentError";
    }
  
    static notFound(entity: string = "Payment") {
      return new PaymentError(`${entity.toUpperCase()}_NOT_FOUND`, `${entity} not found`, 404);
    }
  
    static invalidState(from: string, to: string) {
      return new PaymentError("INVALID_STATE_TRANSITION", `Cannot transition from ${from} to ${to}`, 409);
    }
  
    static locked() {
      return new PaymentError("PAYMENT_LOCKED", "Payment is locked by risk policy", 403);
    }
  
    static rateLimited() {
      return new PaymentError("RATE_LIMITED", "Payment rate limit exceeded", 429);
    }
}