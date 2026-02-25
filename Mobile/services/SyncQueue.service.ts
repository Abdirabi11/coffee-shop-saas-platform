import { openDatabase } from "./Database";


interface SyncQueueItem {
  entityType: "order" | "payment" | "product";
  entityUuid: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: any;
  priority?: number;
}

export class SyncQueueService {
  
    //Add item to sync queue
    static async enqueue(item: SyncQueueItem) {
        const db = await openDatabase();
        
        await db.executeSql(
            `INSERT INTO syncQueue (entityType, entityUuid, operation, payload, priority, status, createdAt)
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
            [
                item.entityType,
                item.entityUuid,
                item.operation,
                JSON.stringify(item.payload),
                item.priority || 0,
                Date.now(),
        ]
        );
        
        console.log(`[SyncQueue] Enqueued ${item.operation} ${item.entityType}`);
        
        // Trigger sync if online
        if (await this.isOnline()) {
            this.processSyncQueue();
        }
    }
  
    //Process sync queue
    static async processSyncQueue() {
        if (this.isSyncing) {
            console.log("[SyncQueue] Already syncing");
            return;
        };
    
        this.isSyncing = true;
    
        try {
            const db = await openDatabase();
            
            // Get pending items (highest priority first)
            const [results] = await db.executeSql(
                `SELECT * FROM syncQueue 
                WHERE status = 'PENDING' 
                ORDER BY priority DESC, createdAt ASC 
                LIMIT 10`
            );
            
            const items = results.rows.raw();
            
            console.log(`[SyncQueue] Processing ${items.length} items`);
            
            for (const item of items) {
                try {
                    // Mark as processing
                    await db.executeSql(
                        `UPDATE syncQueue SET status = 'PROCESSING' WHERE id = ?`,
                        [item.id]
                    );
                    
                    // Send to server
                    const result = await this.syncToServer(item);
                    
                    if (result.success) {
                        // Mark as success
                        await db.executeSql(
                        `UPDATE syncQueue SET status = 'SUCCESS', processedAt = ? WHERE id = ?`,
                        [Date.now(), item.id]
                        );
                        
                        // Update entity with server response
                        await this.updateLocalEntity(item, result.serverData);
                        
                    } else {
                        // Handle failure
                        await this.handleSyncFailure(item, result.error);
                    }; 
                } catch (error: any) {
                    console.error(`[SyncQueue] Failed to sync item ${item.id}:`, error);
                    await this.handleSyncFailure(item, error.message);
                }
            }
        } finally {
            this.isSyncing = false;
        }
    
        // Check if more items to process
        const hasMore = await this.hasPendingItems();
        if (hasMore && await this.isOnline()) {
            setTimeout(() => this.processSyncQueue(), 1000);
        }
    }
  
    //Sync single item to server
    private static async syncToServer(item: any) {
        const payload = JSON.parse(item.payload);
        
        try {
            let response;
            
            switch (item.entityType) {
                case "order":
                response = await this.syncOrder(item.operation, payload);
                break;
                case "payment":
                response = await this.syncPayment(item.operation, payload);
                break;
                case "product":
                response = await this.syncProduct(item.operation, payload);
                break;
                default:
                throw new Error(`Unknown entity type: ${item.entityType}`);
            }
        
            return {
                success: true,
                serverData: response.data,
            };
            
            } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
  
   //Sync order to server
    private static async syncOrder(operation: string, payload: any) {
        const endpoint = "/api/sync/orders";
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${await getAuthToken()}`,
            },
            body: JSON.stringify({
                operation,
                clientOrderUuid: payload.clientOrderUuid,
                data: payload,
                syncVersion: payload.syncVersion,
                timestamp: Date.now(),
            }),
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        return response.json();
    }

    //Handle sync failure
    private static async handleSyncFailure(item: any, error: string) {
        const db = await openDatabase();
        
        const retries = item.retries + 1;
        
        if (retries >= item.maxRetries) {
            // Max retries reached - mark as failed
            await db.executeSql(
                `UPDATE syncQueue SET status = 'FAILED', retries = ?, error = ? WHERE id = ?`,
                [retries, error, item.id]
            );
            
            console.error(`[SyncQueue] Item ${item.id} failed after ${retries} retries`);
            
            // Notify user
            await this.notifyUserOfSyncFailure(item);
      
        } else {
            // Retry later
            await db.executeSql(
                `UPDATE syncQueue SET status = 'PENDING', retries = ?, error = ? WHERE id = ?`,
                [retries, error, item.id]
            );
            
            console.log(`[SyncQueue] Item ${item.id} will retry (${retries}/${item.maxRetries})`);
        }
    }
  
    //Update local entity with server data
    private static async updateLocalEntity(queueItem: any, serverData: any) {
        const db = await openDatabase();
        
        if (queueItem.entityType === "order") {
            await db.executeSql(
                `UPDATE orders SET 
                uuid = ?,
                orderNumber = ?,
                syncStatus = 'SYNCED',
                syncVersion = ?,
                serverConfirmed = 1,
                isOptimistic = 0,
                updatedAtServer = ?
                WHERE clientOrderUuid = ?`,
                [
                serverData.uuid,
                serverData.orderNumber,
                serverData.syncVersion,
                Date.now(),
                queueItem.entityUuid,
                ]
            );
        }
        
        // Similar for payment and product
    }
  
    //Check online status
    private static async isOnline(): Promise<boolean> {
        // Check network connectivity
        // In React Native: NetInfo.fetch().then(state => state.isConnected)
        return navigator.onLine;
    }

   //Check if queue has pending items
    private static async hasPendingItems(): Promise<boolean> {
        const db = await openDatabase();
        const [results] = await db.executeSql(
        `SELECT COUNT(*) as count FROM syncQueue WHERE status = 'PENDING'`
        );
        return results.rows.item(0).count > 0;
    }
  
   //Notify user of sync failure
    private static async notifyUserOfSyncFailure(item: any) {
        // Show notification to user
        // Alert.alert("Sync Failed", "Some changes could not be synced...")
    }
  
    private static isSyncing = false;
}