import type { Request, Response } from "express"
import { CategoryService } from "../../services/category.service.ts";

export const createCategory= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid;
        const {name}= req.body;

        if (!name) {
            return res.status(400).json({ message: "Category name required" });
        }
      
        const category = await CategoryService.create(storeUuid, { name });
        res.status(201).json(category);
    } catch (err) {
        console.error("CREATE_CATEGORY", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getCategories= async(req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid;
        const categories= await CategoryService.list(storeUuid);
    } catch (err) {
        console.error("GET_CATEGORIES", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    try {
      const category = await CategoryService.update(
        req.params.uuid,
        req.body
      );
      res.json(category);
    } catch (err) {
      console.error("UPDATE_CATEGORY", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteCategory= async (req: Request, res: Response)=>{
    try {
        await CategoryService.delete(req.params.uuid);
        res.status(204).send(); 
    } catch (err) {
        console.error("DELETE_CATEGORY", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const reorderCategories= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid;
        const {orders}= req.body;

        if (!Array.isArray(orders)) {
            return res.status(400).json({ message: "Invalid orders payload" });
        };
      
        await CategoryService.reorder(storeUuid, orders);
        res.json({ success: true });
    } catch (err) {
        console.error("REORDER_CATEGORIES", err);
        res.status(500).json({ message: "Internal server error" });
    }
};