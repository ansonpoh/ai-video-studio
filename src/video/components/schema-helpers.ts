import type { InteractivitySchema } from "remotion";

/** Builds an Interactivity enum field from a readonly list of string options. */
export const enumField = <T extends readonly string[]>(options: T, def: T[number], description: string) => ({
  type: "enum" as const,
  default: def as string,
  description,
  keyframable: false,
  variants: Object.fromEntries(options.map((o) => [o, {}])) as Record<string, InteractivitySchema>,
});

export const numberField = (def: number, description: string, opts: { min?: number; max?: number; step?: number } = {}) => ({
  type: "number" as const,
  default: def,
  description,
  hiddenFromList: false,
  ...opts,
});

export const stringField = (def: string, description: string) => ({ type: "string" as const, default: def, description });
export const colorField = (def: string, description: string) => ({ type: "color" as const, default: def, description });
export const boolField = (def: boolean, description: string) => ({ type: "boolean" as const, default: def, description });
