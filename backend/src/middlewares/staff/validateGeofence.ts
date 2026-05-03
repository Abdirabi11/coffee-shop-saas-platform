import type { Request, Response, NextFunction } from "express";
import prisma from "../../config/prisma.ts"

//Validate geofence (optional, warnings only)
export async function validateGeofence(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const { latitude, longitude, storeUuid } = req.body;

        if (!latitude || !longitude || !storeUuid) {
            return next();
        }

        const store = await prisma.store.findUnique({
            where: { uuid: storeUuid },
            select: { latitude: true, longitude: true },
        });

        if (!store?.latitude || !store?.longitude) {
            return next();
        }

        const distance = calculateDistance(
            latitude,
            longitude,
            store.latitude,
            store.longitude
        );

        // Max 100 meters
        if (distance > 100) {
            req.geofenceViolation = true;
            req.distanceFromStore = distance;
        }

        next();

    } catch (error: any) {
        // Don't block on errors
        next();
    }
}

function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}