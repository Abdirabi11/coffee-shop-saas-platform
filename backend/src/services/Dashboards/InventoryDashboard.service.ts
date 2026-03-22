import { withCache } from "../../cache/cache.ts";
import prisma from "../../config/prisma.ts"


export class InventoryDashboardService {
    // STORE MANAGER VIEW — inventory health for a single store 
    static async getStoreInventoryHealth(tenantUuid: string, storeUuid: string) {
        const cacheKey = `store:${storeUuid}:inventory`;

        return withCache(cacheKey, 60, async () => {
            const [totals, lowStock, outOfStock, recentMovements] = await Promise.all([
                // Overall counts by status
                prisma.inventoryItem.groupBy({
                    by: ["status"],
                    where: { tenantUuid, storeUuid },
                    _count: true,
                }),

                // Low stock items (for the dashboard list)
                prisma.inventoryItem.findMany({
                    where: { tenantUuid, storeUuid, status: "LOW_STOCK" },
                    include: { product: { select: { name: true } } },
                    orderBy: { availableStock: "asc" },
                    take: 10,
                }),

                // Out of stock items
                prisma.inventoryItem.findMany({
                    where: { tenantUuid, storeUuid, status: "OUT_OF_STOCK" },
                    include: { product: { select: { name: true } } },
                    take: 10,
                }),

                // Recent movements (last 24h)
                prisma.inventoryMovement.findMany({
                    where: {
                        tenantUuid,
                        storeUuid,
                        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 20,
                    select: {
                        type: true,
                        quantity: true,
                        reason: true,
                        createdAt: true,
                        productUuid: true,
                    },
                }),
            ]);

            // Build status counts map
            const statusCounts: Record<string, number> = {};
            for (const group of totals) {
                statusCounts[group.status] = group._count;
            }

            const totalItems = Object.values(statusCounts).reduce((s, c) => s + c, 0);
            const lowCount = statusCounts["LOW_STOCK"] ?? 0;
            const outCount = statusCounts["OUT_OF_STOCK"] ?? 0;

            return {
                summary: {
                    totalTracked: totalItems,
                    inStock: statusCounts["IN_STOCK"] ?? 0,
                    lowStock: lowCount,
                    outOfStock: outCount,
                    healthScore:
                    totalItems > 0
                        ? Math.round(((totalItems - lowCount - outCount) / totalItems) * 100)
                        : 100,
                    status:
                    outCount > 0
                        ? "CRITICAL"
                        : lowCount > 0
                        ? "WARNING"
                        : "HEALTHY",
                },
                lowStockItems: lowStock.map((i) => ({
                    productUuid: i.productUuid,
                    productName: i.product?.name,
                    availableStock: i.availableStock,
                    reorderPoint: i.reorderPoint,
                    unit: i.unit,
                })),
                outOfStockItems: outOfStock.map((i) => ({
                    productUuid: i.productUuid,
                    productName: i.product?.name,
                })),
                recentActivity: recentMovements,
            };
        });
    }

    // TENANT ADMIN VIEW — inventory health across all stores 
    static async getTenantInventoryHealth(tenantUuid: string) {
        const cacheKey = `tenant:${tenantUuid}:inventory`;
    
        return withCache(cacheKey, 120, async () => {
            // Per-store status breakdown
            const storeHealth = await prisma.inventoryItem.groupBy({
                by: ["storeUuid", "status"],
                where: { tenantUuid },
                _count: true,
            });
        
            // Get store names
            const storeUuids = [...new Set(storeHealth.map((s) => s.storeUuid))];
            const stores = await prisma.store.findMany({
                where: { uuid: { in: storeUuids } },
                select: { uuid: true, name: true },
            });
            const storeMap = new Map(stores.map((s) => [s.uuid, s.name]));
    
            // Build per-store summary
            const byStore = new Map<
                string,
                { name: string; inStock: number; lowStock: number; outOfStock: number; total: number }
            >();
    
            for (const row of storeHealth) {
                if (!byStore.has(row.storeUuid)) {
                    byStore.set(row.storeUuid, {
                        name: storeMap.get(row.storeUuid) ?? "Unknown",
                        inStock: 0,
                        lowStock: 0,
                        outOfStock: 0,
                        total: 0,
                    });
                }
                const entry = byStore.get(row.storeUuid)!;
                entry.total += row._count;
        
                if (row.status === "IN_STOCK") entry.inStock += row._count;
                else if (row.status === "LOW_STOCK") entry.lowStock += row._count;
                else if (row.status === "OUT_OF_STOCK") entry.outOfStock += row._count;
            }
    
            const storesSummary = Array.from(byStore.entries()).map(
                ([storeUuid, data]) => ({
                    storeUuid,
                    storeName: data.name,
                    ...data,
                    healthScore:
                        data.total > 0
                        ? Math.round(
                            ((data.total - data.lowStock - data.outOfStock) / data.total) * 100
                            )
                        : 100,
                })
            );
    
            // Top items that need attention across all stores
            const criticalItems = await prisma.inventoryItem.findMany({
                where: { tenantUuid, status: "OUT_OF_STOCK" },
                include: {
                    product: { select: { name: true } },
                    store: { select: { name: true } },
                },
                take: 15,
            });
    
            const totalLow = storesSummary.reduce((s, st) => s + st.lowStock, 0);
            const totalOut = storesSummary.reduce((s, st) => s + st.outOfStock, 0);
            const totalItems = storesSummary.reduce((s, st) => s + st.total, 0);
    
            return {
                overall: {
                    totalTrackedItems: totalItems,
                    lowStockCount: totalLow,
                    outOfStockCount: totalOut,
                    storesWithIssues: storesSummary.filter(
                        (s) => s.lowStock > 0 || s.outOfStock > 0
                ).length,
                overallHealth:
                    totalItems > 0
                    ? Math.round(((totalItems - totalLow - totalOut) / totalItems) * 100)
                    : 100,
                },
                byStore: storesSummary.sort(
                    (a, b) => a.healthScore - b.healthScore // Worst health first
                ),
                criticalItems: criticalItems.map((i) => ({
                    productName: i.product?.name,
                    storeName: (i as any).store?.name,
                    storeUuid: i.storeUuid,
                    status: i.status,
                    currentStock: i.currentStock,
                })),
            };
        });
    }
 
    // INVENTORY TURNOVER — how fast stock is moving
    static async getInventoryTurnover(input: {
        tenantUuid: string;
        storeUuid: string;
        days?: number;
    }) {
        const days = input.days ?? 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
        const cacheKey = `inventory:turnover:${input.storeUuid}:${days}d`;
    
        return withCache(cacheKey, 600, async () => {
            // Sales movements in the period
            const salesByProduct = await prisma.inventoryMovement.groupBy({
                by: ["productUuid"],
                where: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    type: "SALE",
                    createdAt: { gte: since },
                },
                _sum: { quantity: true },
            });
    
            // Current stock levels
            const inventory = await prisma.inventoryItem.findMany({
                where: { tenantUuid: input.tenantUuid, storeUuid: input.storeUuid },
                include: { product: { select: { name: true, price: true } } },
            });
        
            const inventoryMap = new Map(
                inventory.map((i) => [i.productUuid, i])
            );
    
            const turnoverData = salesByProduct.map((s) => {
                const inv = inventoryMap.get(s.productUuid);
                const soldQty = Math.abs(s._sum.quantity ?? 0);
                const currentStock = inv?.currentStock ?? 0;
        
                // Turnover rate = units sold / average stock (per period)
                // Simplified: sold / current stock
                const turnoverRate =
                currentStock > 0 ? Number((soldQty / currentStock).toFixed(2)) : 0;
        
                return {
                    productUuid: s.productUuid,
                    productName: inv?.product?.name ?? "Unknown",
                    unitsSold: soldQty,
                    currentStock,
                    turnoverRate,
                    // Days of stock remaining at current sell rate
                    daysOfStockRemaining:
                        soldQty > 0
                        ? Math.round((currentStock / (soldQty / days)) * 10) / 10
                        : currentStock > 0
                            ? 999
                            : 0,
                };
            });
        
            return {
                period: { days, since },
                products: turnoverData.sort((a, b) => b.turnoverRate - a.turnoverRate),
                summary: {
                    totalProductsTracked: inventory.length,
                    totalUnitsSold: turnoverData.reduce((s, t) => s + t.unitsSold, 0),
                    fastMoving: turnoverData.filter((t) => t.turnoverRate > 2).length,
                    slowMoving: turnoverData.filter(
                        (t) => t.turnoverRate < 0.5 && t.turnoverRate > 0
                ).length,
                noMovement: turnoverData.filter((t) => t.unitsSold === 0).length,
                },
            };
        });
    }
}