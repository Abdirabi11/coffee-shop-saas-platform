//REQUEST/RESPONSE TRANSFORMERS (DTOs)

export class OrderResponseDTO {
    static toPublic(order: any) {
        return {
            uuid: order.uuid,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            totalAmount: order.totalAmount,
            currency: order.currency,
            items: order.items?.map((item: any) => ({
                uuid: item.uuid,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                finalPrice: item.finalPrice,
            })),
            createdAt: order.createdAt,
            // Exclude internal fields
        };
    }
  
    static toStaff(order: any) {
        return {
            ...this.toPublic(order),
            // Add staff-only fields
            inventoryCommitted: order.inventoryCommitted,
            inventoryReleased: order.inventoryReleased,
            customerPhone: order.customerPhone,
            internalNotes: order.internalNotes,
        };
    }
}