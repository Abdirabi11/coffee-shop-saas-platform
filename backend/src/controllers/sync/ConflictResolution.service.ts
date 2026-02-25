
export type ConflictResolutionStrategy =
  | "CLIENT_WINS"      // Client data overwrites server
  | "SERVER_WINS"      // Server data overwrites client
  | "LAST_WRITE_WINS"  // Most recent timestamp wins
  | "MANUAL_REVIEW";   // Flag for user review


  export class ConflictResolutionService {
  
    //Resolve conflict between client and server data
    static resolve(input: {
      clientData: any;
      serverData: any;
      entityType: string;
      strategy?: ConflictResolutionStrategy;
    }) {
        const strategy = input.strategy || this.getDefaultStrategy(input.entityType);
    
        switch (strategy) {
            case "CLIENT_WINS":
                return {
                resolved: input.clientData,
                strategy: "CLIENT_WINS",
                };
            
            case "SERVER_WINS":
                return {
                resolved: input.serverData,
                strategy: "SERVER_WINS",
                };
            
            case "LAST_WRITE_WINS":
                const clientTime = new Date(input.clientData.updatedAt).getTime();
                const serverTime = new Date(input.serverData.updatedAt).getTime();
                
                return {
                    resolved: clientTime > serverTime ? input.clientData : input.serverData,
                    strategy: "LAST_WRITE_WINS",
                    winner: clientTime > serverTime ? "CLIENT" : "SERVER",
                };
                
            case "MANUAL_REVIEW":
                return {
                    resolved: null,
                    strategy: "MANUAL_REVIEW",
                    requiresUserInput: true,
                };
            
            default:
                throw new Error(`Unknown strategy: ${strategy}`);
        }
    }

    //Get default strategy for entity type
    private static getDefaultStrategy(entityType: string): ConflictResolutionStrategy {
        const strategies: Record<string, ConflictResolutionStrategy> = {
            order: "LAST_WRITE_WINS",     // Orders: most recent wins
            payment: "SERVER_WINS",        // Payments: server is source of truth
            product: "SERVER_WINS",        // Products: server is source of truth
            inventory: "SERVER_WINS",      // Inventory: server is source of truth
        };
        
        return strategies[entityType] || "MANUAL_REVIEW";
    }

    //Detect conflicts
    static detectConflict(input: {
        clientData: any;
        serverData: any;
    }): boolean {
        // Check if both versions have been modified
        const clientVersion = input.clientData.syncVersion || 0;
        const serverVersion = input.serverData.syncVersion || 0;
        
        // Conflict if versions diverged
        return clientVersion !== serverVersion;
    }
}