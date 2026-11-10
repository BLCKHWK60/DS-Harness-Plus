# Colour schemes

Plugin `@local/dsh-color-schemes` (dsh 0.2.2-rc.1). Choose the colours of the whole app in **Settings → Colours**.

| Scheme | Look |
| --- | --- |
| **DeepSeek Harness** (default) | The app's own colours, exactly as shipped. Nothing is changed. |
| **MindsHub Cowork** | Deep navy with teal accents and MindsHub's faint dot grid on the main area. The dark colours were sampled from MindsHub Cowork screenshots. |
| **Graphite** | Neutral greys with amber accents. |
| **Forest** | Deep green with mint accents. |
| **Custom** | Your own colours (see below). |

Every scheme has a light and a dark version, and follows **Settings → General → Appearance** (light, dark or system). It works with or without the Cowork sidebar.

## Solid sidebar on the Mac

The Mac desktop app normally draws the sidebar half see-through, so the desktop behind it shows. With a scheme other than DeepSeek Harness, **Solid sidebar on the Mac** (on by default) paints it in the scheme's colour, the way MindsHub looks. The stock scheme never changes it.

## Custom scheme

Paste JSON into the **Custom scheme** box, press **Save custom scheme**, then pick the **Custom** card:

```json
{
  "label": "Plum",
  "dark":  { "--dsw-alias-bg-base": "#1a1020", "--dsw-alias-state-business-primary": "#c58af9" },
  "light": { "--dsw-alias-state-business-primary": "#7b3fb8" },
  "opaqueMacSidebar": true,
  "pattern": "dots"
}
```

Keys are the app's colour names. The useful ones are:

| Name | What it colours |
| --- | --- |
| `--dsw-alias-bg-base` | main background |
| `--dsw-specific-sidebar-fill` | sidebar |
| `--dsw-alias-bg-layer-1` … `layer-3` | raised surfaces |
| `--dsw-specific-input-major` | chat box |
| `--dsw-specific-bubble` | your message bubbles |
| `--dsw-alias-label-primary`, `--dsw-alias-label-secondary` | text |
| `--dsw-alias-border-l1` … `l4` | borders |
| `--dsw-alias-state-business-primary` | accent |
| `--dsw-alias-brand-primary` | primary buttons |

Names you leave out keep the app's value. `"pattern": "dots"` adds the dot grid; set its colour with `"--dsh-cs-dot"` in both `light` and `dark`. Values must be colours: `#hex`, `rgb()`, `hsl()`, `oklch()`, `color-mix()`, `var()` or `transparent`. Anything else is refused with a message, so nothing but colours can get in.

## How it works

The browser half lays the scheme's colours over the app's light or dark palette with the app's own theme service (`theme.overrideTokens`). The host half only stores the choice as settings (`scheme`, `custom`, `opaqueMacSidebar`, all editable live). Each window also remembers the last choice locally, so it starts in the right colours. Picking DeepSeek Harness removes every override.

```yaml
- id: color-schemes
  config:
    scheme: mindshub        # stock | mindshub | graphite | forest | custom
    opaqueMacSidebar: true
```

## Checked

In the throwaway web profile, through the app's browser view:

- **Each scheme in dark:** MindsHub Cowork, Graphite and Forest each recoloured the background, sidebar, chat box, message bubble, borders and accent (send button, selected view tab).
- **MindsHub Cowork in light:** light background with a teal accent and a teal-tinted bubble.
- **Back to DeepSeek Harness:** removed every override (0 left), so it is exactly the app as shipped.
- **Restart:** the choice survived it.
- **Custom:** a valid custom scheme applied. A value that tried to sneak in CSS was refused.

**Not checked:**

- the Mac desktop app, including the solid-sidebar rule, which depends on the app's internal class name `…_sidebarCol`
- every screen of the app; some rarely seen surfaces may keep stock colours. Tell me which and they can be added.
