import prisma from "../../config/prisma.ts"

type ResolvedOrderItem = {
    productUuid: string;
    quantity: number;
    price: number; // per item (including modifiers)
};

interface CreateOrderItemInput {
    productUuid: string;
    quantity: number;
    modifiers?: {
      optionUuid: string;
      quantity?: number;
    }[];
};

export class OrderPricingService{
    static resolveItems(menu: any, items: CreateOrderItemInput[]){
        const resolvedItems: ResolvedOrderItem[] = [];
        let subtotal = 0;

        for(const inputItem of items){
            const product = this.findProduct(menu, inputItem.productUuid);
            if (!product) {
              throw new Error(`Product not found: ${inputItem.productUuid}`);
            };

            let unitPrice = product.price;

            if (inputItem.modifiers?.length) {
                for(const mod of inputItem.modifiers){
                    const option = product.modifiers
                     ?.flatMap((m) => m.options)
                     .find((o) => o.uuid === mod.optionUuid);
        
                    if (!option) {
                        throw new Error(`Modifier option not found`);
                    }
        
                    unitPrice += option.price * (mod.quantity ?? 1);
                }
            };

            subtotal += unitPrice * inputItem.quantity;

            resolvedItems.push({
                productUuid: product.uuid,
                quantity: inputItem.quantity,
                price: unitPrice,
            });
        };

        const tax = Math.round(subtotal * 0.1); // example
        const total = subtotal + tax;

        return {
            items: resolvedItems,
            subtotal, tax, total
        };
    };
    
    private static findProduct(menu: any, productUuid: string) {
        for(const category of menu.categories){
            const product = category.products.find(
                (p) => p.uuid === productUuid
            );
            if (product) return product;
        };
        return null;
    }
};