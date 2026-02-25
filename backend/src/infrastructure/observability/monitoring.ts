import axios from "axios"

export class MonitoringService extends EventEmitter {
    private static instance: MonitoringService;
    private metrics: Map<string, any> = new Map();
    private alerts: any[] = [];
  
    private constructor() {
      super();
    }
  
    static getInstance(): MonitoringService {
        if (!MonitoringService.instance) {
            MonitoringService.instance = new MonitoringService();
        }
        return MonitoringService.instance;
    }
      
    //Record metric
    recordMetric(name: string, value: number, tags: Record<string, string> = {}) {
        const key = `${name}_${JSON.stringify(tags)}`;
        const existing = this.metrics.get(key) || { values: [], count: 0, sum: 0 };
        
        existing.values.push({ value, timestamp: Date.now() });
        existing.count++;
        existing.sum += value;
    
        this.metrics.set(key, existing);
    
        // Send to monitoring backend (DataDog, Prometheus, etc.)
        this.sendToBackend('metric', { name, value, tags });
    }
  
    //Create alert
    createAlert(alert: {
        level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
        title: string;
        message: string;
        context?: any;
    }) {
        this.alerts.push({
            ...alert,
            timestamp: Date.now(),
        });
    
        this.emit('alert', alert);
    
        // Send to alerting system
        this.sendToAlertingSystem(alert);
    }
  
    //Get metrics summary
    getMetricsSummary(): any {
        const summary: any = {};
        
        for (const [key, data] of this.metrics.entries()) {
            summary[key] = {
            count: data.count,
            sum: data.sum,
            avg: data.sum / data.count,
            latest: data.values[data.values.length - 1],
            };
        }
    
        return summary;
    }
  

    //Send to monitoring backend
    private sendToBackend(type: string, data: any) {
        // Integration with DataDog, Prometheus, New Relic, etc.
        if (process.env.DATADOG_API_KEY) {
            // Send to DataDog
        }
    
        if (process.env.PROMETHEUS_PUSHGATEWAY) {
            // Send to Prometheus
        }
    }
  

    //Send to alerting system
    private sendToAlertingSystem(alert: any) {
        // Integration with PagerDuty, Opsgenie, Slack, etc.
        if (process.env.PAGERDUTY_API_KEY && alert.level === 'CRITICAL') {
            // Trigger PagerDuty
        }
    
        if (process.env.SLACK_WEBHOOK_URL) {
            // Send to Slack
            this.sendSlackAlert(alert);
        }
    }

    //Send Slack alert
    private async sendSlackAlert(alert: any) {
        try {
            const axios = require('axios');
            
            const color = {
                INFO: '#36a64f',
                WARNING: '#ff9900',
                ERROR: '#ff0000',
                CRITICAL: '#8B0000',
            }[alert.level];
  
            await axios.post(process.env.SLACK_WEBHOOK_URL!, {
                attachments: [{
                    color,
                    title: alert.title,
                    text: alert.message,
                    fields: alert.context ? Object.entries(alert.context).map(([key, value]) => ({
                        title: key,
                        value: JSON.stringify(value),
                        short: true,
                    })) : [],
                    footer: 'Payment Monitoring System',
                    ts: Math.floor(Date.now() / 1000),
                }],
            });
        } catch (error: any) {
            console.error('[Monitoring] Failed to send Slack alert:', error.message);
        }
    }
}
  
// Export singleton
export const monitoring = MonitoringService.getInstance();
  