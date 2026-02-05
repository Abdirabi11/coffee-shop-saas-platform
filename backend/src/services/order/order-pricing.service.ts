import prisma from "../../config/prisma.ts"

type ResolvedOrderItem = {
    productUuid: string;
    productName: string;
    categoryName?: string;
    quantity: number;
    basePrice: number;
    optionsCost: number;
    unitPrice: number;
    subtotal: number;
    discountAmount: number;
    finalPrice: number;
    taxAmount: number;
    selectedOptions: Array<{
        groupName: string;
        optionName: string;
        optionUuid: string;
        cost: number;
    }>;
};

interface CreateOrderItemInput {
    productUuid: string;
    quantity: number;
    modifiers?: {
      optionUuid: string;
      quantity?: number;
    }[];
};

interface PricingResult {
    items: ResolvedOrderItem[];
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    serviceCharge: number;
    totalAmount: number;
    appliedPromos: any[];
    taxBreakdown: any[];
};
  
export class OrderPricingService{
    static async resolveItems(
        tenantUuid: string,
        storeUuid: string,
        menu: any,
        items: CreateOrderItemInput[],
        options?: {
          promoCode?: string;
          userTier?: string;
        }
    ): Promise<PricingResult> {
        const resolvedItems: ResolvedOrderItem[] = [];
        let subtotal = 0;

        for(const inputItem of items){
            const product = this.findProduct(menu, inputItem.productUuid);
            if (!product) {
              throw new Error(`Product not found: ${inputItem.productUuid}`);
            };

            let basePrice = product.basePrice;
            let optionsCost = 0;
            const selectedOptions: any[] = [];

            if (inputItem.modifiers?.length) {
                for(const mod of inputItem.modifiers){
                    const option = product.optionGroups
                        ?.flatMap((g: any) => g.options)
                        .find((o: any) => o.uuid === mod.optionUuid);
        
                    if (!option) {
                        throw new Error(`Modifier option not found`);
                    }

                    const modCost = option.extraCost * (mod.quantity ?? 1);
                    optionsCost += modCost;

                    selectedOptions.push({
                        groupName: option.groupName,
                        optionName: option.name,
                        optionUuid: option.uuid,
                        cost: modCost,
                    });
                }
            };

            const unitPrice = basePrice + optionsCost;
            const itemSubtotal = unitPrice * inputItem.quantity;
            subtotal += itemSubtotal;

            resolvedItems.push({
                productUuid: product.uuid,
                productName: product.name,
                categoryName: product.categoryName,
                quantity: inputItem.quantity,
                basePrice,
                optionsCost,
                unitPrice,
                subtotal: itemSubtotal,
                discountAmount: 0, 
                finalPrice: itemSubtotal,
                taxAmount: 0, 
                selectedOptions,
            });
        };

        const { discountAmount, appliedPromos } = await this.applyPromotions(
            tenantUuid,
            storeUuid,
            resolvedItems,
            subtotal,
            options
        );
        if (discountAmount > 0) {
            this.distributeDiscount(resolvedItems, discountAmount);
        };

        const { taxAmount, taxBreakdown } = await this.calculateTax(
            tenantUuid,
            storeUuid,
            resolvedItems
        );

        this.distributeTax(resolvedItems, taxAmount);

        const serviceCharge = await this.calculateServiceCharge(
          tenantUuid,
          storeUuid,
          subtotal
        );

        const totalAmount = subtotal - discountAmount + taxAmount + serviceCharge;

        return {
            items: resolvedItems,
            subtotal,
            taxAmount,
            discountAmount,
            serviceCharge,
            totalAmount,
            appliedPromos,
            taxBreakdown,
        };
    }

    private static async applyPromotions(
        tenantUuid: string,
        storeUuid: string,
        items: ResolvedOrderItem[],
        subtotal: number,
        options?: { promoCode?: string; userTier?: string }
    ) {
        let discountAmount = 0;
        const appliedPromos: any[] = [];

        if (options?.promoCode) {
            const promo = await prisma.coupon.findFirst({
                where: {
                    code: options.promoCode,
                    isActive: true,
                    validFrom: { lte: new Date() },
                    OR: [
                        { validUntil: null },
                        { validUntil: { gte: new Date() } },
                    ],
                },
            });

            if (promo) {
                if (promo.minimumAmount && subtotal < promo.minimumAmount) {
                throw new Error(
                    `Minimum order amount not met for promo: ${promo.minimumAmount}`
                );
                }

                let promoDiscount = 0;
                if (promo.discountType === "PERCENTAGE") {
                    promoDiscount = Math.round(subtotal * (promo.percentOff / 100));
                }
            }else if (promo.discountType === "FIXED_AMOUNT") {
                promoDiscount = promo.amountOff;
            }

            discountAmount += promoDiscount;
            appliedPromos.push({
            code: promo.code,
            type: promo.discountType,
            amount: promoDiscount,
            });
        }
    }

    private static async calculateTax(
        tenantUuid: string,
        storeUuid: string,
        items: ResolvedOrderItem[]
     ) {
        const store = await prisma.store.findUnique({
          where: { uuid: storeUuid },
          select: { taxRate: true },
        });
    
        const taxRate = store?.taxRate ?? 0.1; 
    
        const taxableAmount = items.reduce(
          (sum, item) => sum + item.finalPrice,
          0
        );
    
        const taxAmount = Math.round(taxableAmount * taxRate);
    
        const taxBreakdown = [
          {
            type: "SALES_TAX",
            rate: taxRate,
            amount: taxAmount,
          },
        ];
    
        return { taxAmount, taxBreakdown };
    }

    private static async calculateServiceCharge(
        tenantUuid: string,
        storeUuid: string,
        subtotal: number
      ) {
        const store = await prisma.store.findUnique({
          where: { uuid: storeUuid },
          select: { serviceChargeRate: true },
        });
    
        const rate = store?.serviceChargeRate ?? 0;
        return Math.round(subtotal * rate);
    }

    private static distributeDiscount(
        items: ResolvedOrderItem[],
        totalDiscount: number
      ) {
        const totalSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    
        items.forEach((item) => {
          const proportion = item.subtotal / totalSubtotal;
          item.discountAmount = Math.round(totalDiscount * proportion);
          item.finalPrice = item.subtotal - item.discountAmount;
        });
    }

    private static distributeTax(
        items: ResolvedOrderItem[],
        totalTax: number
      ) {
        const totalFinalPrice = items.reduce(
          (sum, item) => sum + item.finalPrice,
          0
        );
    
        items.forEach((item) => {
          const proportion = item.finalPrice / totalFinalPrice;
          item.taxAmount = Math.round(totalTax * proportion);
        });
    }
    
    private static findProduct(menu: any, productUuid: string) {
        for(const category of menu.categories ?? []){
            const product = category.products?.find(
                (p: any) => p.uuid === productUuid
            );
            if (product) {
                return {
                  ...product,
                  categoryName: category.name,
                };
            }
        };
        return null;
    }
};

