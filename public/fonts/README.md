# Fonts

Every face is self-hosted under the SIL Open Font License 1.1; each folder holds its licence.
`/rer-theme.css` declares them so the theme reader can serve them. `fonts.css` carries Linen's own
tokens and rules; every themed document links it before the theme, as the former import did.
The run site, app and Base frames use the same files. No page loads fonts from another origin.

| Face | Use | Files | Source | Licence |
| --- | --- | --- | --- | --- |
| Source Serif 4 (variable, weight 200–900, optical size) | headings and the wordmark | `source-serif-4/` | Fontsource `@fontsource-variable/source-serif-4` 5.3.1 (upstream https://github.com/adobe-fonts/source-serif) | OFL 1.1, `source-serif-4/LICENSE.txt` |
| Noto Sans (variable, weight 100–900) | body, cards, labels and buttons | `noto-sans/` | Fontsource `@fontsource-variable/noto-sans` 5.3.0 (upstream https://github.com/notofonts/latin-greek-cyrillic) | OFL 1.1, `noto-sans/LICENSE.txt` |
| IBM Plex Mono (400 and 600) | times in logs, serial numbers and commands | `ibm-plex-mono/` | Fontsource `@fontsource/ibm-plex-mono` 5.3.0 (upstream https://github.com/IBM/plex) | OFL 1.1, `ibm-plex-mono/LICENSE.txt` |

Each is the Latin and Latin Extended subset (Plex Mono: Latin only) in WOFF2.
