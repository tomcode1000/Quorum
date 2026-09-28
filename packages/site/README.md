# Quorum site

The marketing surface. One static HTML file per page, no framework and no build
step — the same discipline as the worker app, and for the same reason: every
dependency is a thing that can break on somebody else's connection.

`index.html` is page **D1** in `docs/UI-DESIGN-BRIEF.txt`, built to the approved
mockup. Its `:root` block is the token set for the whole surface: colour, radius
and shadow are defined once there, in light and dark, and every rule reads them
through `var()`. Build the remaining pages from those tokens rather than
re-deriving values, so the docs and console stay in step when the palette moves.

Run it:

    npm run site        # http://localhost:4173

The hero is built to the approved mockup, whose own size is 1280 x 510. Its
offsets are measured rather than chosen, so changing the shell padding or the
left column width moves the whole composition — adjust them together.

The console is anchored to **both** edges (`left` and a negative `right`) rather
than given a fixed width. At the design width it runs past the right of the
viewport as the comp does; on a wide screen it grows into the space instead of
stranding the panels far right with a gap beside them.

**The page is light only, deliberately.** The comp is white, so it declares
`color-scheme: light` and follows no OS preference. The brand mark's colours are
fixed rather than tokenised for the same reason: it is a black tile with a white
glyph and must stay one wherever it sits.

The two panels are product vignettes. Their internal type is small on purpose —
scaling them up to comfortably readable sizes is exactly what made the first pass
diverge from the design.
