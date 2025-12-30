const rolePriority = {
    CUSTOMER: 1,
    STAFF: 2,
    MANAGER: 3,
    ADMIN: 4,
    SUPER_ADMIN: 5,
  };
  
export const canAccess = (userRole: string, requiredRole: string) => {
return rolePriority[userRole] >= rolePriority[requiredRole];
};