# TermAgent: Terminal-First Agentic AI for Offensive Security

Terminal-only AI agent. Offensive sec focus. Multi-LLM. Plugin-native. No bloat.

---

## Open Questions

> [!IMPORTANT]
> **Q1: Project name?** Spec says "Antigravity" or keep generic? Need name for binary + branding.

> [!IMPORTANT]
> **Q2: Ink vs Blessed?** Ink (React + hooks, better ecosystem) vs Blessed (raw terminal, less deps). Recommend **Ink** — active, supports streaming, React mental model.

> [!IMPORTANT]
> **Q3: Which LLM providers to wire first?** Full list is 11 providers. Phase 1: OpenAI + Gemini + Ollama + OpenRouter (covers >95% use cases). Others in Phase 2.

> [!IMPORTANT]
> **Q4: Dangerous tool execution?** Offensive tools (nmap, sqlmap, etc.) run by default or require explicit `/build` mode? Recommend: only in `build` mode + explicit approval prompt.

> [!IMPORTANT]
> **Q5: Memory backend?** SQLite-only (per spec) or also support file-based JSON for portability? Spec says SQLite — sticking with it.

---

## Proposed Changes

### Phase 1 — Scaffold & Core (Days 1-2)

#### [NEW] Project root files

- `package.json` — Node 24+, ESM, TypeScript, all deps
- `tsconfig.json` — strict, ESNext, Node bundler mode
- `biome.json` — linting (replaces ESLint+Prettier, faster)
- `README.md` — quick start

---

### Core Infrastructure

#### [NEW] `src/config/index.ts`
Central config loader. Reads `~/.termagent/config.json` (or TOML). Merges env vars. Exposes typed `Config` object. Keys: `defaultModel`, `temperature`, `maxTokens`, `streaming`, `theme`, `apiKeys`, `toolPermissions`, `contextThreshold`, `retryCount`.

#### [NEW] `src/config/schema.ts`
Zod schema for config validation. Errors shown on startup with fix hint.

#### [NEW] `src/config/keys.ts`
API key manager. Reads from config + env. Never logs. Supports encrypted storage (AES-256 via `node:crypto`).

---

### Database / Sessions

#### [NEW] `src/sessions/db.ts`
`better-sqlite3` setup. WAL mode. Auto-migrate. Tables:
- `conversations(id, title, model, system_prompt, created_at, updated_at, metadata)`
- `messages(id, conversation_id, role, content, tokens_in, tokens_out, cost, created_at)`
- `memories(id, type, content, pinned, workspace, created_at)`
- `tool_logs(id, conversation_id, tool, args, output, status, duration_ms, created_at)`
- `api_logs(id, provider, model, tokens_in, tokens_out, cost, latency_ms, created_at)`

#### [NEW] `src/sessions/manager.ts`
Session CRUD. `create()`, `load()`, `list()`, `rename()`, `delete()`, `addMessage()`, `getHistory()`, `exportMarkdown()`, `exportJSON()`.

---

### Model Layer

#### [NEW] `src/models/types.ts`
```typescript
interface ModelAdapter {
  generate(messages: Message[], opts: GenOptions): Promise<Response>
  stream(messages: Message[], opts: GenOptions): AsyncGenerator<Chunk>
  countTokens(messages: Message[]): Promise<number>
  supportsVision(): boolean
  supportsReasoning(): boolean
  supportsTools(): boolean
  supportsImages(): boolean
  getContextLength(): number
  estimateCost(inputTokens: number, outputTokens: number): number
}
```

#### [NEW] `src/models/adapters/openai.ts` — OpenAI + Azure + Codex
#### [NEW] `src/models/adapters/gemini.ts` — Gemini (all variants)
#### [NEW] `src/models/adapters/claude.ts` — Anthropic Claude
#### [NEW] `src/models/adapters/ollama.ts` — Ollama local
#### [NEW] `src/models/adapters/openrouter.ts` — OpenRouter (passes through to 200+ models)
#### [NEW] `src/models/adapters/nvidia.ts` — NVIDIA NIM
#### [NEW] `src/models/adapters/lmstudio.ts` — LM Studio (OpenAI-compat)
#### [NEW] `src/models/adapters/vllm.ts` — vLLM (OpenAI-compat)

#### [NEW] `src/models/manager.ts`
Central model manager. Features:
- Switch model live: `setModel(id)`
- Auto-detect provider from model string
- Retry with exponential backoff (uses `p-retry`)
- Rate limit handling (429 → wait → retry)
- Provider fallback chain
- Context length enforcement
- Cost tracking per session

---

### Tool System

#### [NEW] `src/tools/types.ts`
```typescript
interface Tool {
  name: string
  description: string
  permissions: PermissionLevel  // safe|readonly|interactive|dangerous
  schema: ZodSchema
  run(args: Record<string, unknown>): Promise<ToolOutput>
  enabled: boolean
}
```

#### [NEW] `src/tools/registry.ts`
Auto-discovers tools from `src/tools/builtin/` + `~/.termagent/plugins/tools/`. Validates schema. Registers by name. Fast O(1) lookup.

#### [NEW] `src/tools/executor.ts`
XML tag parser: `<tool_name>args</tool_name>`. Extracts tool calls from model output. Confirms dangerous ops. Returns `<output>...</output>`. Supports parallel execution where safe.

#### [NEW] `src/tools/permissions.ts`
Permission enforcement. Safe mode (read-only subset). Allowlist/denylist per config. Audit log every execution.

#### Built-in tools (each in `src/tools/builtin/`):

**System:** `terminal.ts`, `cat.ts`, `find.ts`, `grep.ts`, `ripgrep.ts`, `sed.ts`, `awk.ts`, `jq.ts`

**Dev:** `git.ts`, `python.ts`, `docker.ts`, `kubectl.ts`

**Network/Recon:** `curl.ts`, `ping.ts`, `traceroute.ts`, `dig.ts`, `nslookup.ts`, `whois.ts`, `openssl.ts`

**Offensive:** `nmap.ts`, `masscan.ts`, `httpx.ts`, `nuclei.ts`, `katana.ts`, `subfinder.ts`, `amass.ts`, `assetfinder.ts`, `gau.ts`, `waybackurls.ts`, `dnsx.ts`, `shodan.ts`, `ffuf.ts`, `sqlmap.ts`, `feroxbuster.ts`, `dirsearch.ts`

**Scripting:** `custom_script.ts` (runs arbitrary user scripts from `~/.termagent/scripts/`)

---

### Context Manager

#### [NEW] `src/context/manager.ts`
Tracks token budget. Warns at 80/90/95%. Auto-summarizes old messages when >85% full (uses model's own summarization). Never silently drops messages. Emits events consumed by UI status bar.

#### [NEW] `src/context/summarizer.ts`
Condenses old conversation chunks into summaries. Stores summaries in DB. Injects as `[SUMMARY]` block at top of context.

---

### Memory System

#### [NEW] `src/memory/store.ts`
CRUD for memories. Types: `short_term`, `summary`, `pinned`, `workspace`, `session`, `long_term`. SQLite-backed. Full-text search via `fts5`.

#### [NEW] `src/memory/search.ts`
Semantic search fallback using keyword + FTS5. Optional: vector embeddings via Ollama `nomic-embed-text` (zero external deps).

---

### Planner & Builder

#### [NEW] `src/planner/index.ts`
Plan Mode. No tool execution. Builds structured plan:
- Objectives
- Recon steps
- Testing plan
- Attack paths
- Risk analysis
- Priority queue

Outputs Markdown. Prompts injected from `skills/` context.

#### [NEW] `src/builder/index.ts`
Build Mode. Full tool access. Agentic loop:
1. Think
2. Plan next action
3. Call tool (with approval if dangerous)
4. Observe output
5. Repeat until done or user cancels

Supports checkpointing (saves state to DB).

---

### Skills System

#### [NEW] `src/skills/loader.ts`
Loads `.md` files from `src/skills/builtin/` + `~/.termagent/skills/`. Parses YAML frontmatter for metadata. Concatenates into system prompt extension.

#### [NEW] `src/skills/builtin/`
- `bug-bounty.md` — methodology, tools, workflow
- `web.md` — OWASP top 10, XSS/SQLi/SSRF/XXE
- `api.md` — REST/GraphQL/gRPC testing
- `android.md` — APK analysis, frida, objection
- `cloud.md` — AWS/GCP/Azure misconfig
- `reverse.md` — binary analysis, ghidra, radare2
- `osint.md` — passive recon, OSINT framework
- `malware.md` — static/dynamic analysis
- `forensics.md` — memory/disk forensics
- `dev.md` — general software development

---

### CLI Layer

#### [NEW] `src/cli/repl.ts`
Main REPL loop. Reads input (via `readline` or Ink TextInput). Parses `/commands`. Routes to handlers. Streams AI response to UI. Handles Ctrl+C gracefully.

#### [NEW] `src/cli/commands/` (one file per command)
`help.ts`, `model.ts`, `models.ts`, `new_chat.ts`, `chat.ts`, `clear.ts`, `context.ts`, `history.ts`, `export.ts`, `import.ts`, `save.ts`, `skills.ts`, `tools.ts`, `system.ts`, `config.ts`, `theme.ts`, `plan.ts`, `build.ts`, `reset.ts`, `version.ts`, `exit.ts`, `memory.ts`, `pin.ts`

#### [NEW] `src/cli/autocomplete.ts`
Tab-completion for all commands + model names + skill names + tool names.

---

### UI Layer

#### [NEW] `src/ui/App.tsx` (Ink root)
Main Ink app. Renders: StatusBar + ChatHistory + InputArea.

#### [NEW] `src/ui/StatusBar.tsx`
Single line. Shows: `[model] [chat] [skill] [mode] [tokens X/Y Z%] [cost $X.XX] [time]`

#### [NEW] `src/ui/ChatHistory.tsx`
Scrollable message list. Renders Markdown via `markdown-it` + `cli-highlight`. Syntax-highlighted code blocks. Shows tool events inline.

#### [NEW] `src/ui/InputArea.tsx`
Multi-line input. Command hints. Autocomplete dropdown.

#### [NEW] `src/ui/ProgressEvent.tsx`
Streaming status: "Thinking..." / "Calling tool..." / "Completed." — with spinners.

#### [NEW] `src/ui/themes/`
`dark.ts`, `light.ts`, `minimal.ts`, `cyberpunk.ts`, `monochrome.ts`. Each exports color palette consumed by all components.

---

### Markdown Renderer

#### [NEW] `src/ui/markdown.ts`
`markdown-it` instance. Plugins: tables, task lists, linkify. Output: ANSI-colored terminal string. Code blocks via `cli-highlight`. Heading levels = bold + color. Blockquotes = dim + `│` prefix. Copyable code blocks (shows shortcut hint).

---

### Logging

#### [NEW] `src/utils/logger.ts`
Winston-based logger. DB sink (tool/API/error logs to SQLite). File sink at `~/.termagent/logs/`. Structured JSON. Never leaks API keys (redacts before log).

---

### Plugin System

#### [NEW] `src/plugins/loader.ts`
Loads from `~/.termagent/plugins/`. Each plugin = folder with `plugin.json` + optional `tools/`, `skills/`, `models/`, `themes/`, `commands/`. Hot-loaded at startup. No core modification needed.

---

### Entry Point

#### [NEW] `src/index.ts`
Bootstrap: load config → init DB → load plugins → load skills → init model → start REPL.

#### [NEW] `bin/termagent`
Shebang wrapper. `package.json` `bin` field points here.

---

## Directory Structure

```
d:\codex\AI Agents\
├── package.json
├── tsconfig.json
├── biome.json
├── README.md
├── bin/
│   └── termagent
└── src/
    ├── index.ts
    ├── cli/
    │   ├── repl.ts
    │   ├── autocomplete.ts
    │   └── commands/
    ├── models/
    │   ├── types.ts
    │   ├── manager.ts
    │   └── adapters/
    ├── tools/
    │   ├── types.ts
    │   ├── registry.ts
    │   ├── executor.ts
    │   ├── permissions.ts
    │   └── builtin/
    ├── sessions/
    │   ├── db.ts
    │   └── manager.ts
    ├── skills/
    │   ├── loader.ts
    │   └── builtin/
    ├── planner/
    │   └── index.ts
    ├── builder/
    │   └── index.ts
    ├── memory/
    │   ├── store.ts
    │   └── search.ts
    ├── context/
    │   ├── manager.ts
    │   └── summarizer.ts
    ├── config/
    │   ├── index.ts
    │   ├── schema.ts
    │   └── keys.ts
    ├── ui/
    │   ├── App.tsx
    │   ├── StatusBar.tsx
    │   ├── ChatHistory.tsx
    │   ├── InputArea.tsx
    │   ├── ProgressEvent.tsx
    │   ├── markdown.ts
    │   └── themes/
    ├── plugins/
    │   └── loader.ts
    └── utils/
        └── logger.ts
```

---

## Verification Plan

### Automated Tests
```bash
npx tsx --test src/**/*.test.ts
```
- Model adapter: mock HTTP, verify `generate()` + `stream()` + `countTokens()`
- Tool executor: XML parse correctness, permission block
- Session manager: CRUD round-trip
- Context manager: summarization trigger at 85%
- Config: schema validation reject/accept

### Manual Verification
1. `npx termagent` — starts, shows status bar
2. `/model gemini-2.5-pro` — switches live
3. Ask question — streams response with Markdown
4. `/tools` — lists all tools
5. `/plan` mode — no tools fire
6. `/build` mode — runs terminal tool with approval
7. `/skills bug-bounty` — system prompt changes
8. `/chat list` — shows sessions
9. `/export markdown` — saves file
10. Ctrl+C — graceful shutdown, session saved

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| UI framework | Ink | Active, React hooks, streaming-friendly |
| DB | better-sqlite3 | Sync API, fast, zero setup |
| HTTP | undici | Native fetch-like, fast, Node 24 built-in |
| Tool protocol | XML tags | Provider-agnostic, human-readable |
| Linter | Biome | 10x faster than ESLint, single binary |
| Config format | JSON | Universal, easy to programmatically edit |
| Package manager | pnpm | Fastest, strict deps |
| Build | tsx (no build step) | Dev speed; `tsup` for distribution |

---

## Phase Breakdown

| Phase | Scope | ETA |
|-------|-------|-----|
| 1 | Scaffold + Config + DB + 2 models (OpenAI+Gemini) + Basic REPL | Day 1-2 |
| 2 | All model adapters + Context manager + Memory | Day 3 |
| 3 | Tool system + 10 core tools + XML executor | Day 4 |
| 4 | Ink UI + Markdown renderer + Status bar | Day 5 |
| 5 | Planner + Builder + Skills (5 skills) | Day 6 |
| 6 | All remaining tools + Plugin system | Day 7 |
| 7 | Remaining skills + Export + Search + Docs | Day 8 |
