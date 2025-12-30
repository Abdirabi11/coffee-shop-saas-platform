export const notifyAdmins= async (event: {
    userUuid?: string;
    reason: string;
    severity: string;
    ipAddress: string;
})=>{
    if (event.severity === "Low") return ;
    console.log("🚨 ADMIN ALERT", event);
}