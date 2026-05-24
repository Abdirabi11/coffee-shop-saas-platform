import prisma from "../config/prisma.ts";
import bcrypt from "bcrypt";

async function main() {
    console.log("🌱 Seeding database...\n");

    // ══════════════════════════════════════════════════════════════════════
    //  TENANT 1 — Turk Coffee Co.
    // ══════════════════════════════════════════════════════════════════════

    const passwordHash = await bcrypt.hash("Admin@123", 12);
    const pinHash = await bcrypt.hash("1234", 10);

    // Owner user
    const owner1 = await prisma.user.create({
        data: {
            phoneNumber: "+905059289347",
            email: "jane@doe.com",
            firstName: "Jane",
            lastName: "Doe",
            name: "Jane Doe",
            passwordHash,
            pinHash,
            globalRole: "ADMIN",
            isVerified: true,
            emailVerified: true,
            phoneVerified: true,
        },
    });
    console.log("✅ Owner 1 created:", owner1.uuid);

    const tenant1 = await prisma.tenant.create({
        data: {
            name: "Jane Coffee Co.",
            slug: "jane-coffee",
            // domain: "janecoffee.com",
            email: "info@janecoffee.com",
            status: "ACTIVE",
            ownerUuid: owner1.uuid,
            maxStores: 5,
            maxUsers: 50,
            maxOrders: 10000,
            billingEmail: "billing@janecoffee.com",
            features: {
                mobileOrdering: true,
                loyalty: false,
                kds: false,
            },
        },
    });
    console.log("✅ Tenant 1 created:", tenant1.uuid);

    // Link owner to tenant
    const tenantUser1 = await prisma.tenantUser.create({
        data: {
            tenantUuid: tenant1.uuid,
            userUuid: owner1.uuid,
            slug: "jane-janecoffee",
            role: "TENANT_ADMIN",
            displayName: "Jane Doe",
            employmentType: "FULL_TIME",
            isActive: true,
        },
    });

    // Tenant settings
    await prisma.tenantSettings.create({
        data: {
            tenantUuid: tenant1.uuid,
            currency: "USD",
            timezone: "Asia/Istanbul",
            locale: "en-US",
            taxRate: 500,
            orderAutoCompleteMinutes: 30,
            orderAutoCancelMinutes: 15,
            emailNotifications: true,
            pushNotifications: true,
        },
    });

    // ── Tenant 1 Stores ──────────────────────────────────────────────────

    const store1a = await prisma.store.create({
        data: {
            tenantUuid: tenant1.uuid,
            name: "Jane Coffee — Downtown",
            slug: "downtown",
            description: "Flagship store in the city center",
            city: "Istanbul",
            address: "bagdat Road, Istanbul",
            latitude: 2.0469,
            longitude: 45.3182,
            timezone: "Asia/Istanbul",
            phone: "+252611100001",
            email: "downtown@janecoffee.com",
            status: "ACTIVE",
            active: true,
            currency: "USD",
            taxRate: 5.0,
        },
    });
    console.log("✅ Store 1A created:", store1a.uuid);

    const store1b = await prisma.store.create({
        data: {
            tenantUuid: tenant1.uuid,
            name: "Jane Coffee — Airport",
            slug: "airport",
            description: "Airport terminal branch",
            city: "Istanbul",
            address: "Bagdat caddesi, Istanbul",
            latitude: 2.0144,
            longitude: 45.3047,
            timezone: "Asia/Istanbul",
            phone: "+9053924842",
            email: "airport@istcoffee.com",
            status: "ACTIVE",
            active: true,
            currency: "USD",
            taxRate: 5.0,
        },
    });
    console.log("✅ Store 1B created:", store1b.uuid);

    // Store settings
    for (const store of [store1a, store1b]) {
        await prisma.storeSettings.create({
            data: {
                storeUuid: store.uuid,
                autoAcceptOrders: true,
                orderPrepTimeMinutes: 10,
                maxOrdersPerHour: 80,
                allowPreorders: true,
                minimumOrderAmount: 200,
            },
        });
    }

    // Owner gets ADMIN role at both stores
    for (const store of [store1a, store1b]) {
        await prisma.userStore.create({
            data: {
                userUuid: owner1.uuid,
                storeUuid: store.uuid,
                tenantUuid: tenant1.uuid,
                tenantUserUuid: tenantUser1.uuid,
                role: "ADMIN",
                isPrimary: store.uuid === store1a.uuid,
                isActive: true,
                canAccessPOS: true,
                canOpenDrawer: true,
                canCloseDrawer: true,
                canManageStaff: true,
            },
        });
    }

    // ── Tenant 1 Staff ───────────────────────────────────────────────────

    // Manager
    const manager1 = await prisma.user.create({
        data: {
            phoneNumber: "+905065252323",
            email: "Bob@istcoffee.com",
            firstName: "Bob",
            lastName: "Doe",
            name: "Bob Doe",
            passwordHash,
            pinHash,
            globalRole: "USER",
            isVerified: true,
            phoneVerified: true,
        },
    });

    const managerTU1 = await prisma.tenantUser.create({
        data: {
            tenantUuid: tenant1.uuid,
            userUuid: manager1.uuid,
            slug: "Bob-istcoffee",
            role: "STAFF",
            displayName: "Bob Doe",
            employmentType: "FULL_TIME",
            payRate: 2500, 
            isActive: true,
        },
    });

    await prisma.userStore.create({
        data: {
            userUuid: manager1.uuid,
            storeUuid: store1a.uuid,
            tenantUuid: tenant1.uuid,
            tenantUserUuid: managerTU1.uuid,
            role: "MANAGER",
            isPrimary: true,
            isActive: true,
            canAccessPOS: true,
            canOpenDrawer: true,
            canCloseDrawer: true,
            canManageStaff: true,
        },
    });

    // Cashier
    const cashier1 = await prisma.user.create({
        data: {
            phoneNumber: "+252611000003",
            email: "ali@istcoffee.com",
            firstName: "Ali",
            lastName: "Doe",
            name: "Ali Doe",
            pinHash,
            globalRole: "USER",
            isVerified: true,
            phoneVerified: true,
        },
    });

    const cashierTU1 = await prisma.tenantUser.create({
        data: {
            tenantUuid: tenant1.uuid,
            userUuid: cashier1.uuid,
            slug: "ali-istcoffee",
            role: "STAFF",
            displayName: "Ali Doe",
            employmentType: "PART_TIME",
            payRate: 1500,
            isActive: true,
        },
    });

    await prisma.userStore.create({
        data: {
            userUuid: cashier1.uuid,
            storeUuid: store1a.uuid,
            tenantUuid: tenant1.uuid,
            tenantUserUuid: cashierTU1.uuid,
            role: "CASHIER",
            isPrimary: true,
            isActive: true,
            canAccessPOS: true,
            canOpenDrawer: true,
            canCloseDrawer: true,
            canManageStaff: false,
        },
    });

    // Barista
    const barista1 = await prisma.user.create({
        data: {
            phoneNumber: "+90536233265",
            firstName: "Asi",
            lastName: "Doe",
            name: "Asi Doe",
            pinHash,
            globalRole: "USER",
            isVerified: true,
            phoneVerified: true,
        },
    });

    const baristaTU1 = await prisma.tenantUser.create({
        data: {
            tenantUuid: tenant1.uuid,
            userUuid: barista1.uuid,
            slug: "asi-istcoffee",
            role: "STAFF",
            displayName: "Emre Doe",
            employmentType: "PART_TIME",
            payRate: 1200,
            isActive: true,
        },
    });

    await prisma.userStore.create({
        data: {
            userUuid: barista1.uuid,
            storeUuid: store1a.uuid,
            tenantUuid: tenant1.uuid,
            tenantUserUuid: baristaTU1.uuid,
            role: "BARISTA",
            isPrimary: true,
            isActive: true,
            canAccessPOS: false,
            canOpenDrawer: false,
            canCloseDrawer: false,
            canManageStaff: false,
        },
    });

    // Customer (has TenantUser but no UserStore — mobile app user)
    const customer1 = await prisma.user.create({
        data: {
            phoneNumber: "+9063343553",
            firstName: "Jez",
            lastName: "Doe",
            name: "Jez Doe",
            globalRole: "CUSTOMER",
            isVerified: true,
            phoneVerified: true,
        },
    });

    await prisma.tenantUser.create({
        data: {
            tenantUuid: tenant1.uuid,
            userUuid: customer1.uuid,
            slug: "jez-istcoffee",
            role: "STAFF", // lowest tenant role — customer context
            displayName: "Jez Doe",
            isActive: true,
        },
    });

    // ══════════════════════════════════════════════════════════════════════
    //  TENANT 2 — Istanbul Brew House
    // ══════════════════════════════════════════════════════════════════════

    const owner2 = await prisma.user.create({
        data: {
            phoneNumber: "+905321000001",
            email: "James@istanbulbrew.com",
            firstName: "James",
            lastName: "Doe",
            name: "James Doe",
            passwordHash,
            pinHash,
            globalRole: "ADMIN",
            isVerified: true,
            emailVerified: true,
            phoneVerified: true,
        },
    });
    console.log("✅ Owner 2 created:", owner2.uuid);

    const tenant2 = await prisma.tenant.create({
        data: {
        name: "Istanbul Brew House",
        slug: "istanbul-brew",
        // domain: "istanbulbrew.com",
        email: "info@istanbulbrew.com",
        status: "ACTIVE",
        ownerUuid: owner2.uuid,
        maxStores: 3,
        maxUsers: 30,
        maxOrders: 5000,
        billingEmail: "billing@istanbulbrew.com",
        features: {
            mobileOrdering: true,
            loyalty: true,
            kds: false,
        },
        },
    });
    console.log("✅ Tenant 2 created:", tenant2.uuid);

    const tenantUser2 = await prisma.tenantUser.create({
        data: {
            tenantUuid: tenant2.uuid,
            userUuid: owner2.uuid,
            slug: "James-istanbulbrew",
            role: "TENANT_ADMIN",
            displayName: "James Doe",
            employmentType: "FULL_TIME",
            isActive: true,
        },
    });

    await prisma.tenantSettings.create({
        data: {
            tenantUuid: tenant2.uuid,
            currency: "TRY",
            timezone: "Europe/Istanbul",
            locale: "tr-TR",
            taxRate: 1800, // 18% KDV
            orderAutoCompleteMinutes: 20,
            orderAutoCancelMinutes: 10,
            emailNotifications: true,
            pushNotifications: true,
        },
    });

    const store2a = await prisma.store.create({
        data: {
            tenantUuid: tenant2.uuid,
            name: "Istanbul Brew — Kadıköy",
            slug: "kadikoy",
            description: "Main branch on the Asian side",
            city: "Istanbul",
            address: "Caferağa Mah, Moda Cd, Kadıköy/Istanbul",
            latitude: 40.9884,
            longitude: 29.0282,
            timezone: "Europe/Istanbul",
            phone: "+905321100001",
            email: "kadikoy@istanbulbrew.com",
            status: "ACTIVE",
            active: true,
            currency: "TRY",
            taxRate: 18.0,
        },
    });
    console.log("✅ Store 2A created:", store2a.uuid);

    const store2b = await prisma.store.create({
        data: {
            tenantUuid: tenant2.uuid,
            name: "Istanbul Brew — Beşiktaş",
            slug: "besiktas",
            description: "European side branch near the ferry",
            city: "Istanbul",
            address: "Sinanpaşa Mah, Beşiktaş/Istanbul",
            latitude: 41.0422,
            longitude: 29.0044,
            timezone: "Europe/Istanbul",
            phone: "+905321100002",
            email: "besiktas@istanbulbrew.com",
            status: "ACTIVE",
            active: true,
            currency: "TRY",
            taxRate: 18.0,
        },
    });
    console.log("✅ Store 2B created:", store2b.uuid);

    for (const store of [store2a, store2b]) {
        await prisma.storeSettings.create({
            data: {
                storeUuid: store.uuid,
                autoAcceptOrders: false,
                orderPrepTimeMinutes: 15,
                maxOrdersPerHour: 60,
                allowPreorders: false,
                minimumOrderAmount: 5000,
            },
        });
    }

    for (const store of [store2a, store2b]) {
        await prisma.userStore.create({
            data: {
                userUuid: owner2.uuid,
                storeUuid: store.uuid,
                tenantUuid: tenant2.uuid,
                tenantUserUuid: tenantUser2.uuid,
                role: "ADMIN",
                isPrimary: store.uuid === store2a.uuid,
                isActive: true,
                canAccessPOS: true,
                canOpenDrawer: true,
                canCloseDrawer: true,
                canManageStaff: true,
            },
        });
    };

    // Tenant 2 Manager
    const manager2 = await prisma.user.create({
        data: {
            phoneNumber: "+905321000002",
            email: "Jonnie@istanbulbrew.com",
            firstName: "Jonnie",
            lastName: "Doe",
            name: "Jonnie Doe",
            passwordHash,
            pinHash,
            globalRole: "USER",
            isVerified: true,
            phoneVerified: true,
        },
    });

    const managerTU2 = await prisma.tenantUser.create({
        data: {
            tenantUuid: tenant2.uuid,
            userUuid: manager2.uuid,
            slug: "Jonnie-istanbulbrew",
            role: "STAFF",
            displayName: "Jonnie Doe",
            employmentType: "FULL_TIME",
            payRate: 15000,
            isActive: true,
        },
    });

    await prisma.userStore.create({
        data: {
            userUuid: manager2.uuid,
            storeUuid: store2a.uuid,
            tenantUuid: tenant2.uuid,
            tenantUserUuid: managerTU2.uuid,
            role: "MANAGER",
            isPrimary: true,
            isActive: true,
            canAccessPOS: true,
            canOpenDrawer: true,
            canCloseDrawer: true,
            canManageStaff: true,
        },
    });

    // ══════════════════════════════════════════════════════════════════════
    //  SUPER ADMIN — platform-level access
    // ══════════════════════════════════════════════════════════════════════

    const superAdmin = await prisma.user.create({
        data: {
            phoneNumber: "+905050973672",
            email: "super@coffeesaas.com",
            firstName: "Platform",
            lastName: "Admin",
            name: "Platform Admin",
            passwordHash,
            pinHash,
            globalRole: "SUPER_ADMIN",
            isVerified: true,
            emailVerified: true,
            phoneVerified: true,
        },
    });
    console.log("✅ Super Admin created:", superAdmin.uuid);


    const catHotDrinks = await prisma.category.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            name: "Hot Drinks",
            slug: "hot-drinks",
            description: "Freshly brewed hot beverages",
            imageUrl: "https://example.com/images/hot-drinks.jpg",
            order: 1,
            displayOrder: 1,
            isActive: true,
            isAvailable: true,
        },
    });

    const catColdDrinks = await prisma.category.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            name: "Cold Drinks",
            slug: "cold-drinks",
            description: "Iced and blended beverages",
            imageUrl: "https://example.com/images/cold-drinks.jpg",
            order: 2,
            displayOrder: 2,
            isActive: true,
            isAvailable: true,
        },
    });

    const catPastries = await prisma.category.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            name: "Pastries",
            slug: "pastries",
            description: "Freshly baked goods and snacks",
            imageUrl: "https://example.com/images/pastries.jpg",
            order: 3,
            displayOrder: 3,
            isActive: true,
            isAvailable: true,
        },
    });

    console.log("✅ Categories created");

    // ── Products ────────────────────────────────────────────────────────

    const espresso = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catHotDrinks.uuid,
            name: "Espresso",
            description: "Rich double-shot espresso — house roast",
            imageUrl: "https://example.com/images/espresso.jpg",
            basePrice: 350,
            sku: "HOT-ESP-001",
            order: 1,
            isActive: true,
            isAvailable: true,
            isFeatured: false,
            tags: ["hot", "classic", "strong"],
            calories: 5,
            preparationTime: 3,
        },
    });

    const caramelLatte = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catHotDrinks.uuid,
            name: "Caramel Latte",
            description: "Espresso with steamed milk and caramel syrup",
            imageUrl: "https://example.com/images/caramel-latte.jpg",
            basePrice: 550,
            sku: "HOT-LAT-002",
            order: 2,
            isActive: true,
            isAvailable: true,
            isFeatured: true,
            tags: ["hot", "sweet", "popular"],
            calories: 250,
            preparationTime: 5,
        },
    });

    const cappuccino = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catHotDrinks.uuid,
            name: "Cappuccino",
            description: "Equal parts espresso, steamed milk, and foam",
            imageUrl: "https://example.com/images/cappuccino.jpg",
            basePrice: 500,
            sku: "HOT-CAP-003",
            order: 3,
            isActive: true,
            isAvailable: true,
            isFeatured: false,
            tags: ["hot", "classic", "creamy"],
            calories: 120,
            preparationTime: 4,
        },
    });

    const turkishCoffee = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catHotDrinks.uuid,
            name: "Turkish Coffee",
            description: "Traditional slow-brewed Turkish coffee with cardamom",
            imageUrl: "https://example.com/images/turkish-coffee.jpg",
            basePrice: 400,
            sku: "HOT-TRK-004",
            order: 4,
            isActive: true,
            isAvailable: true,
            isFeatured: true,
            tags: ["hot", "traditional", "strong"],
            calories: 10,
            preparationTime: 6,
        },
    });

    const icedAmericano = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catColdDrinks.uuid,
            name: "Iced Americano",
            description: "Espresso over ice with cold water",
            imageUrl: "https://example.com/images/iced-americano.jpg",
            basePrice: 450,
            sku: "COLD-AMR-001",
            order: 1,
            isActive: true,
            isAvailable: true,
            isFeatured: false,
            tags: ["cold", "classic", "refreshing"],
            calories: 10,
            preparationTime: 2,
        },
    });

    const icedMocha = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catColdDrinks.uuid,
            name: "Iced Mocha",
            description: "Espresso with chocolate, milk, and ice",
            imageUrl: "https://example.com/images/iced-mocha.jpg",
            basePrice: 600,
            sku: "COLD-MOC-002",
            order: 2,
            isActive: true,
            isAvailable: true,
            isFeatured: true,
            tags: ["cold", "chocolate", "sweet"],
            calories: 320,
            preparationTime: 4,
        },
    });

    const coldBrew = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catColdDrinks.uuid,
            name: "Cold Brew",
            description: "Slow-steeped for 12 hours, smooth and bold",
            imageUrl: "https://example.com/images/cold-brew.jpg",
            basePrice: 500,
            sku: "COLD-BRW-003",
            order: 3,
            isActive: true,
            isAvailable: true,
            isFeatured: false,
            tags: ["cold", "smooth", "strong"],
            calories: 5,
            preparationTime: 1,
        },
    });

    const croissant = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catPastries.uuid,
            name: "Butter Croissant",
            description: "Flaky French-style butter croissant",
            imageUrl: "https://example.com/images/croissant.jpg",
            basePrice: 400,
            sku: "PST-CRS-001",
            order: 1,
            isActive: true,
            isAvailable: true,
            isFeatured: false,
            tags: ["pastry", "breakfast", "buttery"],
            calories: 310,
            preparationTime: 0,
        },
    });

    const chocolateMuffin = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catPastries.uuid,
            name: "Chocolate Muffin",
            description: "Rich double chocolate chip muffin",
            imageUrl: "https://example.com/images/chocolate-muffin.jpg",
            basePrice: 450,
            sku: "PST-MUF-002",
            order: 2,
            isActive: true,
            isAvailable: true,
            isFeatured: false,
            tags: ["pastry", "chocolate", "snack"],
            calories: 420,
            preparationTime: 0,
        },
    });

    const baklava = await prisma.product.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            categoryUuid: catPastries.uuid,
            name: "Pistachio Baklava",
            description: "Traditional Turkish baklava with pistachios",
            imageUrl: "https://example.com/images/baklava.jpg",
            basePrice: 500,
            sku: "PST-BKL-003",
            order: 3,
            isActive: true,
            isAvailable: true,
            isFeatured: true,
            tags: ["pastry", "traditional", "sweet"],
            calories: 350,
            preparationTime: 0,
        },
    });

    console.log("✅ Products created (11 items)");

    // ── Option Groups ───────────────────────────────────────────────────

    const milkGroup = await prisma.optionGroup.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            name: "Milk Choice",
            description: "Choose your milk type",
            selectionType: "SINGLE",
            isRequired: true,
            minSelections: 1,
            maxSelections: 1,
            isActive: true,
        },
    });

    const sizeGroup = await prisma.optionGroup.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            name: "Size",
            description: "Choose your drink size",
            selectionType: "SINGLE",
            isRequired: true,
            minSelections: 1,
            maxSelections: 1,
            isActive: true,
        },
    });

    const extrasGroup = await prisma.optionGroup.create({
        data: {
            tenantUuid: tenant1.uuid,
            storeUuid: store1a.uuid,
            name: "Extras",
            description: "Add extra toppings or shots",
            selectionType: "MULTIPLE",
            isRequired: false,
            minSelections: 0,
            maxSelections: 3,
            isActive: true,
        },
    });

    console.log("✅ Option groups created");

    // ── Options ─────────────────────────────────────────────────────────

    console.log("✅ Option groups created");

    // ── Link Option Groups to Products (need UUIDs for options) ─────────

    const clMilk = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: caramelLatte.uuid, optionGroupUuid: milkGroup.uuid, displayOrder: 1, isRequired: true, minSelections: 1, maxSelections: 1, name: "Milk Choice" },
    });
    const clSize = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: caramelLatte.uuid, optionGroupUuid: sizeGroup.uuid, displayOrder: 2, isRequired: true, minSelections: 1, maxSelections: 1, name: "Size" },
    });
    const clExtras = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: caramelLatte.uuid, optionGroupUuid: extrasGroup.uuid, displayOrder: 3, isRequired: false, minSelections: 0, maxSelections: 3, name: "Extras" },
    });

    const capMilk = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: cappuccino.uuid, optionGroupUuid: milkGroup.uuid, displayOrder: 1, isRequired: true, minSelections: 1, maxSelections: 1, name: "Milk Choice" },
    });
    const capSize = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: cappuccino.uuid, optionGroupUuid: sizeGroup.uuid, displayOrder: 2, isRequired: true, minSelections: 1, maxSelections: 1, name: "Size" },
    });

    const iaSize = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: icedAmericano.uuid, optionGroupUuid: sizeGroup.uuid, displayOrder: 1, isRequired: true, minSelections: 1, maxSelections: 1, name: "Size" },
    });
    const iaExtras = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: icedAmericano.uuid, optionGroupUuid: extrasGroup.uuid, displayOrder: 2, isRequired: false, minSelections: 0, maxSelections: 3, name: "Extras" },
    });

    const imMilk = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: icedMocha.uuid, optionGroupUuid: milkGroup.uuid, displayOrder: 1, isRequired: true, minSelections: 1, maxSelections: 1, name: "Milk Choice" },
    });
    const imSize = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: icedMocha.uuid, optionGroupUuid: sizeGroup.uuid, displayOrder: 2, isRequired: true, minSelections: 1, maxSelections: 1, name: "Size" },
    });
    const imExtras = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: icedMocha.uuid, optionGroupUuid: extrasGroup.uuid, displayOrder: 3, isRequired: false, minSelections: 0, maxSelections: 3, name: "Extras" },
    });

    const cbSize = await prisma.productOptionGroup.create({
        data: { tenantUuid: tenant1.uuid, productUuid: coldBrew.uuid, optionGroupUuid: sizeGroup.uuid, displayOrder: 1, isRequired: true, minSelections: 1, maxSelections: 1, name: "Size" },
    });

    console.log("✅ Option groups linked to products");

// ── Options (attached to ProductOptionGroup links) ──────────────────

    async function createMilkOptions(pogUuid: string) {
        await prisma.productOption.createMany({
            data: [
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Whole Milk", extraCost: 0, displayOrder: 1 },
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Oat Milk", extraCost: 75, displayOrder: 2 },
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Almond Milk", extraCost: 75, displayOrder: 3 },
            ],
        });
    }

    async function createSizeOptions(pogUuid: string) {
        await prisma.productOption.createMany({
            data: [
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Small (8oz)", extraCost: 0, displayOrder: 1 },
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Medium (12oz)", extraCost: 100, displayOrder: 2 },
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Large (16oz)", extraCost: 200, displayOrder: 3 },
            ],
        });
    }

    async function createExtrasOptions(pogUuid: string) {
        await prisma.productOption.createMany({
            data: [
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Extra Shot", extraCost: 100, displayOrder: 1 },
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Whipped Cream", extraCost: 50, displayOrder: 2 },
                { tenantUuid: tenant1.uuid, optionGroupUuid: pogUuid, name: "Vanilla Syrup", extraCost: 75, displayOrder: 3 },
            ],
        });
    }

    await createMilkOptions(clMilk.uuid);
    await createSizeOptions(clSize.uuid);
    await createExtrasOptions(clExtras.uuid);

    await createMilkOptions(capMilk.uuid);
    await createSizeOptions(capSize.uuid);

    await createSizeOptions(iaSize.uuid);
    await createExtrasOptions(iaExtras.uuid);

    await createMilkOptions(imMilk.uuid);
    await createSizeOptions(imSize.uuid);
    await createExtrasOptions(imExtras.uuid);

    await createSizeOptions(cbSize.uuid);

    console.log("✅ Options created for all products");
    // ── Menu Summary ────────────────────────────────────────────────────

    console.log("\n📋 MENU — Jane Coffee Downtown:");
    console.log("   Hot Drinks:");
    console.log(`     Espresso:       $3.50 | ${espresso.uuid}`);
    console.log(`     Caramel Latte:  $5.50 | ${caramelLatte.uuid} (milk + size + extras)`);
    console.log(`     Cappuccino:     $5.00 | ${cappuccino.uuid} (milk + size)`);
    console.log(`     Turkish Coffee: $4.00 | ${turkishCoffee.uuid} (no options)`);
    console.log("   Cold Drinks:");
    console.log(`     Iced Americano: $4.50 | ${icedAmericano.uuid} (size + extras)`);
    console.log(`     Iced Mocha:     $6.00 | ${icedMocha.uuid} (milk + size + extras)`);
    console.log(`     Cold Brew:      $5.00 | ${coldBrew.uuid} (size)`);
    console.log("   Pastries:");
    console.log(`     Croissant:      $4.00 | ${croissant.uuid} (no options)`);
    console.log(`     Choc Muffin:    $4.50 | ${chocolateMuffin.uuid} (no options)`);
    console.log(`     Baklava:        $5.00 | ${baklava.uuid} (no options)`);
    console.log("\n   Option Groups:");
    console.log(`     Milk:   ${milkGroup.uuid} (Whole, Oat +$0.75, Almond +$0.75)`);
    console.log(`     Size:   ${sizeGroup.uuid} (Small, Medium +$1.00, Large +$2.00)`);
    console.log(`     Extras: ${extrasGroup.uuid} (Shot +$1.00, Whip +$0.50, Vanilla +$0.75)`);

    // ══════════════════════════════════════════════════════════════════════
    //  SUMMARY
    // ══════════════════════════════════════════════════════════════════════

    console.log("\n══════════════════════════════════════════════════");
    console.log("  SEED COMPLETE");
    console.log("══════════════════════════════════════════════════");
    console.log("\n📦 TENANT 1 — Jane Coffee Co.");
    console.log(`   Tenant Slug:  jane-coffee`);
    console.log(`   Store 1 (Downtown): ${store1a.uuid}`);
    console.log(`   Store 2 (Airport):  ${store1b.uuid}`);
    console.log(`   Owner:    ${owner1.uuid} | +905059289347 | Admin@123`);
    console.log(`   Manager:  ${manager1.uuid} | +905065252323 | Admin@123`);
    console.log(`   Cashier:  ${cashier1.uuid} | +252611000003 | PIN: 1234`);
    console.log(`   Barista:  ${barista1.uuid} | +90536233265 | PIN: 1234`);
    console.log(`   Customer: ${customer1.uuid} | +9063343553`);

    console.log("\n📦 TENANT 2 — Istanbul Brew House");
    console.log(`   Tenant UUID:  ${tenant2.uuid}`);
    console.log(`   Tenant Slug:  istanbul-brew`);
    console.log(`   Store 1 (Kadıköy):   ${store2a.uuid}`);
    console.log(`   Store 2 (Beşiktaş):  ${store2b.uuid}`);
    console.log(`   Owner:    ${owner2.uuid} | +905321000001 | Admin@123`);
    console.log(`   Manager:  ${manager2.uuid} | +905321000002 | Admin@123`);

    console.log("\n🔑 SUPER ADMIN");
    console.log(`   UUID: ${superAdmin.uuid} | +905050973672 | Admin@123`);

    console.log("\n📋 POSTMAN SETUP:");
    console.log("   1. Login with owner phone → save accessToken");
    console.log("   2. Set x-tenant-id header → tenant UUID");
    console.log("   3. Use store UUID in route params");
    console.log("══════════════════════════════════════════════════\n");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());