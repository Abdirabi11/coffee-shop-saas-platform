import { Request, Response } from "express";
import * as PlanService from "../../services/plan.services.ts"
import { validatePlanDowngrade } from "../../services/planDowngrade.service.ts";


// Analytics integration
// Plan analytics:
// Subscribers per plan
// Revenue per plan
// Churn per plan

export const listPlans= async (req:Request, res:Response)=>{
    const plans = await PlanService.listActivePlans();
    res.json(plans);
};

export const createPlan= async (req:Request, res:Response)=>{
    const {name, description}= req.body;
    const plan= await PlanService.createPlan(
        name,
        description,
        req.user.userUuid,
        req
    );
    res.status(201).json(plan);
};

export const createPlanVersion= async(req:Request, res:Response)=>{
    const {planUuid}= req.params;
    const {price, interval, features}= req.body;

    const version= await PlanService.createPlanVersion(
        planUuid,
        price,
        interval,
        features
    );
    res.status(201).json(version);
};

export const updatePlan= async (req:Request, res:Response)=>{
   const {planUuid}= req.params
   const { name, description } = req.body;

   const plan= await PlanService.updatePlanService(
        planUuid,
        {name, description},
        {
            userUuid: req.user.userUuid,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
        }
    );
    
   res.json(plan);
};

export const disablePlan= async (req:Request, res:Response)=>{
   await PlanService .setPlanStatus(
        req.params.planUuid,
        false,
        req.user.userUuid,
        req
   );
   res.json({ message: "Plan disabled" });
};

export const enablePlan= async (req:Request, res:Response)=>{
    await PlanService.setPlanStatus(
        req.params.planUuid,
        true,
        req.user.userUuid,
        req
    );
    res.json({ message: "Plan enabled" });
};

export const migratePlan= async (req:Request, res:Response)=>{
   const {tenantUuid}= req.params;
   const { newPlanVersionUuid, effective } = req.body;

   const check = await validatePlanDowngrade(
    tenantUuid,
    newPlanVersionUuid
  );
  
  if (!check.allowed) {
    return res.status(400).json({
      message: "Plan downgrade not allowed",
      violations: check.violations,
    });
}
   
   await PlanService.migratePlan(
    tenantUuid,
    newPlanVersionUuid,
    effective
   );
   res.json({ message: "Plan migration processed" });
};