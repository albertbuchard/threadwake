# Themes and the implemented `Codex` palette

## Current status

Threadwake has a first-class theme registry with `System`, `Deep Orbit`, and `Codex` preferences. `System` resolves to `Deep Orbit` for a dark operating-system preference and to `Codex` otherwise. A URL `theme` parameter takes precedence over the stored `threadwake.theme.v1` preference, and invalid values fall back deterministically.

`Codex` is an independent Threadwake theme. It is not an official OpenAI theme or design system. It uses no OpenAI marks or proprietary interface assets.

## Exact `Codex` interface tokens

Components consume semantic CSS custom properties. The current `Codex` light theme uses these exact values:

| Semantic token | Value | Intended use |
| --- | --- | --- |
| `--theme-root` | `#ECEEEC` | Page root |
| `--theme-canvas` | `#F3F4F2` | Main canvas |
| `--theme-canvas-raised` | `#F8F9F7` | Raised canvas |
| `--theme-canvas-strong` | `#FFFFFF` | Strongest surface |
| `--theme-accent-deep` | `#274D69` | Deep restrained blue |
| `--theme-accent-mid` | `#315F82` | Primary restrained blue |
| `--theme-accent-soft-solid` | `#527B98` | Softer blue accent |
| `--theme-ring` | `#9BA2A9` | Neutral graph ring |
| `--theme-ring-muted` | `rgba(69, 78, 87, 0.18)` | Muted graph ring |
| `--theme-text-primary` | `#171A1E` | Primary text |
| `--theme-text-secondary` | `#363D44` | Secondary text |
| `--theme-text-muted` | `#59626B` | Muted text |
| `--theme-accent` | `#315F82` | Primary actions and links |
| `--theme-accent-muted` | `rgba(49, 95, 130, 0.11)` | Selected or informative background |
| `--theme-accent-hover` | `#274D69` | Hover accent |
| `--theme-action-ink` | `#FFFFFF` | Text on blue actions |
| `--theme-success` | `#426746` | Success text or icon |
| `--theme-success-muted` | `rgba(66, 103, 70, 0.12)` | Success background |
| `--theme-warning` | `#805913` | Warning text or icon |
| `--theme-warning-muted` | `rgba(128, 89, 19, 0.12)` | Warning background |
| `--theme-danger` | `#944743` | Error text or icon |
| `--theme-danger-muted` | `rgba(148, 71, 67, 0.11)` | Error background |
| `--theme-panel` | `rgba(250, 250, 249, 0.96)` | Panel |
| `--theme-panel-strong` | `rgba(255, 255, 255, 0.985)` | Strong panel |
| `--theme-surface` | `rgba(224, 227, 224, 0.74)` | Neutral surface |
| `--theme-surface-hover` | `rgba(211, 216, 213, 0.9)` | Hovered surface |
| `--theme-border` | `rgba(31, 38, 44, 0.17)` | Ordinary border |
| `--theme-border-strong` | `rgba(31, 38, 44, 0.31)` | Active border |
| `--theme-focus` | `#1E638D` | Keyboard focus ring |
| `--theme-topbar` | `rgba(250, 251, 249, 0.98)` | Top bar |
| `--theme-control` | `rgba(233, 235, 232, 0.92)` | Control background |
| `--theme-control-subtle` | `rgba(226, 229, 226, 0.82)` | Subtle control background |
| `--theme-control-selected` | `rgba(49, 95, 130, 0.14)` | Selected control |
| `--theme-field` | `rgba(239, 241, 238, 0.94)` | Input field |
| `--theme-field-focus` | `rgba(255, 255, 255, 0.98)` | Focused field |
| `--theme-card` | `rgba(255, 255, 255, 0.92)` | Card |
| `--theme-card-hover` | `rgba(244, 246, 243, 0.98)` | Hovered card |
| `--theme-footer` | `rgba(250, 250, 249, 0.98)` | Footer |
| `--theme-scrim` | `rgba(24, 29, 34, 0.36)` | Dialog scrim |
| `--theme-shadow` | `0 24px 70px rgba(25, 31, 36, 0.16)` | Main elevation |
| `--theme-shadow-subtle` | `0 12px 34px rgba(25, 31, 36, 0.09)` | Subtle elevation |

The palette is dominated by white and neutral gray. Blue is limited to selection, focus, links, graph emphasis, and primary actions.

## Exact `Codex` graph palette

The PixiJS temporal graph receives its own semantic values from the same theme selection:

| Graph role | Value |
| --- | --- |
| background | `#F2F2F0` |
| field | `#E2E3E1` |
| inner field and ink | `#FAFAF9` |
| ring | `#AEB3B9` |
| ring text | `#4E555D` |
| relation | `#737B84` |
| relation emphasis and primary | `#315F82` |
| selected label | `#171A1E` |
| decision | `#3F6F92` |
| failed | `#944743` |
| planned | `#426746` |
| blocked | `#805913` |
| selection | `#245F88` |
| muted text | `#363D44` |
| group colors | `#274D69`, `#4B3F60`, `#30553E`, `#67452F`, `#3D5367` |

## Contrast baseline

Calculated solid-color ratios against white include:

| Foreground | Ratio |
| --- | ---: |
| primary text `#171A1E` | 17.46:1 |
| secondary text `#363D44` | 11.01:1 |
| muted text `#59626B` | 6.21:1 |
| primary accent `#315F82` | 6.80:1 |
| focus `#1E638D` | 6.51:1 |
| success `#426746` | 6.44:1 |
| warning `#805913` | 6.26:1 |
| danger `#944743` | 6.48:1 |

These calculations are a palette baseline. Complete acceptance must also test actual font size, weight, opacity, composited surfaces, canvas marks, disabled states, focus indicators, and meaningful non-text controls. The minimum target remains 4.5:1 for ordinary text, 3:1 for large text, and 3:1 for meaningful non-text marks and focus indicators where required.

## Interaction and persistence

- Theme selection is reachable by keyboard and touch.
- Focus remains visible.
- Hover is not the only way to reveal an action.
- Reduced-motion preference is respected.
- Selected, rejected, blocked, successful, warning, and error states include non-color cues.
- Theme switching does not change canonical identity, graph semantics, lifecycle, outcome, or layout geometry.
- An unknown preference falls back safely, and startup resolves the theme before the application mounts.

## Responsive and occlusion evidence

Live checks have covered 390 by 844, 390 by 600, and 320 by 568 viewports, a deterministic 2-times text-scale fixture, and a keyboard-safe-area fixture. These checks found the node-creation confirmation action visible and reachable in the sampled states.

For each required control, acceptance checks the complete border box and 9 hit-test positions: the center, 4 inset corners, and 4 inset edge midpoints. Every `elementsFromPoint` or `elementFromPoint` result must resolve to the control or an owned descendant. Any unexpected occluder fails.

True browser 200% zoom remains unproved. The deterministic text-scale fixture is supporting evidence, not a substitute. Desktop and mobile `Codex` screenshots are persisted, but they do not replace border-box and hit-test receipts.
