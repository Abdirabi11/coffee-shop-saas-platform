import {z} from "zod"

export const createOrderSchema = z.object({
  storeUuid: z.string().uuid(),
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  tableNumber: z.string().optional(),
  deliveryAddress: z.any().optional(),
  customerNotes: z.string().max(500).optional(),
  promoCode: z.string().max(50).optional(),
  items: z.array(
    z.object({
      productUuid: z.string().uuid(),
      quantity: z.number().int().min(1).max(100),
      specialInstructions: z.string().max(200).optional(),
      modifiers: z.array(
        z.object({
          optionUuid: z.string().uuid(),
          quantity: z.number().int().min(1).optional(),
        })
      ).optional(),
    })
  ).min(1).max(50),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "PAYMENT_PENDING",
    "PAID",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
    "PAYMENT_FAILED",
  ]),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const addItemSchema = z.object({
  productUuid: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  modifiers: z.array(
    z.object({
      optionUuid: z.string().uuid(),
      quantity: z.number().int().min(1).optional(),
    })
  ).optional(),
  specialInstructions: z.string().max(200).optional(),
});

export const syncOrderSchema = z.object({
  clientOrderUuid: z.string().uuid(),
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  items: z.array(z.any()).min(1),
  totalAmount: z.number().int().min(0),
  status: z.string(),
  createdAt: z.string().datetime(),
  lastModifiedAt: z.string().datetime(),
  syncVersion: z.number().int(),
});