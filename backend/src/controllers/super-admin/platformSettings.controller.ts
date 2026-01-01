import type { Request, Response, NextFunction } from "express"
import prisma from "../../config/prisma.ts"

export const setMaintenanceMode= async(req:Request, res:Response)=>{
    const { enabled, message } = req.body;

    await prisma.platformSetting.upsert({
        where: {key: "MAINTENANCE_MODE"},
        update: {
            value: {enabled, message},
            updatedBy: req.user.userUuid
        },
        create: {
            key: "MAINTENANCE_MODE",
            value: {enabled, message},
            updatedBy: req.user.userUuid,
        }
    });
    res.json({ enabled, message });
}

export const listFeatureFlags= async(req:Request, res:Response)=>{
    const flags= await prisma.featureFlag.findMany();
    res.json(flags);
};

export const upsertFeatureFlag= async (req:Request, res:Response)=>{
    const {key, enabled, rollout, description}= req.body;
    const flag= await prisma.featureFlag.upsert({
        where: {key},
        update: {enabled, rollout, description},
        create: { key, enabled, rollout, description },
    });
    res.json(flag)
};

export const setGlobalFinanceSettings= async (req:Request, res:Response)=>{
    const {taxRate, currency }= req.body;

    await prisma.platformSetting.upsert({
        where: {key: "FINANCE"},
        update: {
            value: { taxRate, currency },
            updatedBy: req.user.userUuid,
        },
        create: {
            key: "FINANCE",
            value: { taxRate, currency },
            updatedBy: req.user.userUuid,
        }
    });
    res.json({ taxRate, currency });
};

export const listEmailTemplates= async (req:Request, res:Response)=>{
    const templtes= await prisma.emailTemplate.findMany();
    res.json(templtes)
};

export const updateEmailTemplate= async (req:Request, res:Response)=>{
    const {key}= req.params;
    const {subject, bodyHtml, bodyText, isActive}= req.body;

    const template= await prisma.emailTemplate.update({
        where: { key },
        data: { subject, bodyHtml, bodyText, isActive },
    });
    res.json(template);
};

export const getBranding= async (req:Request, res:Response)=>{
    const branding= await prisma.brandingSetting.findFirst();
    res.json(branding);
};

export const updateBranding= async (req:Request, res:Response)=>{
    const branding= await prisma.brandingSetting.upsert({
        where: { uuid: "GLOBAL" },
        update: req.body,
        create: { uuid: "GLOBAL", ...req.body },
    });
    res.json(branding);
};
