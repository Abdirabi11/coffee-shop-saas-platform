import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MenuEventService } from "../../events/menu.events.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class MenuSnapshotService{
  static async createSnapshot(input: {
    tenantUuid: string;
    storeUuid: string;
    reason: string;
    triggeredBy?: string;
  }) {
    try {
      // Get current menu
      const menu = await this.fetchCurrentMenu(input.storeUuid);

      // Generate hashes
      const contentHash = this.hashContent(menu);
      const categoriesHash = this.hashContent(menu.categories);
      const productsHash = this.hashContent(menu.products);
      const pricesHash = this.hashContent(menu.prices);

      // Check if this exact snapshot already exists
      const existing = await prisma.menuSnapshot.findUnique({
        where: { contentHash },
      });

      if (existing) {
        logWithContext("debug", "[MenuSnapshot] Identical snapshot exists", {
          snapshotUuid: existing.uuid,
          contentHash,
        });
        return existing;
      };

      // Get previous snapshot
      const previous = await prisma.menuSnapshot.findFirst({
        where: {
          storeUuid: input.storeUuid,
          isActive: true,
        },
        orderBy: { version: "desc" },
      });

      const version = (previous?.version ?? 0) + 1;

      // Create new snapshot
      const snapshot = await prisma.menuSnapshot.create({
        data: {
          tenantUuid: input.tenantUuid,
          storeUuid: input.storeUuid,
          version,
          snapshotType: this.determineSnapshotType(input.reason),
          contentHash,
          categoriesHash,
          productsHash,
          pricesHash,
          categories: menu.categories,
          products: menu.products,
          optionGroups: menu.optionGroups,
          totalCategories: menu.categories.length,
          totalProducts: menu.products.length,
          totalActiveProducts: menu.products.filter((p: any) => p.isActive && p.isAvailable).length,
          totalOptionGroups: menu.optionGroups.length,
          totalOptions: menu.optionGroups.reduce(
            (sum: number, g: any) => sum + g.options.length,
            0
          ),
          reason: input.reason as any,
          triggeredBy: input.triggeredBy,
          previousVersionUuid: previous?.uuid,
          isActive: true,
        },
      });

      // Deactivate previous snapshot
      if (previous) {
        await prisma.menuSnapshot.update({
          where: { uuid: previous.uuid },
          data: {
              isActive: false,
              validUntil: new Date(),
          },
        });

        // Create diff (async)
        MenuDiffService.createDiff({
          tenantUuid: input.tenantUuid,
          storeUuid: input.storeUuid,
          fromSnapshotUuid: previous.uuid,
          toSnapshotUuid: snapshot.uuid,
          }).catch((error) => {
          logWithContext("error", "[MenuSnapshot] Diff creation failed", {
            error: error.message,
          });
        });
      };

      // Emit event
      await MenuEventService.emit("MENU_SNAPSHOT_CREATED", {
        tenantUuid: input.tenantUuid,
        storeUuid: input.storeUuid,
        reason: input.reason,
        triggeredBy: input.triggeredBy,
        metadata: {
          version,
          snapzshotUuid: snapshot.uuid,
        },
      });

      logWithContext("info", "[MenuSnapshot] Snapshot created", {
        snapshotUuid: snapshot.uuid,
        version,
        reason: input.reason,
      });

      MetricsService.increment("menu.snapshot.created");

      return snapshot;

    } catch (error: any) {
      logWithContext("error", "[MenuSnapshot] Create failed", {
        storeUuid: input.storeUuid,
        error: error.message,
      });

      throw error;
    }
  }

  static async getCurrentSnapshot(storeUuid: string) {
    return prisma.menuSnapshot.findFirst({
      where: {
        storeUuid,
        isActive: true,
      },
      orderBy: { version: "desc" },
    });
  }

  static async getSnapshotHistory(input: {
    storeUuid: string;
    limit?: number;
  }) {
    return prisma.menuSnapshot.findMany({
      where: { storeUuid: input.storeUuid },
      orderBy: { version: "desc" },
      take: input.limit || 10,
      select: {
        uuid: true,
        version: true,
        reason: true,
        triggeredBy: true,
        totalCategories: true,
        totalProducts: true,
        totalActiveProducts: true,
        hasChanges: true,
        generatedAt: true,
        createdAt: true,
      },
    });
  }

  private static async fetchCurrentMenu(storeUuid: string) {
    const categories = await prisma.category.findMany({
      where: { storeUuid },
      orderBy: { order: "asc" },
      select: {
        uuid: true,
        name: true,
        description: true,
        order: true,
        isActive: true,
        isAvailable: true,
      },
    });

    const products = await prisma.product.findMany({
      where: { storeUuid },
      orderBy: { order: "asc" },
      select: {
        uuid: true,
        categoryUuid: true,
        name: true,
        description: true,
        basePrice: true,
        isActive: true,
        isAvailable: true,
        isFeatured: true,
        tags: true,
      },
    });

    const optionGroups = await prisma.optionGroup.findMany({
      where: { storeUuid },
      include: {
        options: {
          where: { active: true },
          orderBy: { order: "asc" },
        },
      },
    });

    // Extract prices for price-specific hash
    const prices = products.map((p) => ({
      productUuid: p.uuid,
      basePrice: p.basePrice,
    }));

    return {
      categories,
      products,
      optionGroups,
      prices,
    };
  }

  //Hash content for comparison
  private static hashContent(content: any): string {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex");
  }

  private static determineSnapshotType(reason: string): any {
    const typeMap: Record<string, string> = {
      MANUAL: "MANUAL",
      AUTO: "AUTO_ON_CHANGE",
      PRICE_CHANGE: "AUTO_ON_CHANGE",
      PRODUCT_ADDED: "AUTO_ON_CHANGE",
      PRODUCT_REMOVED: "AUTO_ON_CHANGE",
      ADMIN_PREVIEW: "ADMIN_PREVIEW",
      SCHEDULED_BACKUP: "SCHEDULED",
    };

    return typeMap[reason] || "MANUAL";
  }
}