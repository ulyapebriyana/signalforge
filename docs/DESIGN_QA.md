# SignalForge Design & QA Notes

## Concept

- Concept image: `signalforge-concept.png`
- Final desktop render: `signalforge-final-desktop.png`
- Mobile render: `signalforge-mobile.png`
- Generation mode: built-in ImageGen, use case `ui-mockup`
- Prompt direction: “Create a complete 1440×1024 production crypto liquidity-pool screener named SignalForge for Indonesian Meteora DLMM traders, with a quiet topbar, 220px sidebar, open dense pool table, 300px inspector, Safer and Yanman-like presets, dark solar-terminal palette, risk-first hierarchy, and code-native controls. No bento grid, giant cards, purple, decorative crypto coins, 3D, glow, or fake metrics.”

## Fidelity ledger

| Comparison point | Concept evidence | Final render evidence | Resolution |
| --- | --- | --- | --- |
| Application shell | 220px left nav, fluid table, 300px inspector, 72px header | Same three-plane layout at 1440×1024 | Matched; document width remains exactly 1440px |
| Color system | Near-black green-charcoal canvas, lime action, teal health, amber risk | The same dark surfaces and semantic colors are used as CSS tokens | Matched without palette reinterpretation |
| Metric hierarchy | One four-column strip with hairline dividers | One four-column strip, live figures, compact sparkline | Matched; figures are live rather than concept samples |
| Scanner controls | Preset switch, status tabs, four numeric filters, reset | Same controls and order with functional inputs | Matched; control values update with the selected preset |
| Pool table | Open rows, tabular figures, selected lime rail | Same row anatomy, hairline separators, selected lime rail | Matched; row count depends on current live filters |
| Inspector | Score ring, five score factors, momentum trace, risk flags, two actions | Same structure and decision hierarchy | Matched; selected token and scores come from the live scan |
| Motion | Restrained row stagger, pulse, 8px inspector reveal | GSAP transform/opacity motion with reduced-motion fallback | Matched with performance-safe implementation |
| Mobile behavior | Sidebar should collapse and inspector move below table | 390px layout uses an off-canvas sidebar, internal table scroll, inspector below | Verified with no document-level horizontal overflow |

## Copy lock and intentional differences

- The concept used sample pool `SOL / PNORTH`, sample counts, and illustrative figures. The final application shows current Meteora data such as `SOL / JORDAN`; fake sample metrics were not retained.
- `Pool Scanner` is the selected navigation item in the implementation because it is the active screen. The concept visually selected `Overview` while showing the Pool Scanner page.
- Token marks use deterministic code-native initials instead of invented token artwork.
- The concept showed six qualifying rows. The final render showed two at capture time because the Safer thresholds were applied to live data.
- Search, filters, Telegram setup, mobile navigation, API state, and reduced-motion behavior were added as functional requirements without introducing a new component family.

## Verification record

- Unit tests: 4 scoring/risk tests passed.
- Production build: passed.
- Desktop: 1440×1024, zero document overflow, controls/table/inspector visible.
- Mobile: 390×844, zero document overflow; table scroll is internal.
- Browser console after final reload: no new warnings or errors.
- Interactions verified: preset change, Skipped tab, search, Inspect selection, Telegram setup panel, mobile navigation.
