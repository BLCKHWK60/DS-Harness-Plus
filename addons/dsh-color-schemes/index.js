/**
 * Host half of the colour schemes add-on: it only carries the choice as settings (volatile, so the
 * Settings page writes it and every open window follows). The colours are applied by the browser
 * half through the app's theme service (`theme.overrideTokens`), over the light or dark palette.
 */
import z from '@deepseek-ai/schemastery';

export const name = 'color-schemes';

export const Config = z.object({
  /** Scheme id: `stock` (the app's own colours), `mindshub`, `graphite`, `forest` or `custom`. */
  scheme: z.string().default('stock').volatile(),
  /**
   * Your own scheme as JSON, used when `scheme` is `custom`:
   * `{ "label": "...", "dark": { "--dsw-alias-bg-base": "#101010", ... }, "light": { ... }, "opaqueMacSidebar": true }`.
   * Tokens you leave out keep the app's own value.
   */
  custom: z.string().default('').volatile(),
  /** On the Mac desktop app, paint the sidebar solid in the scheme's colour instead of see-through. */
  opaqueMacSidebar: z.boolean().default(true).volatile(),
});

export function apply() {}
