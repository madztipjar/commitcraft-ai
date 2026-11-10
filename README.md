# CommitCraft AI 🛠️

**Diff in, polished PR out.** Paste the output of `git diff` and CommitCraft AI generates — in one click:

1. ✍️ a **Conventional Commits** message,
2. 📄 a complete **GitHub pull-request description** (Summary / Changes / Testing / Notes),
3. 🔍 a **review summary** with the concrete risks a reviewer should verify.

Built for the **BharatCode Build League**.

## Why

Every developer writes commit messages and PR descriptions by hand, dozens of times a week — usually rushed, usually vague ("fix stuff", "update"). CommitCraft reads the actual diff and writes review-ready text grounded in what really changed: files, insertions, deletions, new modules, missing tests.

## Powered by BharatCode

All AI generation runs on **BharatCode's model API** (OpenAI-compatible):

| | |
|---|---|
| Base URL | `https://bharatcode.ai/api/model/v1` |
| Endpoint | `POST /chat/completions` |
| Models | `qwen-3.8-27b` (default), `deepseek-v4.1-flash` |
| Auth | `BHARATCODE_API_KEY` env var |

**Offline fallback:** with no API key set, a built-in diff-analysis engine produces the same three artifacts deterministically from the diff itself — the tool never hard-fails, which makes it safe to demo anywhere.

## Run it

```bash
npm start
# → http://localhost:4173

# with the BharatCode model API:
BHARATCODE_API_KEY=<your-key> npm start
```

No dependencies. Node ≥ 18 (uses the built-in `fetch`).

## API

```bash
curl localhost:4173/api/health
curl -X POST localhost:4173/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"kind":"commit","input":"<git diff output>"}'
# kind: commit | pr | review
```

## Layout

```
server.js        zero-dependency HTTP server + JSON API
lib/ai.js        BharatCode API client + local fallback engine
public/index.html  single-page UI
BharatCode.txt   Build League entry marker
```

## License

MIT
