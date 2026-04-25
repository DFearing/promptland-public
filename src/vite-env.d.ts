/// <reference types="vite/client" />

// Injected by vite.config.ts `define` at build / dev start. Mirrors the
// current git branch so the topbar can show "v0.1.0 · branch-name".
declare const __GIT_BRANCH__: string
