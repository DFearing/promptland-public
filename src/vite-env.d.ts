/// <reference types="vite/client" />

// Injected by vite.config.ts `define` at build / dev start. Mirrors the
// current git branch so the topbar can show "v0.1.0 · branch-name".
declare const __GIT_BRANCH__: string

// UTC ISO string stamped at build/dev-start. Settings About tab renders
// it as "built YYYY-MM-DD (N days ago)".
declare const __BUILD_TIME__: string
