export function buildDateFilter(from?: string, to?: string) {
    if (!from && !to) return undefined;
  
    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };
}
const WEEKDAYS: Record<string, string> = {
    Sun: "SUNDAY", Mon: "MONDAY", Tue: "TUESDAY", Wed: "WEDNESDAY",
    Thu: "THURSDAY", Fri: "FRIDAY", Sat: "SATURDAY",
};

// Wall-clock view of an instant in a store's IANA timezone (Store.timezone),
// for comparing against store-local schedules (opening hours, menu time
// slots). Never use the server's local time for these: the server may run in
// UTC while the store is in Africa/Mogadishu. An invalid zone falls back to
// UTC rather than failing the request.
export function storeLocalTime(now: Date, timeZone?: string | null): {
    dayName: string; // "MONDAY"
    time: string;    // "HH:mm", 00:00-23:59
    date: string;    // "YYYY-MM-DD"
} {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timeZone || "UTC",
            weekday: "short",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(now);
    } catch {
        return storeLocalTime(now, "UTC");
    }

    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    return {
        dayName: WEEKDAYS[part("weekday")],
        time: `${part("hour")}:${part("minute")}`,
        date: `${part("year")}-${part("month")}-${part("day")}`,
    };
}
