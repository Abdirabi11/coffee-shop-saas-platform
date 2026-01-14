import type { Request, Response, NextFunction } from "express"
import { ProductService } from "../../services/product.service.ts";


export const addProduct= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid;
        const { name, basePrice, imageUrl } = req.body;
        if (!name || !basePrice || !imageUrl) {
            return res.status(400).json({ message: "Missing required fields" });
        };

        const product = await ProductService.create(storeUuid, req.body);
        res.status(201).json(product);
    } catch (err) {
        console.error("ADD_PRODUCT", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getProducts= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid;
        const products = await ProductService.list(storeUuid);
        res.json(products);
    } catch (err) {
        console.error("GET_PRODUCTS", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getSingleProduct= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid;
        const product= await ProductService.getByUuid(
            storeUuid,
            req.params.productUuid
        );
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        };
      
        res.json(product);
    } catch (err) {
        console.error("GET_PRODUCT", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updateProduct= async (req: Request, res: Response)=>{
    try {
        const storeUuid = req.store!.uuid;

        const product = await ProductService.update(
            storeUuid,
            req.params.productUuid,
            req.body
        );

        res.json(product);
    } catch (err) {
        console.error("UPDATE_PRODUCT", err);
        res.status(500).json({ message: "Internal server error" }); 
    }
};

export const deleteProduct= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid;
        await ProductService.softDelete(
            storeUuid,
            req.params.productUuid
        );

        res.status(204).send();
    } catch (err) {
        console.error("DELETE_PRODUCT", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

