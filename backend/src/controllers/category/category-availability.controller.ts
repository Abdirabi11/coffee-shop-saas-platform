import type { Request, Response } from "express"
import { CategoryAvailabilityService } from "../../services/category/category-availability.service.ts"


export const addCategoryAvailability= async (req: Request, res: Response)=>{
    try {
        const availability= await CategoryAvailabilityService.add(
            req.params.categoryUuid,
            req.body
        );
        res.status(201).json(availability);
    } catch (err) {
        console.error("ADD_CATEGORY_AVAILABILITY", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getCategoryAvailability= async (req: Request, res: Response)=>{
    try {
        const data= await CategoryAvailabilityService.list(
            req.params.categoryUuid
        );
        res.json(data);
    } catch (err) {
        console.error("GET_CATEGORY_AVAILABILITY", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updateCategoryAvailability= async (req: Request, res: Response)=>{
    try {
        const availability= await CategoryAvailabilityService.update(
            req.params.uuid,
            req.body
        );
        res.json(availability)
    } catch (err) {
        console.error("UPDATE_CATEGORY_AVAILABILITY", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteCategoryAvailability= async (req: Request, res: Response)=>{
    try {
        await CategoryAvailabilityService.delete(req.params.uuid);
        res.status(204).send();
    } catch (err) {
        console.error("DELETE_CATEGORY_AVAILABILITY", err);
        res.status(500).json({ message: "Internal server error" });
    }
};