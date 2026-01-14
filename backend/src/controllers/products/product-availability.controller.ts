import type { Request, Response } from "express"
import { ProductAvailabilityService } from "../../services/products/product-availability.service.ts";


export const addAvailability = async (req: Request, res: Response) => {
    try {
      const { productUuid } = req.params;
  
      const availability = await ProductAvailabilityService.add(
        productUuid,
        req.body
      );
  
      res.status(201).json(availability);
    } catch (err) {
      console.error("ADD_AVAILABILITY", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const getAvailability = async (req: Request, res: Response) => {
    try {
      const data = await ProductAvailabilityService.list(
        req.params.productUuid
      );
      res.json(data);
    } catch (err) {
      console.error("GET_AVAILABILITY", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const updateAvailability = async (req: Request, res: Response) => {
    try {
      const availability = await ProductAvailabilityService.update(
        req.params.uuid,
        req.body
      );
      res.json(availability);
    } catch (err) {
      console.error("UPDATE_AVAILABILITY", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteAvailability = async (req: Request, res: Response) => {
    try {
      await ProductAvailabilityService.delete(req.params.uuid);
      res.status(204).send();
    } catch (err) {
      console.error("DELETE_AVAILABILITY", err);
      res.status(500).json({ message: "Internal server error" });
    }
};
  