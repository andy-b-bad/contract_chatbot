# Repository Guidelines

## Project Structure & Module Organization
This is a small Next.js 16 App Router project. Application code lives under `src/app/`.

- `src/app/page.tsx`: main UI entry point
- `src/app/layout.tsx`: shared app shell
- `src/app/globals.css`: global styles
- `src/app/api/chat/route.ts`: chat API route and retrieval logic
- `public/`: static assets such as SVGs
- Root config: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`

There is currently no dedicated `test/` or `__tests__/` directory.

## Build, Test, and Development Commands
- `npm run dev`: start the local Next.js dev server
- `npm run build`: create the production build and run TypeScript checks
- `npm run start`: serve the production build
- `npm run lint`: run ESLint with the Next.js config

Use `npm run build` before submitting changes that touch `src/app/api/chat/route.ts` or other typed runtime code.

## Coding Style & Naming Conventions
Use TypeScript and React function components. Follow the existing style in the repo:

- 2-space indentation
- `camelCase` for variables and functions
- `PascalCase` for React components and type-like entities
- `SCREAMING_SNAKE_CASE` for shared constants such as prompts and allow-lists

Prefer small, local helpers over broad refactors. Keep API-route behavior explicit and log messages stable unless a change requires otherwise. Use ESLint as the baseline style guard.

## Testing Guidelines
There is no formal test framework configured yet. For now:

- run `npm run lint`
- run `npm run build`
- manually smoke-test `/api/chat` after route changes

When adding tests later, place them beside the feature or under a top-level `tests/` folder, and name files `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects, for example:

- `Fix chat route tool tracing types`
- `Refactor chat route to PageIndex-led MCP retrieval`

Keep commits focused and descriptive. PRs should include:

- a short summary of the change
- affected paths or features
- validation performed (`npm run build`, smoke tests, lint)
- screenshots or SSE/log excerpts when UI or streaming behavior changes

## Security & Configuration Tips
Secrets should stay in local environment files such as `.env.local`. Do not commit API keys. Changes to `src/app/api/chat/route.ts` should preserve document-grounded behavior and avoid exposing raw credentials or unnecessary tool output.
