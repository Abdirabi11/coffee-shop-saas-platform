import compression from "compression";
import type { Request, Response } from "express";

export const compressionMiddleware = compression({
    // Only compress responses larger than 1KB
    threshold: 1024,
  
    // Don't compress responses with these headers
    filter: (req: Request, res: Response) => {
        // Don't compress if client doesn't support it
        if (req.headers["x-no-compression"]) {
            return false;
        }
    
        // Don't compress webhooks (they're usually small)
        if (req.path.includes("/webhooks/")) {
            return false;
        }
    
        // Use compression for everything else
        return compression.filter(req, res);
    },
  
    // Compression level (0-9, higher = more compression but slower)
    level: 6,
});