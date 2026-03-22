import axios from "axios";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class CurrencyConversionService {
    private static rates: Record<string, number> = {};
    private static lastFetch: Date | null = null;
 
    static async convert(input: {
        amount: number;
        from: string;
        to: string;
    }): Promise<number> {
        if (input.from === input.to) {
            return input.amount;
        };
    
        await this.fetchRatesIfNeeded();
    
        if (Object.keys(this.rates).length === 0) {
            throw new Error("EXCHANGE_RATES_UNAVAILABLE");
        }
    
        const fromRate = this.rates[input.from];
        const toRate = this.rates[input.to];
    
        if (!fromRate || !toRate) {
            throw new Error(`CURRENCY_RATE_NOT_FOUND: ${input.from} or ${input.to}`);
        }
    
        const amountInUSD = input.amount / fromRate;
        const convertedAmount = amountInUSD * toRate;
    
        return Math.round(convertedAmount);
    }
 
    private static async fetchRatesIfNeeded() {
        // Refresh every hour
        if (
            this.lastFetch &&
            Date.now() - this.lastFetch.getTime() < 60 * 60 * 1000
        ) {
            return;
        }
    
        try {
            const axios = require("axios");
            const response = await axios.get(
                "https://api.exchangerate-api.com/v4/latest/USD"
            );
        
            this.rates = response.data.rates;
            this.lastFetch = new Date();
        
            logWithContext("info", "[CurrencyConversion] Rates updated", {
                currencyCount: Object.keys(this.rates).length,
            });
        } catch (error: any) {
            logWithContext("error", "[CurrencyConversion] Rate fetch failed", {
                error: error.message,
                hasExistingRates: Object.keys(this.rates).length > 0,
            });
        
            if (Object.keys(this.rates).length === 0) {
                throw new Error("EXCHANGE_RATE_FETCH_FAILED_NO_FALLBACK");
            }
        }
    }
}