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

// The pricing fields totalsFor reads and writes
type PricedItem = Pick<ResolvedOrderItem, "subtotal" | "discountAmount" | "finalPrice" | "taxAmount">;

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

        const totals = await this.totalsFor(tenantUuid, storeUuid, resolvedItems, options);

        return {
            items: resolvedItems,
            ...totals,
        };
    }

    // Order-level totals for items that are already priced: promotions, tax
    // and service charge, with the discount and tax distributed back onto the
    // items (which are updated in place). New orders and modified orders
    // (OrderModificationService) both total through here, so they agree.
    static async totalsFor(
        tenantUuid: string,
        storeUuid: string,
        items: PricedItem[],
        options?: {
          promoCode?: string;
          userTier?: string;
        }
    ) {
        for (const item of items) {
            item.discountAmount = 0;
            item.finalPrice = item.subtotal;
        }
        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

        const { discountAmount, appliedPromos } = await this.applyPromotions(
            tenantUuid,
            storeUuid,
            items,
            subtotal,
            options
        );
        if (discountAmount > 0) {
            this.distributeDiscount(items, discountAmount);
        };

        const { taxAmount, taxBreakdown } = await this.calculateTax(
            tenantUuid,
            storeUuid,
            items
        );

        this.distributeTax(items, taxAmount);

        const serviceCharge = await this.calculateServiceCharge(
          tenantUuid,
          storeUuid,
          subtotal
        );

        const totalAmount = subtotal - discountAmount + taxAmount + serviceCharge;

        return {
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
        items: PricedItem[],
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
        items: PricedItem[]
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

    // Split `total` across items in proportion to `weights`, in whole units,
    // so the shares always add up to exactly `total` (largest remainder:
    // round everything down, then hand the leftover units to the items with
    // the biggest fractions). Rounding each share on its own could be off by
    // a unit per item.
    private static allocate(total: number, weights: number[]): number[] {
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        if (totalWeight <= 0) return weights.map(() => 0);

        const exact = weights.map((w) => (total * w) / totalWeight);
        const shares = exact.map(Math.floor);
        let leftover = total - shares.reduce((sum, s) => sum + s, 0);

        const byFraction = exact
            .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
            .sort((a, b) => b.fraction - a.fraction);
        for (const { index } of byFraction) {
            if (leftover <= 0) break;
            shares[index]++;
            leftover--;
        }

        return shares;
    }

    private static distributeDiscount(
        items: PricedItem[],
        totalDiscount: number
      ) {
        const shares = this.allocate(totalDiscount, items.map((item) => item.subtotal));

        items.forEach((item, i) => {
          item.discountAmount = shares[i];
          item.finalPrice = item.subtotal - item.discountAmount;
        });
    }

    private static distributeTax(
        items: PricedItem[],
        totalTax: number
      ) {
        const shares = this.allocate(totalTax, items.map((item) => item.finalPrice));

        items.forEach((item, i) => {
          item.taxAmount = shares[i];
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

