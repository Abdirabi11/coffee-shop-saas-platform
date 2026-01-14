
export function getTimeBucket(
    date: Date = new Date(),
    bucketMinutes = 5
  ): string {
    const ms = date.getTime();
    const bucketMs = bucketMinutes * 60 * 1000;
  
    return Math.floor(ms / bucketMs).toString();
};