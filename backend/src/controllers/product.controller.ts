import type { Request, Response, NextFunction } from "express"
import prisma from "../config/prisma.ts"


export const addProduct= async (req: Request, res: Response)=>{
    try {
        const {name, description, basePrice, imageUrl}= req.body;
        if(!name || !description || !basePrice || !imageUrl){
            return res.status(400).json({ message: "All fields are required" });
        };


    } catch (err) {
        console.error("Error in add product controller:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getProducts= async (req: Request, res: Response)=>{
    try {
        const products= await prisma.product.findMany({
            
        })
    } catch (err) {
        console.error("Error in get product controller:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getSingleProduct= async (req: Request, res: Response)=>{
    try {
        
    } catch (err) {
        console.error("Error in get single product controller:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updateProduct= async (req: Request, res: Response)=>{
    try {
        
    } catch (err) {
        
    }
};

export const deleteProduct= async (req: Request, res: Response)=>{
    try {
        
    } catch (err) {
        
    }
};

