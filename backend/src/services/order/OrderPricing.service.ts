import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

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

            const groups: any[] = product.optionGroups ?? [];
            const selectedPerGroup = new Map<string, number>();

            for (const mod of inputItem.modifiers ?? []) {
                const group = groups.find((g) => g.options.some((o: any) => o.uuid === mod.optionUuid));
                const option = group?.options.find((o: any) => o.uuid === mod.optionUuid);

                if (!option) {
                    throw new Error(
                        `INVALID_MODIFIERS: option ${mod.optionUuid} is not available for ${product.name}`
                    );
                }

                const quantity = mod.quantity ?? 1;
                selectedPerGroup.set(group.uuid, (selectedPerGroup.get(group.uuid) ?? 0) + quantity);

                const modCost = option.extraCost * quantity;
                optionsCost += modCost;

                selectedOptions.push({
                    groupName: group.name,
                    optionName: option.name,
                    optionUuid: option.uuid,
                    cost: modCost,
                });
            }

            this.assertModifierLimits(product.name, groups, selectedPerGroup);

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

    // TODO: store/tenant promo codes need their own model (scoped by
    // tenantUuid/storeUuid, with usage limits). Until it exists no code is
    // applied. `Coupon` is SaaS subscription billing and must never discount
    // an order, or a platform code could zero out a customer's bill.
    private static async applyPromotions(
        tenantUuid: string,
        storeUuid: string,
        items: ResolvedOrderItem[],
        subtotal: number,
        options?: { promoCode?: string; userTier?: string }
    ): Promise<{ discountAmount: number; appliedPromos: any[] }> {
        if (options?.promoCode) {
            logWithContext("warn", "[OrderPricing] Promo code ignored: order promos not supported", {
                tenantUuid,
                storeUuid,
            });
        };

        return { discountAmount: 0, appliedPromos: [] };
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
    
        // Stored as a percentage: 5.0 means 5%
        const taxRate = store?.taxRate?.toNumber() ?? 10;
    
        const taxableAmount = items.reduce(
          (sum, item) => sum + item.finalPrice,
          0
        );
    
        const taxAmount = Math.round(taxableAmount * (taxRate / 100));
    
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
    
        // Stored as a percentage: 5.0 means 5%
        const rate = store?.serviceChargeRate?.toNumber() ?? 0;
        return Math.round(subtotal * (rate / 100));
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
    
    // Enforce each option group's selection rules, as resolved by the menu
    // (product-level overrides already applied). A selection counts its
    // quantity: two "extra shot" counts as 2 toward maxSelections. Groups the
    // customer didn't touch are checked too, so required groups can't be
    // skipped.
    private static assertModifierLimits(
        productName: string,
        groups: any[],
        selectedPerGroup: Map<string, number>
    ) {
        for (const group of groups) {
            const selected = selectedPerGroup.get(group.uuid) ?? 0;
            const min = Math.max(group.minSelections ?? 0, group.isRequired ? 1 : 0);
            // A single-choice group without an explicit max allows one
            const max = group.maxSelections ?? (group.selectionType === "SINGLE" ? 1 : null);

            if (selected < min) {
                throw new Error(
                    `INVALID_MODIFIERS: "${group.name}" on ${productName} requires at least ${min} selection(s), got ${selected}`
                );
            }
            if (max !== null && selected > max) {
                throw new Error(
                    `INVALID_MODIFIERS: "${group.name}" on ${productName} allows at most ${max} selection(s), got ${selected}`
                );
            }
        }
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

