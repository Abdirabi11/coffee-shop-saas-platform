import type { Request, Response, NextFunction } from "express";
import { getCacheVersion } from "../../cache/cacheVersion.ts";


export function menuCacheControl(maxAge: number = 60) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const storeUuid = req.params.storeUuid || req.query.storeUuid as string;

        if (!storeUuid) {
            return next();
        };

        try {
        // Get current menu version
            const version = await getCacheVersion(`menu:${storeUuid}`);

            // Check client version
            const clientVersion = req.headers["if-none-match"];

            if (clientVersion === version) {
                // Client has latest version
                return res.status(304).end();
            }

            // Set cache headers
            res.setHeader("ETag", version);
            res.setHeader("Cache-Control", `public, max-age=${maxAge}`);

            // Attach version to request
            req.menuVersion = version;

            next();
        } catch (error) {
            // Don't fail request if cache check fails
            next();
        }
    };
}
