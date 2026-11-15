// URL slug from a display name: "Iced Latte (Large)" -> "iced-latte-large".
// Lowercase ASCII letters, digits and single hyphens; accents are dropped to
// their base letter, anything else is removed.
export function slugify(input: string): string {
    return input
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
