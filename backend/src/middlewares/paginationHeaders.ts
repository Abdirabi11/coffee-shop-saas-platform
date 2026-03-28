import type { Request, Response, NextFunction } from "express";

export function addPaginationHeaders(
    res: Response,
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    }
){
    res.set({
      "X-Page": String(pagination.page),
      "X-Per-Page": String(pagination.limit),
      "X-Total": String(pagination.total),
      "X-Total-Pages": String(pagination.totalPages),
    });
}
