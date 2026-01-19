
export class PaymentSnapshotService{
    static async create(
        tx: PrismaTx, 
        input:{
            orderUuid: string;
            storeUuid: string;
            currency: string;
            subtotal: number;
            tax: number;
            discount: number;
            total: number;
            provider: string;
            itemsSnapshot: any;
            pricingRules: any;
        }
    ) {
        return tx.paymentSnapshot.create({
            data: {
                orderUuid: input.orderUuid,
                storeUuid: input.storeUuid,
                currency: input.currency,
                subtotal: input.subtotal,
                tax: input.tax,
                discount: input.discount,
                total: input.total,
                provider: input.provider,
                itemsSnapshot: input.itemsSnapshot,
                pricingRules: input.pricingRules,
                status: "PENDING",
            },
        });
    }
};