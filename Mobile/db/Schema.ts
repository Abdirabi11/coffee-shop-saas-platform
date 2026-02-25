export const localSchema = {
    orders: {
        uuid: "TEXT PRIMARY KEY",
        clientOrderUuid: "TEXT UNIQUE", // Generated locally
        tenantUuid: "TEXT",
        storeUuid: "TEXT",
        tenantUserUuid: "TEXT",
        orderNumber: "TEXT",
        orderType: "TEXT",
        status: "TEXT",
        totalAmount: "INTEGER",
        currency: "TEXT",
        items: "TEXT", // JSON string
        
        // Sync metadata
        syncStatus: "TEXT", // PENDING, SYNCING, SYNCED, FAILED
        syncVersion: "INTEGER DEFAULT 0",
        lastSyncAttempt: "INTEGER",
        syncRetries: "INTEGER DEFAULT 0",
        conflictResolution: "TEXT", // CLIENT_WINS, SERVER_WINS, MANUAL
        
        // Timestamps
        createdAtClient: "INTEGER", // Unix timestamp
        updatedAtClient: "INTEGER",
        createdAtServer: "INTEGER",
        updatedAtServer: "INTEGER",
        
        // Optimistic UI
        isOptimistic: "INTEGER DEFAULT 1", // 1 = not confirmed by server
        serverConfirmed: "INTEGER DEFAULT 0",
        
        // Offline flags
        createdOffline: "INTEGER DEFAULT 0",
        modifiedOffline: "INTEGER DEFAULT 0",
    },
    
    payments: {
        uuid: "TEXT PRIMARY KEY",
        clientPaymentUuid: "TEXT UNIQUE",
        orderUuid: "TEXT",
        amount: "INTEGER",
        method: "TEXT", // PROVIDER, CASH
        status: "TEXT",
        
        // Sync metadata
        syncStatus: "TEXT",
        syncVersion: "INTEGER DEFAULT 0",
        createdOffline: "INTEGER DEFAULT 0",
        
        // Provider details (for online payments)
        providerRef: "TEXT",
        providerResponse: "TEXT",
    },
    
    products: {
        uuid: "TEXT PRIMARY KEY",
        tenantUuid: "TEXT",
        storeUuid: "TEXT",
        name: "TEXT",
        basePrice: "INTEGER",
        imageUrl: "TEXT",
        isActive: "INTEGER",
        
        // Sync metadata
        syncVersion: "INTEGER",
        lastSyncedAt: "INTEGER",
        
        // Cached data
        cacheExpiry: "INTEGER",
        isStale: "INTEGER DEFAULT 0",
    },
    
    syncQueue: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        entityType: "TEXT", // order, payment, product
        entityUuid: "TEXT",
        operation: "TEXT", // CREATE, UPDATE, DELETE
        payload: "TEXT", // JSON
        priority: "INTEGER DEFAULT 0", // Higher = sync first
        status: "TEXT", // PENDING, PROCESSING, SUCCESS, FAILED
        retries: "INTEGER DEFAULT 0",
        maxRetries: "INTEGER DEFAULT 3",
        error: "TEXT",
        createdAt: "INTEGER",
        processedAt: "INTEGER",
    },
    
    // Conflict log for manual resolution
    conflicts: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        entityType: "TEXT",
        entityUuid: "TEXT",
        clientVersion: "TEXT",
        serverVersion: "TEXT",
        resolution: "TEXT",
        resolvedAt: "INTEGER",
    },
};
  