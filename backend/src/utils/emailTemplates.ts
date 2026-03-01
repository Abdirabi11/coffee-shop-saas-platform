import fs from "fs";
import path from "path";
import Handlebars from "handlebars";

// Register Handlebars helpers
Handlebars.registerHelper("formatDate", (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
});

Handlebars.registerHelper("formatCurrency", (amount: number) => {
    return `$${(amount / 100).toFixed(2)}`;
});

Handlebars.registerHelper("eq", (a: any, b: any) => a === b);

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

//Render email template
export function renderEmailTemplate(templateName: string, data: any): string {
    try {
        // Check cache
        if (templateCache.has(templateName)) {
            const template = templateCache.get(templateName)!;
            return template(data);
        }

        // Load template
        const templatePath = path.join(
            process.cwd(),
            "templates",
            "emails",
            `${templateName}.hbs`
        );

        const templateSource = fs.readFileSync(templatePath, "utf-8");

        // Compile template
        const template = Handlebars.compile(templateSource);

        // Cache template
        templateCache.set(templateName, template);

        // Render
        return template(data);

    } catch (error: any) {
        console.error(`Failed to render email template: ${templateName}`, error);
        
        // Fallback to basic template
        return `
            <html>
                <body>
                <h1>Email Content</h1>
                <pre>${JSON.stringify(data, null, 2)}</pre>
                </body>
            </html>
        `;
    }
}
