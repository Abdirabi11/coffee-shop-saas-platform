import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.js";


export class MenuDiffService {
  
  //Create diff between two snapshots
  static async createDiff(input: {
    tenantUuid: string;
    storeUuid: string;
    fromSnapshotUuid: string;
    toSnapshotUuid: string;
  }) {
    try {
      // Check if diff already exists
      const existing = await prisma.menuDiff.findUnique({
        where: {
          fromSnapshotUuid_toSnapshotUuid: {
            fromSnapshotUuid: input.fromSnapshotUuid,
            toSnapshotUuid: input.toSnapshotUuid,
          },
        },
      });

      if (existing) {
        return existing;
      }

      // Get snapshots
      const [fromSnapshot, toSnapshot] = await Promise.all([
        prisma.menuSnapshot.findUnique({
          where: { uuid: input.fromSnapshotUuid },
        }),
        prisma.menuSnapshot.findUnique({
          where: { uuid: input.toSnapshotUuid },
        }),
      ]);

      if (!fromSnapshot || !toSnapshot) {
        throw new Error("SNAPSHOT_NOT_FOUND");
      }

      // Calculate differences
      const diff = this.calculateDiff(
        fromSnapshot.categories as any,
        toSnapshot.categories as any,
        fromSnapshot.products as any,
        toSnapshot.products as any
      );

      // Check for breaking changes
      const hasBreakingChanges =
        diff.removedProducts.length > 0 ||
        diff.priceIncreases.length > 0;

      // Create diff record
      const diffRecord = await prisma.menuDiff.create({
        data: {
          tenantUuid: input.tenantUuid,
          storeUuid: input.storeUuid,
          fromSnapshotUuid: input.fromSnapshotUuid,
          toSnapshotUuid: input.toSnapshotUuid,
          totalChanges:
            diff.addedCategories.length +
            diff.removedCategories.length +
            diff.modifiedCategories.length +
            diff.addedProducts.length +
            diff.removedProducts.length +
            diff.modifiedProducts.length +
            diff.priceIncreases.length +
            diff.priceDecreases.length,
          hasBreakingChanges,
          addedCategories: diff.addedCategories,
          removedCategories: diff.removedCategories,
          modifiedCategories: diff.modifiedCategories,
          addedProducts: diff.addedProducts,
          removedProducts: diff.removedProducts,
          modifiedProducts: diff.modifiedProducts,
          priceIncreases: diff.priceIncreases,
          priceDecreases: diff.priceDecreases,
          availabilityChanges: diff.availabilityChanges,
        },
      });

      logWithContext("info", "[MenuDiff] Diff created", {
        diffUuid: diffRecord.uuid,
        totalChanges: diffRecord.totalChanges,
        hasBreakingChanges,
      });

      return diffRecord;

    } catch (error: any) {
      logWithContext("error", "[MenuDiff] Create failed", {
        error: error.message,
      });

      throw error;
    }
  }

  //Calculate differences between menus
  private static calculateDiff(
    oldCategories: any[],
    newCategories: any[],
    oldProducts: any[],
    newProducts: any[]
  ) {
    const result = {
      addedCategories: [] as any[],
      removedCategories: [] as any[],
      modifiedCategories: [] as any[],
      addedProducts: [] as any[],
      removedProducts: [] as any[],
      modifiedProducts: [] as any[],
      priceIncreases: [] as any[],
      priceDecreases: [] as any[],
      availabilityChanges: [] as any[],
    };

    // Category changes
    const oldCatMap = new Map(oldCategories.map((c) => [c.uuid, c]));
    const newCatMap = new Map(newCategories.map((c) => [c.uuid, c]));

    for (const [uuid, newCat] of newCatMap) {
      if (!oldCatMap.has(uuid)) {
        result.addedCategories.push({
          uuid: newCat.uuid,
          name: newCat.name,
        });
      } else {
        const oldCat = oldCatMap.get(uuid);
        if (oldCat.name !== newCat.name) {
          result.modifiedCategories.push({
            uuid: newCat.uuid,
            oldName: oldCat.name,
            newName: newCat.name,
          });
        }
      }
    }

    for (const [uuid, oldCat] of oldCatMap) {
      if (!newCatMap.has(uuid)) {
        result.removedCategories.push({
          uuid: oldCat.uuid,
          name: oldCat.name,
        });
      }
    };

    // Product changes
    const oldProdMap = new Map(oldProducts.map((p) => [p.uuid, p]));
    const newProdMap = new Map(newProducts.map((p) => [p.uuid, p]));

    for (const [uuid, newProd] of newProdMap) {
      if (!oldProdMap.has(uuid)) {
        result.addedProducts.push({
          uuid: newProd.uuid,
          name: newProd.name,
          basePrice: newProd.basePrice,
        });
      } else {
        const oldProd = oldProdMap.get(uuid);

        // Price changes
        if (oldProd.basePrice !== newProd.basePrice) {
          const change = {
            uuid: newProd.uuid,
            name: newProd.name,
            oldPrice: oldProd.basePrice,
            newPrice: newProd.basePrice,
            difference: newProd.basePrice - oldProd.basePrice,
          };

          if (newProd.basePrice > oldProd.basePrice) {
            result.priceIncreases.push(change);
          } else {
            result.priceDecreases.push(change);
          }
        }

        // Availability changes
        if (oldProd.isAvailable !== newProd.isAvailable) {
          result.availabilityChanges.push({
            uuid: newProd.uuid,
            name: newProd.name,
            wasAvailable: oldProd.isAvailable,
            isAvailable: newProd.isAvailable,
          });
        }

        // Other modifications
        if (
          oldProd.name !== newProd.name ||
          oldProd.description !== newProd.description
        ) {
          result.modifiedProducts.push({
            uuid: newProd.uuid,
            changes: {
              name: oldProd.name !== newProd.name,
              description: oldProd.description !== newProd.description,
            },
          });
        }
      }
    }

    for (const [uuid, oldProd] of oldProdMap) {
      if (!newProdMap.has(uuid)) {
        result.removedProducts.push({
          uuid: oldProd.uuid,
          name: oldProd.name,
          basePrice: oldProd.basePrice,
        });
      }
    }

    return result;
  }

  static async getDiffSummary(input: {
    storeUuid: string;
    dateFrom: Date;
    dateTo: Date;
  }) {
    const diffs = await prisma.menuDiff.findMany({
      where: {
        storeUuid: input.storeUuid,
        createdAt: {
          gte: input.dateFrom,
          lte: input.dateTo,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      totalDiffs: diffs.length,
      breakingChanges: diffs.filter((d) => d.hasBreakingChanges).length,
      totalChanges: diffs.reduce((sum, d) => sum + d.totalChanges, 0),
      diffs: diffs.slice(0, 10), // Latest 10
    };
  }

}