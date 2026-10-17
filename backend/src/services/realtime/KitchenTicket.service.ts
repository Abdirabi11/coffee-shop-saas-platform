import prisma from "../../config/prisma.ts";

// What staff screens (KDS, store dashboard) get for an order over the store
// room: what to make and for whom. Every assigned staff member of the store
// can be in that room, so it carries no phone number, delivery address,
// payment details or prices.
export interface KitchenTicket {
    uuid: string;
    orderNumber: string;
    orderType: string;
    status: string;
    tableNumber: string | null;
    customerName: string | null;
    customerNotes: string | null;
    createdAt: Date;
    items: Array<{
        uuid: string;
        productName: string;
        quantity: number;
        specialInstructions: string | null;
        modifiers: Array<{ groupName: string; optionName: string }>;
    }>;
}

export class KitchenTicketService {

    static async forOrder(orderUuid: string): Promise<KitchenTicket | null> {
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            select: {
                uuid: true,
                orderNumber: true,
                orderType: true,
                status: true,
                tableNumber: true,
                customerName: true,
                customerNotes: true,
                createdAt: true,
                items: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        uuid: true,
                        productName: true,
                        quantity: true,
                        specialInstructions: true,
                        selectedOptions: true,
                    },
                },
            },
        });
        if (!order) return null;

        return {
            ...order,
            orderType: String(order.orderType),
            status: String(order.status),
            items: order.items.map(({ selectedOptions, ...item }) => ({
                ...item,
                // Stored with each option's cost; the kitchen only needs the names
                modifiers: Array.isArray(selectedOptions)
                    ? selectedOptions.map((o: any) => ({ groupName: String(o?.groupName ?? ""), optionName: String(o?.optionName ?? "") }))
                    : [],
            })),
        };
    }

    // Order number and the customer's user, for status broadcasts
    static async summary(orderUuid: string) {
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            select: { orderNumber: true, tenantUser: { select: { userUuid: true } } },
        });
        if (!order) return null;
        return { orderNumber: order.orderNumber, customerUserUuid: order.tenantUser?.userUuid ?? null };
    }
}
