import { MenuEventService } from "./menu-events.ts";

export class MenuExperimentService{
    static async apply(menu: any,  experiment?: {
        id: string;
        variant: "A" | "B";
    }) {
        if (!experiment) return menu;

        if(experiment.variant === "B"){
            menu.categories.forEach(c => {
                c.products.forEach(p => {
                  p.price = Math.round(p.price * 0.95);
                  p.experiment = experiment.id;
                });
            });
        };

        MenuEventService.emit("MENU_PRICE_CHANGED", {
            storeUuid: menu.storeUuid,
            meta: experiment,
        });
        return menu;
    };
};