import type { Request, Response } from "express";
import * as adminSessionService from "../services/admin.session.service";
import { logAudit } from "../utils/audit";


export const viewActiveSessions= async (req: Request, res: Response)=>{
    const sessions= adminSessionService.getActiveSessions(
        req.user!.storeUuid
    );
    res.json({ sessions });
}

export const forceLogoutUsers= async (req: Request, res: Response)=>{
    const {userUuid}= req.body;
    if (!userUuid) {
        return res.status(400).json({ message: "userUuid required" });
    };

    await adminSessionService.forceLogoutUser(
        userUuid,
        req.user!.storeUuid
    )

    await logAudit({
        actorUuid: req.user?.userUuid,
        storeUuid: req.user!.storeUuid,
        action: "FORCE_LOGOUT_USER",
        targetType: "USER",
        targetUuid: userUuid,
        req
    });
    
    res.json({success: true})
};

export const killSpecificDevice= async (req: Request, res: Response)=>{
    const {sessionUuid}= req.body;
    if (!sessionUuid) {
        return res.status(400).json({ message: "sessionUuid required" });
    };

    await adminSessionService.revokeSession(sessionUuid);

    await logAudit({
        actorUuid: req.user?.userUuid,
        action: "KILL_SESSION",
        targetType: "SESSION",
        targetUuid: sessionUuid,
        req,
    })
    res.json({success: true})
};


// export const detectSuspiciousIps = async (_req: Request, res: Response) => {
//     try {
//         const ips = await prisma.session.groupBy({
//             by: ["ipAddress"],
//             _count: { ipAddress: true },
//             having: {
//               ipAddress: {
//                 _count: {
//                   gt: 5,
//                 },
//               },
//             },
//         });
        
//         res.json({ suspiciousIps: ips });
//     } catch (err) {
//         console.error("Error in admin detect suspicious Ips:", err);
//         return res.status(500).json({ message: "Internal server error" });
//     }
   
// };


  