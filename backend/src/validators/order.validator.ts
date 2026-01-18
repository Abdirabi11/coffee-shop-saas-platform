import {z} from "zod"

export const createOrderSchema= z.object({
    storeUuid: z.string().uuid(),

    items: z.array(
        z.object({
          productUuid: z.string().uuid(),
          quantity: z.number().int().min(1),
          modifiers: z
            .array(
              z.object({
                optionUuid: z.string().uuid(),
                quantity: z.number().int().min(1).optional(),
              })
            )
            .optional(),
        })
    ).min(1),

    experiment: z
    .object({
        name: z.string(),
        variant: z.string(),
    })
    .optional(),
});
export type CreateOrderDTO = z.infer<typeof createOrderSchema>;