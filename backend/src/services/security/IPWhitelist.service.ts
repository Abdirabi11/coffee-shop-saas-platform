import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { redis } from "../../lib/redis.ts";

export class IPWhitelistService {
  
    /**
     * Check if IP is whitelisted
     */
    static async isIPWhitelisted(input: {
      tenantUuid: string;
      ipAddress: string;
      operation: string; // e.g., "ADMIN_ACCESS", "PAYMENT_CONFIG"
    }): Promise<boolean> {
      try {
        // Check cache first
        const cacheKey = `ip:whitelist:${input.tenantUuid}:${input.ipAddress}`;
        const cached = await redis.get(cacheKey);
  
        if (cached !== null) {
          return cached === "1";
        }
  
        // Get whitelist rules
        const rules = await prisma.iPWhitelist.findMany({
          where: {
            tenantUuid: input.tenantUuid,
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        });
  
        // Check if IP matches any rule
        const isWhitelisted = rules.some((rule) => {
          // Check if operation is allowed
          const allowedFor = rule.allowedFor as string[];
          if (!allowedFor.includes("*") && !allowedFor.includes(input.operation)) {
            return false;
          }
  
          // Exact IP match
          if (rule.ipAddress === input.ipAddress) {
            return true;
          }
  
          // IP range match (CIDR notation)
          if (rule.ipRange) {
            return this.isIPInRange(input.ipAddress, rule.ipRange);
          }
  
          return false;
        });
  
        // Cache for 5 minutes
        await redis.setex(cacheKey, 300, isWhitelisted ? "1" : "0");
  
        return isWhitelisted;
  
      } catch (error: any) {
        logWithContext("error", "[IPWhitelist] Failed to check IP", {
          error: error.message,
          ipAddress: input.ipAddress,
        });
  
        // Fail closed - deny access on error
        return false;
      }
    }
  
    /**
     * Add IP to whitelist
     */
    static async addIP(input: {
        tenantUuid: string;
        ipAddress?: string;
        ipRange?: string;
        description?: string;
        allowedFor: string[]; // Operations this IP can perform
        expiresAt?: Date;
        addedBy: string;
    }){
        try {
            if (!input.ipAddress && !input.ipRange) {
                throw new Error("Either ipAddress or ipRange must be provided");
            }
  
            const whitelist = await prisma.iPWhitelist.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    ipAddress: input.ipAddress,
                    ipRange: input.ipRange,
                    description: input.description,
                    allowedFor: input.allowedFor,
                    expiresAt: input.expiresAt,
                    addedBy: input.addedBy,
                    isActive: true,
                },
            });
  
            // Invalidate cache
            if (input.ipAddress) {
                const cacheKey = `ip:whitelist:${input.tenantUuid}:${input.ipAddress}`;
                await redis.del(cacheKey);
            }
  
            logWithContext("info", "[IPWhitelist] IP added to whitelist", {
                tenantUuid: input.tenantUuid,
                ipAddress: input.ipAddress,
                ipRange: input.ipRange,
            });
    
            return whitelist;
  
        } catch (error: any) {
            logWithContext("error", "[IPWhitelist] Failed to add IP", {
                error: error.message,
            });
            throw error;
        }
    }
  
    //Remove IP from whitelist
    static async removeIP(input: {
        tenantUuid: string;
        whitelistUuid: string;
        removedBy: string;
    }) {
        try {
            const whitelist = await prisma.iPWhitelist.update({
                where: {
                    uuid: input.whitelistUuid,
                    tenantUuid: input.tenantUuid,
                },
                data: {
                    isActive: false,
                },
            });
    
            // Invalidate cache
            if (whitelist.ipAddress) {
                const cacheKey = `ip:whitelist:${input.tenantUuid}:${whitelist.ipAddress}`;
                await redis.del(cacheKey);
            }
    
            logWithContext("info", "[IPWhitelist] IP removed from whitelist", {
                whitelistUuid: input.whitelistUuid,
            });
    
        } catch (error: any) {
            logWithContext("error", "[IPWhitelist] Failed to remove IP", {
                error: error.message,
            });
            throw error;
        }
    }
  
    //List whitelisted IPs
    static async listIPs(tenantUuid: string) {
        return prisma.iPWhitelist.findMany({
            where: {
                tenantUuid,
                isActive: true,
            },
            orderBy: { createdAt: "desc" },
        });
    }
  
    //Check if IP is in range (CIDR notation)
    private static isIPInRange(ip: string, range: string): boolean {
        // Simple CIDR check - you should use a library like 'ip-range-check' in production
        const [rangeIP, bits] = range.split("/");
        
        if (!bits) {
            return ip === rangeIP;
        }
    
        // Convert IPs to numbers and compare
        const ipNum = this.ipToNumber(ip);
        const rangeIPNum = this.ipToNumber(rangeIP);
        const mask = -1 << (32 - parseInt(bits));
    
        return (ipNum & mask) === (rangeIPNum & mask);
    }
  
    private static ipToNumber(ip: string): number {
        return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
    }
}
  