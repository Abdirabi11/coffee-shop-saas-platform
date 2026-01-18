
export class PaymentSnapshotService{
    static async create(tx: PrismaTx, data:{
        orderUuid: string;
        currency: string;
        subtotal: number;
        tax: number;
        total: number;
        provider: string;
    }) {
        return tx.paymentSnapshot.create({
            data: {
              orderUuid: data.orderUuid,
              currency: data.currency,
              subtotal: data.subtotal,
              tax: data.tax,
              total: data.total,
              provider: data.provider,
              status: "PENDING",
            },
        });
    }
};