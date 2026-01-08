export function buildDateFilter(from?: string, to?: string) {
    if (!from && !to) return undefined;
  
    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };
}