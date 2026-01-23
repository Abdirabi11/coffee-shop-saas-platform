export interface PaymentProvider {
    confirm(data: any): Promise<{
      providerRef: string;
      snapshot: any;
    }>;
  
    refund(input: {
      amount: number;
      paymentRef: string;
    }): Promise<string>;
}