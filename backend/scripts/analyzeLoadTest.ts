import * as fs from 'fs';

interface LoadTestReport {
    aggregate: {
            counters: Record<string, number>;
            rates: Record<string, number>;
            summaries: Record<string, {
            min: number;
            max: number;
            median: number;
            p95: number;
            p99: number;
        }>;
    };
}

function analyzeLoadTest(reportPath: string) {
    const report: LoadTestReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    
    console.log('📊 LOAD TEST RESULTS');
    console.log('===================\n');
    
    // Request metrics
    const totalRequests = report.aggregate.counters['http.requests'] || 0;
    const successfulRequests = report.aggregate.counters['http.codes.200'] || 0;
    const failedRequests = totalRequests - successfulRequests;
    const successRate = (successfulRequests / totalRequests) * 100;
    
    console.log('📈 Request Metrics:');
    console.log(`  Total Requests: ${totalRequests}`);
    console.log(`  Successful: ${successfulRequests} (${successRate.toFixed(2)}%)`);
    console.log(`  Failed: ${failedRequests} (${(100 - successRate).toFixed(2)}%)`);
    console.log('');
    
    // Response time
    const responseTime = report.aggregate.summaries['http.response_time'];
    if (responseTime) {
        console.log('⏱️  Response Time:');
        console.log(`  Median: ${responseTime.median}ms`);
        console.log(`  P95: ${responseTime.p95}ms`);
        console.log(`  P99: ${responseTime.p99}ms`);
        console.log(`  Min: ${responseTime.min}ms`);
        console.log(`  Max: ${responseTime.max}ms`);
        console.log('');
    }
    
    // Throughput
    const requestRate = report.aggregate.rates['http.request_rate'] || 0;
    console.log('🚀 Throughput:');
    console.log(`  Requests/sec: ${requestRate.toFixed(2)}`);
    console.log('');
    
    // Pass/Fail criteria
    console.log('✅ Pass/Fail Criteria:');
    console.log(`  Success Rate > 95%: ${successRate > 95 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  P95 < 500ms: ${responseTime?.p95 < 500 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  P99 < 1000ms: ${responseTime?.p99 < 1000 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  No 5xx errors: ${!report.aggregate.counters['http.codes.5xx'] ? '✅ PASS' : '❌ FAIL'}`);
    
    // Overall verdict
    const allPassed = 
        successRate > 95 &&
        responseTime?.p95 < 500 &&
        responseTime?.p99 < 1000 &&
        !report.aggregate.counters['http.codes.5xx'];
    
    console.log('');
    console.log(`🎯 Overall: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
}

// Run analysis
analyzeLoadTest('./report.json');
