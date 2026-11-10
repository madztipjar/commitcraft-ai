// CommitCraft AI — BharatCode model API client with a local fallback engine.
//
// Primary path: BharatCode's OpenAI-compatible chat completions API
//   Base URL : https://bharatcode.ai/api/model/v1
//   Auth     : Authorization: Bearer <BHARATCODE_API_KEY>
//   Models   : qwen-3.8-27b (default), deepseek-v4.1-flash
//
// Fallback path: if no API key is configured (or the API is unreachable),
// a deterministic local analyzer derives the same artifacts from the diff
// itself, so the tool always produces useful output.

const API_BASE = process.env.BHARATCODE_API_BASE || "https://bharatcode.ai/api/model/v1";
const API_KEY = process.env.BHARATCODE_API_KEY || "";
const MODEL = process.env.BHARATCODE_MODEL || "qwen-3.8-27b";

export function aiMode() {
  return API_KEY ? `bharatcode-api (${MODEL})` : "local-fallback (set BHARATCODE_API_KEY to use the BharatCode model API)";
}

async function chat(messages, { temperature = 0.3, maxTokens = 900 } = {}) {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BharatCode API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ---------- local fallback analysis ----------

export function analyzeDiff(diff) {
  const files = [];
  let current = null;
  let added = 0;
  let removed = 0;
  for (const line of String(diff || "").split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      current = { path: m[2], added: 0, removed: 0, isNew: false, isDeleted: false };
      files.push(current);
      continue;
    }
    if (/^new file mode/.test(line) && current) current.isNew = true;
    if (/^deleted file mode/.test(line) && current) current.isDeleted = true;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added++; if (current) current.added++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed++; if (current) current.removed++;
    }
  }
  return { files, added, removed };
}

function guessType(files, diff) {
  const paths = files.map((f) => f.path).join(" ").toLowerCase();
  const text = String(diff).toLowerCase();
  if (files.length && files.every((f) => f.isNew) && files.some((f) => /test|spec/.test(f.path))) return "test";
  if (/readme|\.md$|docs\//.test(paths)) return "docs";
  if (/fix|bug|error|exception|crash/.test(text) && files.some((f) => !f.isNew)) return "fix";
  if (files.some((f) => f.isNew)) return "feat";
  if (/import|require|from /.test(text) && files.every((f) => f.added + f.removed < 12)) return "chore";
  return "feat";
}

function scopeOf(files) {
  if (!files.length) return "";
  const first = files[0].path.split("/").slice(0, -1).join("/");
  const seg = (first || files[0].path.split(".")[0] || "").split("/").pop();
  return seg ? seg.replace(/[^a-z0-9-]/gi, "").toLowerCase() : "";
}

function fallbackGenerate(kind, payload) {
  const { files, added, removed } = analyzeDiff(payload);
  const names = files.map((f) => f.path);
  const type = guessType(files, payload);
  const scope = scopeOf(files);
  const main = names[0] || "project files";
  const subject =
    files.length === 0
      ? "update project files"
      : files.length === 1
        ? `${files[0].isNew ? "add" : files[0].isDeleted ? "remove" : "update"} ${main}`
        : `update ${files.length} files (${names.slice(0, 2).join(", ")}${names.length > 2 ? ", …" : ""})`;

  if (kind === "commit") {
    const header = `${type}${scope ? `(${scope})` : ""}: ${subject}`;
    const body = [
      "",
      `Changes: ${added} insertion(s), ${removed} deletion(s) across ${files.length} file(s).`,
      ...files.map((f) => `- ${f.path}: +${f.added} -${f.removed}${f.isNew ? " (new)" : ""}${f.isDeleted ? " (deleted)" : ""}`),
    ].join("\n");
    return `${header}\n${body}`;
  }
  if (kind === "pr") {
    return [
      `## ${type === "fix" ? "🐛 Fix" : "✨"} ${subject}`,
      "",
      "### Summary",
      `This PR ${subject}. It touches ${files.length} file(s) with ${added} insertions and ${removed} deletions.`,
      "",
      "### Changes",
      ...(files.length ? files.map((f) => `- \`${f.path}\` (+${f.added} / -${f.removed})${f.isNew ? " — new file" : ""}${f.isDeleted ? " — deleted" : ""}`) : ["- (no diff parsed)"]),
      "",
      "### Testing",
      "- [ ] Existing test suite passes",
      "- [ ] Manually verified the changed flow end to end",
      "",
      "### Notes",
      "Generated with CommitCraft AI (local fallback mode).",
    ].join("\n");
  }
  // review
  const risks = [];
  if (removed > added * 2 && removed > 40) risks.push("Large net deletion — double-check nothing still references the removed code.");
  if (files.length > 8) risks.push(`Wide blast radius (${files.length} files) — consider splitting into smaller PRs.`);
  if (!files.some((f) => /test|spec/.test(f.path))) risks.push("No test files in this diff — behavior changes are unverified by tests.");
  if (/password|secret|token|api[_-]?key/i.test(payload)) risks.push("Diff mentions credentials/secrets — verify nothing sensitive is committed.");
  if (!risks.length) risks.push("No obvious risks detected by the heuristic pass.");
  return [
    "## Review summary (heuristic)",
    "",
    `**Scope:** ${files.length} file(s), +${added} / -${removed}`,
    `**Dominant change:** ${subject}`,
    "",
    "**Points to verify:**",
    ...risks.map((r) => `- ${r}`),
  ].join("\n");
}

// ---------- public entry ----------

const PROMPTS = {
  commit: (diff) =>
    `You are an expert engineer. Given the git diff below, write ONE Conventional Commits message: a header line "type(scope): subject" (max 72 chars, imperative mood), a blank line, and a concise body with bullet points summarizing the changes per file. Output only the commit message.\n\nDIFF:\n${diff}`,
  pr: (diff) =>
    `You are an expert engineer. Given the git diff below, write a GitHub pull-request description in Markdown with sections: Summary, Changes (per file), Testing (checklist), Notes. Be specific about what changed and why it likely changed. Output only the PR description.\n\nDIFF:\n${diff}`,
  review: (diff) =>
    `You are a senior code reviewer. Given the git diff below, produce a short review summary in Markdown: scope of the change, the main behavior change, and a bullet list of concrete risks/questions a reviewer should verify (correctness, security, missing tests, edge cases). Be specific to this diff. Output only the review.\n\nDIFF:\n${diff}`,
};

export async function generate(kind, diff) {
  if (!PROMPTS[kind]) throw new Error(`unknown kind: ${kind}`);
  if (!diff || diff.trim().length < 4) throw new Error("empty input");
  const trimmed = diff.slice(0, 24000);
  if (API_KEY) {
    try {
      const out = await chat([{ role: "user", content: PROMPTS[kind](trimmed) }]);
      if (out) return { text: out, mode: aiMode() };
    } catch (err) {
      // fall through to local engine — tool must stay useful
      return { text: fallbackGenerate(kind, trimmed), mode: `local-fallback (API error: ${err.message})` };
    }
  }
  return { text: fallbackGenerate(kind, trimmed), mode: aiMode() };
}
