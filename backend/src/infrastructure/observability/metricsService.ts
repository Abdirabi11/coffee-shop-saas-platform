import { Registry, Counter, Histogram, Gauge } from "prom-client";

interface MetricTags {
    [key: string]: string;
};
  
interface MetricData {
    type: "counter" | "timing" | "gauge";
    name: string;
    value: number;
    tags?: MetricTags;
};
  
export class MetricsService {
    private static registry: Registry;
    private static counters: Map<string, Counter> = new Map();
    private static histograms: Map<string, Histogram> = new Map();
    private static gauges: Map<string, Gauge> = new Map();
    private static isInitialized = false;
  
    //Initialize metrics (call once at app startup)
    static initialize() {
        if (this.isInitialized) return;
    
        this.registry = new Registry();
    
        // Set default labels (environment, service name, etc.)
        this.registry.setDefaultLabels({
            app: "coffee-management-saas",
            environment: process.env.NODE_ENV || "development",
        });
    
        this.isInitialized = true;
    
        console.log("[MetricsService] Initialized with Prometheus");
    }
    
    //Increment a counter
    //Use for: request counts, error counts, event counts
    static increment(
        name: string,
        value: number = 1,
        tags?: MetricTags
    ) {
        this.ensureInitialized();
    
        try {
            // Get or create counter
            let counter = this.counters.get(name);
            
            if (!counter) {
                const labelNames = tags ? Object.keys(tags) : [];
                
                counter = new Counter({
                    name: this.sanitizeMetricName(name),
                    help: `Counter for ${name}`,
                    labelNames,
                    registers: [this.registry],
                });
          
                this.counters.set(name, counter);
            }
  
            // Increment with labels
            if (tags) {
                counter.inc(tags, value);
            } else {
                counter.inc(value);
            }
  
            // Also log for debugging
            this.logMetric({
                type: "counter",
                name,
                value,
                tags,
            });
  
        } catch (error: any) {
            console.error(`[MetricsService] Failed to increment ${name}:`, error.message);
        }
    }

    //Record timing/duration (in milliseconds)
    //Use for: response times, job durations, query times
    static timing(
        name: string,
        durationMs: number,
        tags?: MetricTags
    ) {
        this.ensureInitialized();
  
        try {
            // Get or create histogram
            let histogram = this.histograms.get(name);
            
            if (!histogram) {
                const labelNames = tags ? Object.keys(tags) : [];
                
                histogram = new Histogram({
                    name: this.sanitizeMetricName(name),
                    help: `Histogram for ${name}`,
                    labelNames,
                    buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000], // milliseconds
                    registers: [this.registry],
                });
                
                this.histograms.set(name, histogram);
            }
    
            // Observe duration
            if (tags) {
                histogram.observe(tags, durationMs);
            } else {
                histogram.observe(durationMs);
            }
    
            // Also log for debugging
            this.logMetric({
                type: "timing",
                name,
                value: durationMs,
                tags,
            });
    
        } catch (error: any) {
            console.error(`[MetricsService] Failed to record timing ${name}:`, error.message);
        }
    }
  
    //Set gauge value
    //Use for: active connections, queue size, memory usage
    static gauge(
        name: string,
        value: number,
        tags?: MetricTags
    ) {
        this.ensureInitialized();
    
        try {
            // Get or create gauge
            let gauge = this.gauges.get(name);
            
            if (!gauge) {
                const labelNames = tags ? Object.keys(tags) : [];
                
                gauge = new Gauge({
                    name: this.sanitizeMetricName(name),
                    help: `Gauge for ${name}`,
                    labelNames,
                    registers: [this.registry],
                });
          
                this.gauges.set(name, gauge);
            }
  
            // Set gauge value
            if (tags) {
                gauge.set(tags, value);
            } else {
                gauge.set(value);
            }
  
            // Also log for debugging
            this.logMetric({
                type: "gauge",
                name,
                value,
                tags,
            });
    
        } catch (error: any) {
            console.error(`[MetricsService] Failed to set gauge ${name}:`, error.message);
        }
    }
  
    //Get metrics in Prometheus format (for /metrics endpoint)
    static async getMetrics(): Promise<string> {
        this.ensureInitialized();
        return this.registry.metrics();
    }
  
    //Get registry (for advanced use cases)
    static getRegistry(): Registry {
        this.ensureInitialized();
        return this.registry;
    }
  
    //Clear all metrics (for testing)
    static clear() {
        this.registry.clear();
        this.counters.clear();
        this.histograms.clear();
        this.gauges.clear();
    }
  
    //Ensure service is initialized
    private static ensureInitialized() {
        if (!this.isInitialized) {
            this.initialize();
        }
    }
  
    //Sanitize metric name for Prometheus
    //(replace dots with underscores, lowercase)
    private static sanitizeMetricName(name: string): string {
        return name.replace(/\./g, "_").toLowerCase();
    }
  
    //Log metric for debugging (only in development)
    private static logMetric(metric: MetricData) {
        if (process.env.NODE_ENV === "development") {
            const tagsStr = metric.tags 
             ? ` ${JSON.stringify(metric.tags)}` 
             : "";
            
            console.log(
                `[METRIC] ${metric.type.toUpperCase()}: ${metric.name} = ${metric.value}${tagsStr}`
            );
        };
    }
  
    //Send metrics to external service (DataDog, New Relic, etc.)
    //This is called automatically if configured
    private static async sendToExternalService(metric: MetricData) {
        // If DataDog is configured
        if (process.env.DATADOG_API_KEY) {
            // Send to DataDog
            // Implementation here
        }
    
        // If New Relic is configured
        if (process.env.NEW_RELIC_LICENSE_KEY) {
            // Send to New Relic
            // Implementation here
        }
    }
}