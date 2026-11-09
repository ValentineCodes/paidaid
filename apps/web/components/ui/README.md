# UI primitives (shadcn)

Add interactive primitives with `pnpm dlx shadcn@latest add <name>` from `apps/web`.

- Import from `@/components/ui/*` in feature code.
- Theme tokens live in `app/globals.css` (PaidAid stone scale + `body.app.dark`).
- Figma layout classes (e.g. `.create-modal`) stay until a later cleanup; use `DialogContent` `unstyled` when pairing with them.
- Server GET forms (e.g. marketplace filters) may keep native `<select>` until migrated to client-driven URL state.
