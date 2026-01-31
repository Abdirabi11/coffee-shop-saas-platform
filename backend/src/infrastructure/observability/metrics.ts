export class MetricsService {
    static increment(
      name: string,
      value = 1,
      labels?: Record<string, string>
    ) {
      // noop for now, replace later
      console.log("METRIC", {
        name,
        value,
        labels,
      });
    }
  
    static timing(
      name: string,
      durationMs: number,
      labels?: Record<string, string>
    ) {
      console.log("METRIC_TIMING", {
        name,
        durationMs,
        labels,
      });
    }
};
  