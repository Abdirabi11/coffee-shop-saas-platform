import axios from "axios";

export class CurrencyConversionService {
    private static rates: Record<string, number> = {};
    private static lastFetch: Date | null = null;

    //Convert amount between currencies
    static async convert(input: {
        amount: number;
        from: string;
        to: string;
    }): Promise<number> {
        if (input.from === input.to) {
            return input.amount;
        }

        await this.fetchRatesIfNeeded();

        const fromRate = this.rates[input.from];
        const toRate = this.rates[input.to];

        if (!fromRate || !toRate) {
            throw new Error(`Currency rate not found: ${input.from} or ${input.to}`);
        }

        const amountInUSD = input.amount / fromRate;
        const convertedAmount = amountInUSD * toRate;

        return Math.round(convertedAmount);
    }

    //Fetch latest exchange rates
    private static async fetchRatesIfNeeded() {
        // Refresh rates every hour
        if (
            this.lastFetch &&
            Date.now() - this.lastFetch.getTime() < 60 * 60 * 1000
        ){
            return;
        }

        try {
            const response = await axios.get(
                `https://api.exchangerate-api.com/v4/latest/USD`
            );

            this.rates = response.data.rates;
            this.lastFetch = new Date();

            console.log("[CurrencyConversion] Rates updated");
        } catch (error: any) {
            console.error("[CurrencyConversion] Failed to fetch rates:", error.message);
        }
    }
}