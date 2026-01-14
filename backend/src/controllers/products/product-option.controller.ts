import type { Request, Response } from "express"
import { ProductOptionService } from "../../services/product-option.service.ts";


export const addOptionGroup = async (req: Request, res: Response) => {
    try {
        const {productUuid}= req.params;
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Group name is required" });
        }

        const group = await ProductOptionService.createGroup(
            productUuid,
            req.body
        );
        res.status(201).json(group);
    } catch (err) {
        console.error("ADD_OPTION_GROUP", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getOptionGroups = async (req: Request, res: Response) => {
    try {
      const groups = await ProductOptionService.listGroups(
        req.params.productUuid
      );
  
      res.json(groups);
    } catch (err) {
      console.error("GET_OPTION_GROUPS", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const updateOptionGroup= async (req: Request, res: Response)=>{
    try {
        const group= await ProductOptionService.updateGroup(
            req.params.groupUuid,
            req.body
        );
        res.json(group);
    } catch (err) {
        console.error("UPDATE_OPTION_GROUP", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteOptionGroup= async (req: Request, res: Response)=>{
    try {
        await ProductOptionService.deleteGroup(req.params.groupUuid);
        res.status(204).send();
    } catch (err) {
        console.error("DELETE_OPTION_GROUP", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

//options

export const addOption= async (req: Request, res: Response)=>{
    try {
        const {name}= req.body;
        if (!name) {
            return res.status(400).json({ message: "Option name is required" });
        };

        const option = await ProductOptionService.createOption(
            req.params.groupUuid,
            req.body
        );
      
        res.status(201).json(option);
    } catch (err) {
        console.error("ADD_OPTION", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updateOption = async (req: Request, res: Response) => {
    try {
      const option = await ProductOptionService.updateOption(
        req.params.optionUuid,
        req.body
      );
  
      res.json(option);
    } catch (err) {
      console.error("UPDATE_OPTION", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteOption = async (req: Request, res: Response) => {
    try {
      await ProductOptionService.deleteOption(req.params.optionUuid);
      res.status(204).send();
    } catch (err) {
      console.error("DELETE_OPTION", err);
      res.status(500).json({ message: "Internal server error" });
    }
};