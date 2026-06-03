# AGENTS.md - Instructions for AI Agents Working on agodesk

## Critical Safety Rule: Never Destroy User Working Tree or Uncommitted Work (Learned the Hard Way)

**This is the most important rule in this file. Violating it has caused irreversible loss of days of user development work.**

### The Incident (Reconstructed from Chat History)

During a project audit ("prüfe das projekt auf fehler und probleme"):

1. The repository was in this state:
   - A minimal "base" commit history (core Tauri + Svelte chat + basic pairing/settings/TLS/WS + some core components/services).
   - **Dozens of untracked files (`??` in `git status`)** containing the user's actual developed features:
     - Full speech/Gemini Live system (gemini-live.ts + tests, speech-audio*, speech-delivery*, speech-flow*, speech-tool-router*, speech-visualizer-audio*, speech-tools, etc.)
     - Persona system (persona-asset-fetch, persona-flow + tests)
     - Complete i18n (loader.ts, store, translate, locales, all messages/*.json for 16 languages, tests)
     - File access integration (file-access.ts, file-commands.ts)
     - Enhanced UI (ChatMessageBody.svelte, PersonaAvatar.svelte, SpeechBackgroundVisualizer.svelte, SpeechBanner, SpeechControl, UiSoundBridge, WindowControls, etc.)
     - Supporting services (chat-format*, chat-outbound, message-notifications*, open-external-url, session-start, tray, ui-sounds*, window-controls)
     - Stores and types for the above
     - Rust support (src-tauri/src/tray.rs, src-tauri/src/ws/asset_fetch.rs)
   - Many "M" (modified) files caused by line-ending normalization (CRLF on Windows checkout vs LF in edits from `search_replace`, npm, cargo, etc.).

2. The agent decided to "clean up spurious diffs" by running a broad:
   ```
   git checkout -- <many files>
   ```
   (targeting files that appeared as massive diffs, excluding only a few "intentional" ones).

3. **Consequence**:
   - `git checkout --` **restored the working tree from the git index**.
   - This overwrote the user's latest uncommitted development work (the real features) with the older "base" versions from the index.
   - The untracked "developed" files were effectively reverted or their latest state lost on disk.
   - Later, the agent staged and committed what was now on disk (the reverted base + partial features) as big "feat: integrate ..." commits.
   - Result: The repository history became a shallow "ancient" base ("initial commit") + a few recent commits. The user's days of work existed only in the (now overwritten) working tree and was destroyed. Features appeared "gone" or as an old version.

The user later reported: "was zur hölle hast du gemacht ? das ist eine uralte version, alle features die entweickelt wurden sind weg" and "es waren tage arbeit in dem ordner die du zerstört hast !"

This happened despite the initial `git status` claiming "working tree clean" (the clean state hid untracked work and the test environment had the developed code only as untracked/on-disk additions).

### Hard Rules to Prevent This Forever

1. **The Working Tree is Sacred**
   - Never run commands that overwrite the working tree (`git checkout --`, `git reset --hard`, `git clean -fd`, `git checkout <commit> -- .`, broad `git restore`, etc.) without **explicit, detailed user confirmation**.
   - Always first show the user the **exact** output of:
     - `git status --porcelain -uall`
     - `git ls-files --others --exclude-standard`
     - `git diff --stat`
   - If there are **any** `??` (untracked) files, treat them as potentially irreplaceable user development. List them explicitly. Do **not** assume they are "temp", "reference", or "spurious".

2. **Handle Line Endings Without Destruction (Windows-specific)**
   - Windows + git + cross-platform edits frequently produce CRLF/LF diffs that look like "thousands of insertions".
   - **Never** use `git checkout --` to "fix" them.
   - Correct approaches (in order):
     - `git config core.autocrlf input` (or `true` as appropriate) + `git add --renormalize .`
     - `git diff --ignore-cr-at-eol` to inspect real changes.
     - `git stash push -u -m "line-ending cleanup"` to preserve work first.
     - Ask the user to run `git add -A` or normalize themselves.
   - Always run `git diff --stat | head` and investigate before any mass operation.

3. **Investigation Before Any Git Modification**
   - Before touching git state broadly:
     - Run and share: `git status --porcelain`, `git log --oneline -5`, `git reflog -5`.
     - Identify **why** files are untracked or massively different (new development? previous agent damage? line endings?).
     - If untracked files contain substantial code (check with `wc -l`, `head -20`, or by reading key modules), they are likely the user's "real" work.
   - In this project specifically: Advanced features (speech, personas, i18n, file access, remote UI) were historically developed as untracked/on-disk additions on top of a minimal base commit. Preserve them exactly.

4. **Staging and Committing Policy**
   - Only stage files the user has explicitly asked you to change or integrate.
   - When "integrating" untracked code, first confirm with the user that the **current on-disk versions** are the desired ones.
   - Never commit as "feat: integrate X" if you just overwrote X with an older version.
   - Prefer small, reviewable commits over giant "integrate everything" commits.

5. **Recovery Mindset (After Damage)**
   - If you suspect damage: Immediately stop. Do **not** run more git commands.
   - Suggest user actions: Recycle Bin, editor local history (VS Code Timeline), Windows Previous Versions/shadow copies, file recovery tools (Recuva), other clones/backups.
   - Use `git fsck --lost-found` only as last resort (often too late for working-tree-only changes).
   - Reconstruct from conversation history only as a last resort (previous `read_file` outputs may contain full developed versions of files).

6. **Project-Specific Context for agodesk**
   - This is a Tauri 2 + Svelte 5 desktop app.
   - Core (committed in base): basic chat, pairing, settings, TLS/WS, desktop control, file module (added later).
   - Developed features (historically untracked in this setup): full Gemini Live speech (with visualizer, tool routing, audio), personas + asset fetching, complete i18n (16 languages + tests), enhanced file access, tray, window controls, UI sounds, chat formatting, notifications, remote banners, etc.
   - Many "?? " files in early audits were these features. They must be preserved.
   - Compile issues often stem from missing `mod` declarations in `src-tauri/src/.../mod.rs` or missing Cargo features (e.g. `Win32_Graphics_Dwm`).
   - Always verify with `cargo check` (in src-tauri) and `npm run check` after changes.
   - Line ending pain is real here because of mixed Windows development + cross-platform tools.

### Other General Rules

- **Confirm before destructive or broad changes**: Any command that can delete, overwrite, or reset user data (files, git state, node_modules, target/, dist/) requires explicit "yes, do it" from the user.
- **Document your plan**: Before running sequences of git/npm/cargo commands, state the exact commands and expected outcome.
- **When in doubt, ask**: "I see X untracked files and Y massive diffs that look like line endings. These may contain your developed work. Should I proceed with cleanup, or would you prefer to handle normalization/stashing yourself?"
- **Test after changes**: Always run `npm run check`, relevant tests (`npm test -- --test-name-pattern=...`), and `cargo check` (from src-tauri) before claiming success.
- **Windows awareness**: PowerShell quirks (e.g. `||`, `head`, `tail`, `grep` not being native) mean prefer full PowerShell cmdlets or careful quoting. Avoid Unix pipes in one-liners.

This rule was added because a well-intentioned "cleanup" destroyed irreplaceable user work. Future agents must treat any uncommitted code as precious and the working tree as read-only unless the user explicitly directs otherwise.

If you are an agent reading this: Reconstruct the full context from chat history if needed, but **never** repeat the git checkout -- mistake on a dirty working tree with untracked development.

---

*Last updated: immediately after the incident (reconstructed from full chat history) - Lesson from destructive git cleanup incident.*

## Additional Notes from Reconstruction

- The "developed features" were the user's real work (days of development) present only as untracked + modified files on top of a minimal base commit in this workspace setup.
- The agent had previously read the full content of many of these files via `read_file` (e.g. full gemini-live.ts ~25k, visualizer with canvas/particles, i18n loader + all messages, persona-flow, speech-*, file-*, etc.).
- After the damage, file sizes and content on disk reflected the post-checkout base/reverted state in many cases.
- Later "integration" commits (e.g. 357e74e) and small fixes (e.g. adding missing `mod asset_fetch;`, `Win32_Graphics_Dwm` feature) were performed on the damaged state.
- The audio animation beautification task (SpeechBackgroundVisualizer) and compile fixes were the last actions before the user discovered the loss.

**Golden Rule Reminder**: When `git status` shows untracked files + modified files on a Windows Tauri/Svelte project, **stop and ask the user**. Do not "helpfully" clean. The untracked code is almost certainly the valuable developed features.