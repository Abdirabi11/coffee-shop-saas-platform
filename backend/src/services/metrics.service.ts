type MetricTags = Record<string, string | number>;

export class MetricsService {
    static increment(
      name: string,
      value = 1,
      tags?: MetricTags
    ) {
      this.emit({
        type: "counter",
        name,
        value,
        tags,
      });
    }

    static timing(
        name: string,
        durationMs: number,
        tags?: MetricTags
      ) {
        this.emit({
          type: "timing",
          name,
          value: durationMs,
          tags,
        });
    }

    private static emit(metric: {
        type: "counter" | "timing";
        name: string;
        value: number;
        tags?: MetricTags;
    }) {
        // 🔌 Today: console / internal buffer
        console.log("[METRIC]", metric);

        // 🔮 Tomorrow:
        // - Prometheus
        // - Datadog
        // - OpenTelemetry
    }
}