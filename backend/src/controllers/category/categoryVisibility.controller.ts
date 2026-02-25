import type { Request, Response } from "express"
import prisma from "../../config/prisma.ts"

export const addCategoryVisibility= async (req: Request, res: Response)=>{
    try {
        const {categoryUuid}= req.params;
        const { dayOfWeek, startTime, endTime } = req.body;

        const schedule= await prisma.categoryVisibilitySchedule.creare({
            data: {
                categoryUuid,
                dayOfWeek,
                startTime,
                endTime,
            }
        });
        res.status(201).json(schedule);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to add visibility schedule" });
    }
};

export const deleteCategoryVisibility = async(req: Request, res: Response)=>{
    try {
        const {categoryUuid}= req.params;
        await prisma.categoryVisibilitySchedule.delete({
            where: {uuid: categoryUuid}
        });
        res.json({ message: "Visibility schedule removed" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete visibility schedule" });
    }
};