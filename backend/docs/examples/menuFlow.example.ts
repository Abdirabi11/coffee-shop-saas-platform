import { FavoriteService } from "../services/menu/favorite.service.ts";
import { MenuService } from "../services/menu/menu.service.ts";



async function completeMenuFlow() {
    const tenantUuid = "tenant-123";
    const storeUuid = "store-456";
    const userUuid = "user-789";

    console.log("🍕 Complete Menu Flow Example\n");

    // 1. Get menu
    console.log("1️⃣ Fetching menu...");
    const menu = await MenuService.getStoreMenu({
        tenantUuid,
        storeUuid,
        userUuid,
    });

    console.log(`✅ Menu loaded: ${menu.categories.length} categories, ${menu.totalProducts} products`);

    // 2. Browse product
    const firstProduct = menu.categories[0]?.products[0];
    if (firstProduct) {
        console.log(`\n2️⃣ Viewing product: ${firstProduct.name}`);

        const product = await MenuService.getProduct({
        tenantUuid,
        storeUuid,
        productUuid: firstProduct.uuid,
        userUuid,
        });

        console.log(`✅ Product details loaded`);
        console.log(`   Price: $${(product.basePrice / 100).toFixed(2)}`);
        console.log(`   Option groups: ${product.optionGroups.length}`);
    }

    // 3. Add to favorites
    console.log(`\n3️⃣ Adding to favorites...`);
    await FavoriteService.toggleFavorite({
        tenantUuid,
        userUuid,
        storeUuid,
        productUuid: firstProduct!.uuid,
    });

    console.log(`✅ Added to favorites`);

    // 4. Validate order
    console.log(`\n4️⃣ Validating order...`);
    const validation = await MenuService.validateOrder({
        tenantUuid,
        storeUuid,
        productUuid: firstProduct!.uuid,
        quantity: 2,
        selectedOptions: [],
    });

    if (validation.valid) {
        console.log(`✅ Order valid`);
        console.log(`   Total: $${(validation.pricing!.totalPrice / 100).toFixed(2)}`);
    }

    // 5. Search menu
    console.log(`\n5️⃣ Searching menu for "coffee"...`);
    const searchResults = await MenuService.searchMenu({
        tenantUuid,
        storeUuid,
        query: "coffee",
        maxResults: 5,
    });

    console.log(`✅ Found ${searchResults.count} results`);

    console.log("\n✅ Menu flow completed!");
}
