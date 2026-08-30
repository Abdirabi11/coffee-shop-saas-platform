import prisma from "../config/prisma.ts"
import { MenuCacheService } from "../services/menu/menuCache.service.ts";

async function adminMenuManagement() {
    const tenantUuid = "tenant-123";
    const storeUuid = "store-456";
    const adminUuid = "admin-001";

    console.log("👨‍💼 Admin Menu Management Example\n");

    // 1. Create category
    console.log("1️⃣ Creating category...");
    const category = await prisma.category.create({
        data: {
        tenantUuid,
        storeUuid,
        name: "Specialty Drinks",
        description: "Our signature beverages",
        order: 1,
        isActive: true,
        },
    });

    console.log(`✅ Category created: ${category.name}`);

    // 2. Create product
    console.log("\n2️⃣ Creating product...");
    const product = await prisma.product.create({
        data: {
        tenantUuid,
        storeUuid,
        categoryUuid: category.uuid,
        name: "Caramel Macchiato",
        description: "Espresso with vanilla, steamed milk, and caramel",
        basePrice: 550, // $5.50
        isActive: true,
        isFeatured: true,
        tags: ["coffee", "espresso", "sweet"],
        calories: 250,
        preparationTime: 5,
        },
    });

    console.log(`✅ Product created: ${product.name} - $${(product.basePrice / 100).toFixed(2)}`);

    // 3. Create option group
    console.log("\n3️⃣ Creating option group...");
    const sizeGroup = await prisma.optionGroup.create({
        data: {
        tenantUuid,
        storeUuid,
        name: "Size",
        selectionType: "SINGLE",
        minSelections: 1,
        maxSelections: 1,
        isRequired: true,
        },
    });

    // Add options
    const sizes = [
        { name: "Small", extraCost: 0 },
        { name: "Medium", extraCost: 50 },
        { name: "Large", extraCost: 100 },
    ];

    for (const size of sizes) {
        await prisma.option.create({
        data: {
            optionGroupUuid: sizeGroup.uuid,
            name: size.name,
            extraCost: size.extraCost,
        },
        });
    }

    console.log(`✅ Option group created: ${sizeGroup.name} with ${sizes.length} options`);

    // 4. Link option group to product
    console.log("\n4️⃣ Linking option group to product...");
    await prisma.productOptionGroup.create({
        data: {
        productUuid: product.uuid,
        optionGroupUuid: sizeGroup.uuid,
        order: 1,
        },
    });

    console.log(`✅ Option group linked`);

    // 5. Invalidate cache
    console.log("\n5️⃣ Invalidating menu cache...");
    await MenuCacheService.invalidate({
        tenantUuid,
        storeUuid,
        reason: "PRODUCT_ADDED",
        triggeredBy: adminUuid,
    });

    console.log(`✅ Cache invalidated and menu prewarmed`);

    console.log("\n✅ Admin operations completed!");
}
