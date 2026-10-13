# Fonts

Source Serif 4 is self-hosted under the SIL Open Font License 1.1
(`source-serif-4/LICENSE.txt`; upstream https://github.com/adobe-fonts/source-serif).
The Latin and Latin Extended variable WOFF2 subsets (weights 200–900, optical size)
come from Fontsource's `@fontsource-variable/source-serif-4` 5.3.1. Linen uses this
one book serif for everything: display, headings, body, labels and buttons.

`public/rer-theme.css` declares the face; the app's root document, the run site and
Base's frames (Lobby, sign-in, outbox) all link that file. No page loads fonts from
another origin.
