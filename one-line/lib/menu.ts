import type { MenuItem } from "./types";

export const MENU: MenuItem[] = [
  { id: "chicken_taco", name: "Chicken Taco", station: "grill", basePrepMin: 5, holdMin: 6, batchable: true, holdPhrase: "tacos would get cold" },
  { id: "carnitas_taco", name: "Carnitas Taco", station: "grill", basePrepMin: 5, holdMin: 6, batchable: true, holdPhrase: "tacos would get cold" },
  { id: "quesadilla", name: "Quesadilla", station: "grill", basePrepMin: 6, holdMin: 5, batchable: true, holdPhrase: "quesadillas would go limp" },
  { id: "burrito", name: "Burrito", station: "assembly", basePrepMin: 6, holdMin: 8, batchable: false, holdPhrase: "the burrito would get soggy" },
  { id: "fries", name: "Chile-Lime Fries", plural: "Chile-Lime Fries", station: "fryer", basePrepMin: 4, holdMin: 3, batchable: true, holdPhrase: "fries would go soggy" },
  { id: "churros", name: "Churros", plural: "Churros", station: "fryer", basePrepMin: 4, holdMin: 5, batchable: true, holdPhrase: "churros would go stale" },
  { id: "chips_guac", name: "Chips & Guac", plural: "Chips & Guac", station: "cold", basePrepMin: 2, holdMin: 15, batchable: true, holdPhrase: "the guac would brown" },
  { id: "side_salad", name: "Side Salad", station: "cold", basePrepMin: 2, holdMin: 10, batchable: false, holdPhrase: "the salad would wilt" },
  { id: "horchata", name: "Horchata", station: "cold", basePrepMin: 1, holdMin: 20, batchable: false, holdPhrase: "the ice would melt" },
];

export const MENU_BY_ID: Record<string, MenuItem> = Object.fromEntries(MENU.map((m) => [m.id, m]));

export function menuIndex(menu: MenuItem[]): Record<string, MenuItem> {
  return Object.fromEntries(menu.map((m) => [m.id, m]));
}

/** "1 Chicken Taco" / "5 Chicken Tacos" */
export function itemLabel(item: MenuItem | undefined, qty: number): string {
  if (!item) return `${qty}`;
  return `${qty} ${qty === 1 ? item.name : (item.plural ?? `${item.name}s`)}`;
}

export const pluralName = (item: MenuItem | undefined) => (item ? (item.plural ?? `${item.name}s`) : "items");
