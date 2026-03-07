import Joi from "joi";

export const MenuValidators = {
    
    getMenu: Joi.object({
        storeUuid: Joi.string().uuid().required(),
        tenantUuid: Joi.string().uuid().required(),
    }),

    validateOrder: Joi.object({
        productUuid: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(100).required(),
        selectedOptions: Joi.array().items(
            Joi.object({
                groupUuid: Joi.string().uuid().required(),
                optionUuids: Joi.array().items(Joi.string().uuid()).required(),
            })
        ).default([]),
    }),

    toggleFavorite: Joi.object({
        productUuid: Joi.string().uuid().required(),
    }),

    trackAnalytics: Joi.object({
        eventType: Joi.string().valid(
            "MENU_VIEW",
            "CATEGORY_VIEW", 
            "PRODUCT_VIEW",
            "PRODUCT_ADD_TO_CART"
        ).required(),
        entityUuid: Joi.string().uuid().optional(),
        sessionId: Joi.string().optional(),
        deviceType: Joi.string().valid("WEB", "IOS", "ANDROID").optional(),
    }),
};

// middleware/validateRequest.ts

export function validateRequest(schema: Joi.Schema) {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Invalid request data",
                details: error.details.map(d => ({
                    field: d.path.join("."),
                    message: d.message,
                })),
            });
        }

        req.body = value;
        next();
    };
}
