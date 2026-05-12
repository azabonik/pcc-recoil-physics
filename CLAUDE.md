# zabs.dev

Astro site for technical writing on firearms internal ballistics, recoil physics, and practical-shooting load development.

## Writing conventions

### Do not use em dashes

**Never use em dashes (—, U+2014) anywhere in this repo.** This includes:

- Article prose (`.mdx`, `.md`)
- Astro component templates, script blocks, and style blocks (`.astro`)
- CSS comments and `content:` values (`.css`)
- Code comments (`.ts`, `.tsx`, `.js`, `.json`)
- Frontmatter (`title`, `description`, `headerSubtitle`, etc.)
- Section heading attributes, table cells, button labels, alt text

When you would reach for an em dash, pick the grammatically correct alternative:

| Em-dash use | Replacement |
|---|---|
| Parenthetical aside in mid-sentence | Comma, or parentheses if the aside is long |
| Introducing a clarification, list, or restatement | Colon |
| Joining two independent clauses for emphasis | Semicolon, or break into two sentences |
| Separator in a label or title (`P1 — Polymer striker`) | Colon (`P1: Polymer striker`) |
| Setting off a value qualifier in a table cell (`123 PF — below Minor`) | Comma (`123 PF, below Minor`) or parentheses (`123 PF (below Minor)`) |

**Do not substitute double-hyphens (`--`)** for em dashes. The replacement must be a real grammatical alternative: comma, colon, semicolon, parentheses, or period.

En dashes (–, U+2013) are fine and should be used for numeric ranges (`3.5–5.5″`, `1,150–1,193 fps`).

Before committing prose changes, verify zero em dashes:

```bash
grep -rn '—' --include='*.md' --include='*.mdx' --include='*.astro' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.css' . | grep -v node_modules | grep -v dist
```
