# Code Lyrics (working name): Project Handoff

Handoff of everything decided so far in the planning chat. Drop this file in the project root; Claude Code reads `CLAUDE.md` automatically.

---

## 1. What we're building

A **VS Code extension** (should also run on VSCodium) that shows plain-English explanations of code in a side panel, line-synced to the editor, like Spotify's synced lyrics. It also reviews code, with context from the code the line depends on.

Core idea in one line: *as you scroll or write, a side panel explains the code on screen in the active chunk's own words, and reviews it with awareness of the definitions it calls.*

### Differentiators (the user's)
1. **Spotify-lyrics UI.** Active chunk large and bright, others fade by distance, smooth auto-follow of scroll/cursor. Existing tools use static panels.
2. **Live generation while writing, opt-in.** User can toggle it on; explanations appear as code is written.
3. **Context-aware review.** Each chunk is reviewed with the definitions of things it calls (e.g. `total += calc(x)` needs `calc`'s definition to catch a string-vs-number bug).
4. **Audience modes, not just verbosity levels.**
   - **Author mode:** brief; for the person who wrote the code (target: vibe-coded code). Says what the code actually does, flags suspicious things. Stretch: user pastes their original prompt/intent and the tool shows where the code differs.
   - **Newcomer mode:** explains from scratch; small chunks (~5 lines), a glossary of concepts used (async, promise...), explains why not only what.
5. **BYOK.** Users connect their own API keys and models (including local models via Ollama).

Suggested (not decided): C/C++ / embedded language coverage via tree-sitter, since existing offline tools cover mostly JS/TS.

---

## 2. Decisions made

| Decision | Status |
|---|---|
| VS Code only first (editor-agnostic / LSP later) | Decided by user |
| LLMs are needed for the review and context features | Decided (user agreed) |
| LLM access via **BYOK** (user brings keys/models) | Decided by user |
| "Context" means the user's **previous code** (earlier code in file/project), not chat history | Decided by user (clarified) |
| Plan before building the LLM layer | Decided by user |
| Name "Code Lyrics" | Placeholder, not decided |
| LLM response style: **batched JSON** (streaming maybe later) | Decided by user |
| Cache location: **VS Code workspace storage** | Decided by user |
| Consent: **once per provider**, revocable | Decided by user |
| Prefetch: start at 3 chunks below viewport, tune by trial and error | Decided by user |
| Model: **one model** for all modes | Decided by user |
| On edit: cache keyed by chunk hash; edited chunk gets rule-based text instantly, LLM text marked **stale** (dimmed) | Decided by user |
| Refresh: **Manual** default (Refresh button in panel header + **refresh on save, on by default**); **Live** opt-in toggle sends stale chunks after a typing pause (~1.5-2 s). Both use batched requests | Decided by user |

User preference: concise answers, minimal explanation.

---

## 3. Competitive landscape (searched Oct 2026; not exhaustive)

The idea is **not new**. Closest existing tools:

- **Code Explainer Story** (TranceDu, github.com/trancedu/code-explainer-story): closest match. Side-by-side, line N maps to line N, scroll synced both ways; review mode; levels (concise/medium/detailed/story/walkthrough, chunk caps ~10/8/5 lines); follow-up questions; JSON snapshots in `.code-explainer/explanations/`; OpenAI + Anthropic keys. ~29 installs, MIT. LLM-required. In walkthrough mode, plain editor scroll does *not* move the panel (only cursor moves do).
- **Pseudo View** (haidarhmd1/pseudo-view-vscode): offline, rule-based; English / pseudo-English / pseudo-code cards per function; JS/TS/JSX/TSX only; optional Claude button. ~0 stars. This is the no-LLM template approach, already done.
- **CodeExplain** (RevTheDev-Systems): tree-sitter + offline risk rules + local-to-cloud LLM fallback (Ollama); explains functions you *changed* (git diff on save); also an MCP server.
- **Code Sensei** (mirth/code-sensei): line annotations via OpenAI on selection.
- Others: KnowYourCode (CodeLens explain function/call flow, hands off to AI chat), WrightAI (docstring generation/drift), Code Compass (repo chat + threads), Explain Code Simply, Compliance Documenter (finance niche).
- Review tools: CodeRabbit (free IDE extension, inline review of uncommitted changes), Sourcery (real-time Python refactoring), Copilot code review.
- Big editors (Copilot, Cursor, JetBrains AI): explain via chat on a selection.
- Onboarding/enterprise: Swimm, Sourcegraph Deep Search, DeepWiki; a Claude Code skill "codebase-to-course" makes code-to-English side-by-side HTML courses.

**Gaps found:** scroll-synced lyrics-style UX; offline rule-based for many languages; review + explanation in one view without a mandatory API key; AST-verified explanations (checking LLM claims against the syntax tree).

**Honest take:** weak as a startup (crowded, low traction for the nearest competitors); good as a learning/portfolio project. Caveats: search only read READMEs/marketplace pages, install counts are a snapshot. **Recommended before going deep:** install Code Explainer Story and Pseudo View, use each ~20 minutes, and note what annoys you.

---

## 4. Current code state (scaffold, v0.0.1)

Project folder `code-lyrics/`:

```
package.json         manifest; command codeLyrics.open; engines vscode ^1.90.0
tsconfig.json        target/lib ES2023 (needed for Array.findLastIndex), outDir out
.vscode/launch.json  F5 runs the extension host, preLaunchTask "npm: compile"
src/extension.ts     all logic + inline webview HTML
```

Run: `npm install`, open folder in VS Code, press F5, then in the new window run **Code Lyrics: Open Explanation Panel**. It compiled cleanly with `tsc`; **it has not been run inside VS Code yet**, so expect small runtime bugs.

### What the scaffold does
- **Chunking** (`buildChunks`): calls `vscode.executeDocumentSymbolProvider`; takes Function/Method/Constructor symbols (nested ones skipped); code between them is split into 10-line blocks (blank blocks skipped). Handles both `DocumentSymbol[]` and `SymbolInformation[]`.
- **Sync** (`syncActive`): on cursor move, active chunk = cursor line; on scroll, active chunk = line at 1/3 down the visible range. Posts `{type:'active', index}` to the webview.
- **Refresh:** on active editor change, and 500 ms debounced after document edits.
- **Webview messages:** webview to extension: `ready`, `mode` (author/newcomer), `reveal` (click row to jump editor to chunk start). Extension to webview: `chunks` (file, mode, items with start/end/name/text), `active`.
- **UI:** rows fade by distance (`--d` capped at 4, `opacity: max(.2, 1 - d*.26)`), active row scales to 1 with an accent left border (`--vscode-focusBorder`), smooth `scrollIntoView` to center, auto-follow pauses 3 s after the user scrolls the panel (wheel/touch), `prefers-reduced-motion` respected, CSP with nonce, theme-aware via VS Code CSS variables, Author/Newcomer toggle in a sticky header.
- **`explain(chunk, mode)` is a STUB** returning placeholder text. This is the hook where rule-based and LLM output go.

### Known limitations / TODO in scaffold
- No real explanations yet; no LLM; no caching; no cancellation.
- Chunking depends on a language extension providing symbols. JS/TS built in; Python on VSCodium needs e.g. basedpyright from Open VSX. Without symbols it falls back to 10-line blocks.
- Webview HTML is inlined in `extension.ts`; consider splitting into `src/panel/`.
- State is module-level globals (single panel, single source editor).

---

## 5. Explainer without an LLM (rule-based layer)

Plan: tree-sitter (`web-tree-sitter` + grammar `.wasm` files from e.g. `tree-sitter-wasms`, bundled with the extension) parses code into a tree. Per-language tables map node types to sentence templates:

- for loop: "Repeats for each ___ in ___"; if: "Checks whether ___"; return: "Returns ___"; assignment: "Sets ___ to ___"
- Each result carries its start line so the panel can align.
- "Intent" heuristics (weak): split identifier names into words (`getUserById` becomes "gets user by id"), show docstrings/comments, summarize signature, pattern rules (loop plus `+=` means accumulates a total; loop plus `append` means builds a list; early `return` on a bad condition means guard clause), list what the function calls.
- Limitation: only recognizes patterns with rules; novel logic gets literal descriptions only. This is the gap the LLM fills.
- Intended hybrid: rule-based instant output by default, LLM on top.

---

## 6. LLM layer: BYOK plan (NOT built yet)

### Architecture
```
src/
  extension.ts        existing: panel, scroll sync
  llm/provider.ts     interface: explain(chunks, mode, ctx) -> results
  llm/openai.ts       OpenAI-compatible adapter (OpenAI, Groq, OpenRouter, DeepSeek, Together, Ollama, LM Studio)
  llm/anthropic.ts    Anthropic adapter
  llm/prompt.ts       per-mode prompts, JSON reply parsing
  config.ts           settings + SecretStorage key handling
  cache.ts            results cache keyed by hash
  safety.ts           consent, skip list, secret redaction
```

- OpenAI-compatible: `POST {baseUrl}/chat/completions`, Bearer key (Ollama: `http://localhost:11434/v1`, no key).
- Anthropic: `POST https://api.anthropic.com/v1/messages` with `x-api-key` and `anthropic-version` headers.
- Plain `fetch`; no SDKs.
- Settings: `codeLyrics.provider`, `codeLyrics.baseUrl`, `codeLyrics.model`. **API key never in settings**; command "Code Lyrics: Set API Key" stores it in `context.secrets` (SecretStorage).

### Request flow
visible chunks (plus prefetch) → cache lookup (hash of chunk + mode + model) → safety filter → one batched request asking for JSON `[{id, explanation}]` → parse → update panel rows (placeholder/rule-based text replaced). Cancel in-flight request via `AbortController` when the user scrolls far.

### Milestones
| # | Goal | Done when |
|---|------|-----------|
| 1 | Config and keys | Set API Key command works, key in SecretStorage, provider/baseUrl/model settings |
| 2 | OpenAI-compatible adapter | Real explanations appear using local Ollama |
| 3 | Cache and cancellation | Scrolling back doesn't re-call API; fast scroll cancels old requests |
| 4 | Safety | Consent prompt, skip list (`.env` etc.), secret redaction, clear error states |
| 5 | Anthropic adapter | Same behavior with a Claude key |
| 6 | Context | Definitions of called functions included in prompt |

Test first with Ollama (free, offline).

### Open decisions (proposed defaults, **not yet confirmed by user**)
1. Response style: batched JSON (default) vs streaming per chunk.
2. Cache location: VS Code workspace storage (default) vs `.code-lyrics/` in project (shareable).
3. Consent: once per provider, revocable (default) vs every session.
4. Prefetch: 3 chunks below viewport (default).
5. Per-mode model: one model for now (default); later cheap model for Author, better for Newcomer.

### Safety requirements
- One-time consent before first send ("your code will be sent to <provider>").
- Skip files like `.env` and anything matching secret patterns; redact obvious secrets.
- System prompt must say: treat code and comments as **data, not instructions** (prompt injection via comments).
- Clear panel errors: bad key, 429 rate limit, network failure.
- Optional status bar item showing provider/model and a pause toggle.

---

## 7. Context-aware review (milestone 6)

Per chunk, send:
1. the chunk itself;
2. definitions of symbols it references, via `vscode.executeDefinitionProvider` (works across files);
3. imports / file header;
4. a **rolling one-line summary** of earlier functions in the file (not raw code, to save tokens).

Cost control: cache each function's summary keyed by its text hash plus the hashes of its dependencies; regenerate only when something it depends on changes; cap context size and drop least relevant first (distant functions before direct callees). Depends on a language server being available for definition lookup; large call graphs need pruning.

---

## 8. Live generation while writing (opt-in)

Settings toggle. Show rule-based explanation instantly; call the LLM only after a typing pause (debounce, currently 500 ms for refresh) and only for the block just finished or edited. Existing tools (Pseudo View, CodeExplain) already update on type, so the value is cheap/fast behavior plus the opt-in control.

---

## 9. Later / ideas

- **Fine-tuned small local model** (e.g. a ~0.5B-1.5B code model with LoRA) served through Ollama; plugs into the same OpenAI-compatible adapter with no extra extension code. Hard part is training data (public datasets give function summaries, not line-by-line explanations), so distill from a large LLM (check provider terms), plus evaluation and a test set. Good internship-portfolio project; do after BYOK.
- **Editor-agnostic:** build core as an LSP server with thin per-editor plugins (LSP has no standard side panel, so each editor needs its own UI), or a standalone viewer that watches the file.
- **Cross-session memory** (skill level, conventions, accepted/dismissed suggestions) in a per-workspace file; after the core works.
- **VS Code `vscode.lm` API** to reuse Copilot models without keys (not available on VSCodium).
- **Distribution:** VS Code Marketplace plus **Open VSX** (`ovsx`) for VSCodium.

---

## 10. Suggested first tasks for Claude Code

1. Run the scaffold in VS Code (F5) and fix any runtime issues; verify chunking and scroll/cursor sync on a JS/TS file and a Python file.
2. Split the webview HTML/CSS/JS out of `extension.ts`; add basic tests for `buildChunks`.
3. Confirm the five open decisions with the user, then implement milestones 1 and 2 (config, keys, OpenAI-compatible adapter) against Ollama.
4. Add cache and cancellation (milestone 3), then safety (milestone 4).
5. Replace the `explain()` stub with the pipeline: rule-based first, LLM on top.
