# Repository Guidelines

## Project Structure & Module Organization
- Source in `src/` (TypeScript): platform and accessories (`HomebridgePluginDweloPlatform.ts`, `DweloAPI.ts`, `DweloLockAccessory.ts`, `DweloSwitchAccessory.ts`, `settings.ts`, `index.ts`).
- Build output in `dist/` (generated). Do not edit.
- Config schema in `config.schema.json` (keep in sync with `src/settings.ts`).
- Tooling: `.eslintrc`, `tsconfig.json`, `nodemon.json`.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm run build` — clean and compile TypeScript to `dist/`.
- `npm run lint` — lint `src/**.ts` with ESLint; no warnings allowed in CI.
- `npm run watch` — build, `npm link`, and run Homebridge via nodemon for live reload.
- Local run: `npm link` then start Homebridge with `homebridge -D` (or via `npm run watch`).

## Coding Style & Naming Conventions
- TypeScript, strict mode. Indent 2 spaces; max line length ~140.
- Quotes: single; use semicolons; always use braces; prefer arrow functions.
- Avoid `console.*`; use Homebridge logger passed to platform/accessories.
- Filenames: `PascalCase` for classes (`DweloLockAccessory.ts`), `camelCase` for modules as applicable.
- Keep `PLATFORM_NAME` and `PLUGIN_NAME` in `src/settings.ts` consistent with `config.schema.json` `pluginAlias`.

## Testing Guidelines
- No unit test suite is configured. Validate behavior by running Homebridge in debug (`homebridge -D`) and exercising devices.
- If adding tests, prefer Jest with `*.spec.ts` under `src/` (note: `tsconfig.json` excludes specs from build).

## Commit & Pull Request Guidelines
- Commits: short, present-tense, imperative (e.g., "fix lock poll config"). Keep under ~72 chars; group related changes.
- PRs: include a clear description, before/after behavior, logs/snippets if relevant, and link issues (e.g., `Fixes #123`).
- Update `config.schema.json` and README when changing configuration or user-facing behavior.

## Security & Configuration Tips
- Do not commit real Dwelo credentials. Provide examples using placeholders.
- Respect rate limits; avoid excessive polling. Make intervals configurable (`lockPollMs`).

## Agent-Specific Instructions
- Do not modify `dist/`; change `src/` and rebuild.
- Keep schema and settings in sync; ensure platform registration in `src/index.ts` remains unchanged unless refactoring the platform name.
- Follow ESLint rules; run `npm run lint` before publishing.
