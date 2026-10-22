// Local loopback proxy: 127.0.0.1:<PORT> -> https://escritorio.taile8f97b.ts.net
//
// 1) Gives OpenClaude a localhost URL so its /model auto-discovery works.
// 2) For cc/* (Claude) models, translates OpenAI /chat/completions requests into the
//    router's native Anthropic /v1/messages API and translates responses back, because
//    the router's own OpenAI->Anthropic translation is incomplete (tools, system, etc.).
"use strict";

const http = require("http");
const https = require("https");

const PORT = 8788;
const UPSTREAM_HOST = "escritorio.taile8f97b.ts.net";
const DEFAULT_MAX_TOKENS = 32000;

function forward(req, res, body) {
  const headers = { ...req.headers, host: UPSTREAM_HOST };
  if (body !== undefined) {
    delete headers["transfer-encoding"];
    headers["content-length"] = Buffer.byteLength(body);
  }
  const upstreamReq = https.request(
    { hostname: UPSTREAM_HOST, port: 443, path: req.url, method: req.method, headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );
  upstreamReq.on("error", (err) => sendError(res, 502, `proxy upstream error: ${err.message}`));
  if (body !== undefined) upstreamReq.end(body);
  else req.pipe(upstreamReq);
}

function sendError(res, status, message) {
  if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message, type: "proxy_error" } }));
}

// ---------- automatic model fallback on usage limits ----------
//
// When a Claude model answers with a usage-limit/overload error, the same request is
// retried on the next model down this list, and a short notice explaining why is added
// to the end of the next finished answer (never to a tool-use turn).

const FALLBACK_CHAIN = [
  "cc/claude-fable-5-1",
  "cc/claude-fable-5",
  "cc/claude-opus-5-5",
  "cc/claude-opus-5",
  "cc/claude-sonnet-5-5",
  "cc/claude-sonnet-5",
  "cc/claude-haiku-4-5-20251001",
];
const MIN_COOLDOWN_MS = 30 * 1000;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const blockedUntil = new Map(); // model -> epoch ms
const blockedReason = new Map(); // model -> human reason
let announcedFallback = null; // "requested->used" currently announced to the user
let pendingNotice = "";

function prettyModel(m) {
  return String(m)
    .replace(/^cc\/claude-/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-(\d+)-(\d+)$/, " $1.$2")
    .replace(/-(\d+)$/, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

function candidatesFor(model) {
  const i = FALLBACK_CHAIN.indexOf(model);
  if (i < 0) return [model];
  const now = Date.now();
  const rest = FALLBACK_CHAIN.slice(i);
  const open = rest.filter((m) => !(blockedUntil.get(m) > now));
  return open.length ? open : rest;
}

function limitReason(status, text) {
  const limited =
    status === 429 ||
    status === 529 ||
    (status >= 500 && /rate_limit|overloaded|usage limit|quota|\[429\]|\[529\]/i.test(text));
  if (!limited) return null;
  if (/overloaded|529/i.test(text) || status === 529) return "servidor sobrecarregado";
  return "limite de uso atingido";
}

function cooldownMs(text) {
  const m = /reset after\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/i.exec(text);
  if (!m || !(m[1] || m[2] || m[3])) return DEFAULT_COOLDOWN_MS;
  const ms = ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000;
  return Math.max(MIN_COOLDOWN_MS, ms);
}

// Sends `json` with send(body, onResponse, onError), walking down FALLBACK_CHAIN while the
// router answers with a usage-limit error. Calls done(upstreamRes, usedModel) on the first
// other response, or done(null, model, failure) with a replayable error.
function sendWithFallback(json, send, done) {
  const candidates = candidatesFor(json.model);
  const attempt = (k, lastFailure) => {
    if (k >= candidates.length) return done(null, json.model, lastFailure);
    const model = candidates[k];
    send(
      { ...json, model },
      (up) => {
        if ((up.statusCode || 500) < 400) return done(up, model);
        let raw = "";
        up.setEncoding("utf8");
        up.on("data", (c) => (raw += c));
        up.on("end", () => {
          const failure = { status: up.statusCode, headers: up.headers, body: raw };
          const reason = limitReason(up.statusCode, raw);
          if (!reason) return done(null, model, failure);
          const wait = cooldownMs(raw);
          blockedUntil.set(model, Date.now() + wait);
          blockedReason.set(model, reason);
          logEvent({ event: "fallback", model, status: up.statusCode, reason, cooldownS: Math.round(wait / 1000) });
          attempt(k + 1, failure);
        });
      },
      (err) => done(null, model, { status: 502, body: JSON.stringify({ error: { message: `proxy upstream error: ${err.message}`, type: "proxy_error" } }) })
    );
  };
  attempt(0, null);
}

function replayFailure(res, f) {
  const ct = (f && f.headers && f.headers["content-type"]) || "application/json";
  if (!res.headersSent) res.writeHead((f && f.status) || 502, { "content-type": ct });
  res.end((f && f.body) || "");
}

// Records which model served a main-loop request and queues a notice when that changes.
function noteServed(requested, used) {
  if (used !== requested) {
    const key = `${requested}->${used}`;
    if (announcedFallback === key) return;
    announcedFallback = key;
    const until = blockedUntil.get(requested) || Date.now();
    const mins = Math.max(1, Math.round((until - Date.now()) / 60000));
    pendingNotice =
      `⚠️ [proxy] ${prettyModel(requested)} indisponível (${blockedReason.get(requested) || "erro do router"}). ` +
      `Usando ${prettyModel(used)} no lugar; tento o ${prettyModel(requested)} de novo em ~${mins} min.`;
  } else if (announcedFallback && announcedFallback.startsWith(`${requested}->`)) {
    announcedFallback = null;
    pendingNotice = `✅ [proxy] ${prettyModel(requested)} voltou a responder; modelo reserva desligado.`;
  }
}

function takeNotice(stopReason) {
  if (!pendingNotice || stopReason === "tool_use") return "";
  const n = pendingNotice;
  pendingNotice = "";
  return n;
}

// ---------- OpenAI request -> Anthropic request ----------

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === "string" ? p : p && p.text ? p.text : "")).join("\n");
  }
  return content == null ? "" : String(content);
}

function convertUserParts(content) {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const blocks = [];
  for (const p of content) {
    if (!p) continue;
    if (p.type === "text" && p.text) blocks.push({ type: "text", text: p.text });
    else if (p.type === "image_url" && p.image_url && p.image_url.url) {
      const url = p.image_url.url;
      const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
      blocks.push(
        m
          ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }
          : { type: "image", source: { type: "url", url } }
      );
    }
  }
  return blocks;
}

function parseArgs(args) {
  if (args && typeof args === "object") return args;
  try {
    const v = JSON.parse(args || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function pushBlocks(out, role, blocks) {
  if (!blocks.length) return;
  const prev = out[out.length - 1];
  if (prev && prev.role === role) {
    // tool_result blocks must come first inside a user message
    if (role === "user") {
      const results = [...prev.content, ...blocks].filter((b) => b.type === "tool_result");
      const others = [...prev.content, ...blocks].filter((b) => b.type !== "tool_result");
      prev.content = [...results, ...others];
    } else prev.content.push(...blocks);
  } else out.push({ role, content: blocks });
}

function toAnthropicRequest(o) {
  const system = [];
  const messages = [];
  for (const m of o.messages || []) {
    if (!m) continue;
    if (m.role === "system" || m.role === "developer") {
      const t = textOf(m.content);
      if (t) system.push(t);
    } else if (m.role === "user") {
      pushBlocks(messages, "user", convertUserParts(m.content));
    } else if (m.role === "assistant") {
      const blocks = [];
      const t = textOf(m.content);
      if (t) blocks.push({ type: "text", text: t });
      for (const tc of m.tool_calls || []) {
        if (!tc || !tc.function) continue;
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: parseArgs(tc.function.arguments),
        });
      }
      pushBlocks(messages, "assistant", blocks);
    } else if (m.role === "tool") {
      const c = textOf(m.content);
      pushBlocks(messages, "user", [
        { type: "tool_result", tool_use_id: m.tool_call_id, content: c || "(empty)" },
      ]);
    }
  }

  const req = {
    model: o.model,
    max_tokens:
      typeof o.max_tokens === "number"
        ? o.max_tokens
        : typeof o.max_completion_tokens === "number"
        ? o.max_completion_tokens
        : DEFAULT_MAX_TOKENS,
    messages,
    stream: !!o.stream,
  };
  if (system.length) req.system = system.join("\n\n");
  if (typeof o.temperature === "number") req.temperature = o.temperature;
  else if (typeof o.top_p === "number") req.top_p = o.top_p;
  if (o.stop) req.stop_sequences = Array.isArray(o.stop) ? o.stop : [o.stop];

  if (Array.isArray(o.tools) && o.tools.length) {
    req.tools = o.tools
      .map((t) =>
        t && t.type === "function" && t.function
          ? {
              name: t.function.name,
              description: t.function.description || "",
              input_schema: t.function.parameters || { type: "object", properties: {} },
            }
          : t
      )
      .filter(Boolean);
    const tc = o.tool_choice;
    if (tc === "auto") req.tool_choice = { type: "auto" };
    else if (tc === "required") req.tool_choice = { type: "any" };
    else if (tc === "none") req.tool_choice = { type: "none" };
    else if (tc && tc.type === "function" && tc.function) req.tool_choice = { type: "tool", name: tc.function.name };
  }
  return req;
}

// ---------- Anthropic response -> OpenAI response ----------

const STOP_MAP = { end_turn: "stop", stop_sequence: "stop", max_tokens: "length", tool_use: "tool_calls" };

// The router appends "_ide" to every tool name it returns; map back to what the client sent.
function makeNameFixer(openaiReq) {
  const names = new Set(
    (openaiReq.tools || []).map((t) => (t && t.function ? t.function.name : t && t.name)).filter(Boolean)
  );
  return (n) => (!names.has(n) && n && n.endsWith("_ide") && names.has(n.slice(0, -4)) ? n.slice(0, -4) : n);
}

function usageOf(u) {
  if (!u) return undefined;
  const prompt =
    (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const completion = u.output_tokens || 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

function toOpenAIMessage(a, model, fixName) {
  let text = "";
  const toolCalls = [];
  for (const b of a.content || []) {
    if (b.type === "text") text += b.text;
    else if (b.type === "tool_use") {
      toolCalls.push({
        id: b.id,
        type: "function",
        function: { name: fixName(b.name), arguments: JSON.stringify(b.input || {}) },
      });
    }
  }
  const message = { role: "assistant", content: text || null };
  if (toolCalls.length) message.tool_calls = toolCalls;
  return {
    id: `chatcmpl-${a.id || Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: STOP_MAP[a.stop_reason] || "stop" }],
    usage: usageOf(a.usage),
  };
}

function handleClaude(req, res, openaiReq) {
  const anthropicReq = toAnthropicRequest(openaiReq);
  const auth = req.headers["authorization"] || "";
  const apiKey = auth.replace(/^Bearer\s+/i, "") || req.headers["x-api-key"] || "";
  const mainLoop = !!(anthropicReq.tools && anthropicReq.tools.length);

  const send = (body, onResponse, onError) => {
    const payload = JSON.stringify(body);
    const upstreamReq = https.request(
      {
        hostname: UPSTREAM_HOST,
        port: 443,
        path: "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          accept: body.stream ? "text/event-stream" : "application/json",
        },
      },
      onResponse
    );
    upstreamReq.on("error", onError);
    upstreamReq.end(payload);
  };

  sendWithFallback(anthropicReq, send, (up, usedModel, failure) => {
    if (!up) return replayFailure(res, failure);
    if (mainLoop) noteServed(anthropicReq.model, usedModel);
    const fixName = makeNameFixer(openaiReq);
    if (anthropicReq.stream) streamBack(up, res, openaiReq.model, fixName, mainLoop);
    else {
      let raw = "";
      up.setEncoding("utf8");
      up.on("data", (c) => (raw += c));
      up.on("end", () => {
        const jsonText = raw.split(/\n?data: \[DONE\]/)[0];
        try {
          const a = JSON.parse(jsonText);
          const out = toOpenAIMessage(a, openaiReq.model, fixName);
          const notice = mainLoop ? takeNotice(a.stop_reason) : "";
          if (notice) {
            const msg = out.choices[0].message;
            msg.content = msg.content ? `${msg.content}\n\n${notice}` : notice;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(out));
        } catch (e) {
          sendError(res, 502, `proxy could not parse upstream response: ${e.message}`);
        }
      });
    }
  });
}

function streamBack(up, res, model, fixName, mainLoop) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const blockToTool = new Map();
  let toolCount = 0;
  let inputUsage = null;
  let finished = false;
  let buf = "";

  const send = (delta, finish_reason = null, extra = {}) => {
    res.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason }],
        ...extra,
      })}\n\n`
    );
  };

  send({ role: "assistant" });

  const handle = (ev) => {
    switch (ev.type) {
      case "message_start":
        inputUsage = ev.message && ev.message.usage;
        break;
      case "content_block_start": {
        const b = ev.content_block || {};
        if (b.type === "tool_use") {
          const ti = toolCount++;
          blockToTool.set(ev.index, ti);
          send({ tool_calls: [{ index: ti, id: b.id, type: "function", function: { name: fixName(b.name), arguments: "" } }] });
        } else if (b.type === "text" && b.text) send({ content: b.text });
        break;
      }
      case "content_block_delta": {
        const d = ev.delta || {};
        if (d.type === "text_delta" && d.text) send({ content: d.text });
        else if (d.type === "input_json_delta" && blockToTool.has(ev.index)) {
          send({ tool_calls: [{ index: blockToTool.get(ev.index), function: { arguments: d.partial_json || "" } }] });
        }
        break;
      }
      case "message_delta": {
        const notice = mainLoop ? takeNotice(ev.delta && ev.delta.stop_reason) : "";
        if (notice) send({ content: `\n\n${notice}` });
        const reason = STOP_MAP[ev.delta && ev.delta.stop_reason] || "stop";
        const u = { ...(inputUsage || {}), ...(ev.usage || {}) };
        send({}, reason);
        res.write(
          `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [], usage: usageOf(u) })}\n\n`
        );
        finished = true;
        break;
      }
      case "error":
        res.write(`data: ${JSON.stringify({ error: ev.error || { message: "upstream error" } })}\n\n`);
        break;
    }
  };

  up.setEncoding("utf8");
  up.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        handle(JSON.parse(data));
      } catch {}
    }
  });
  up.on("end", () => {
    if (!finished) send({}, "stop");
    res.end("data: [DONE]\n\n");
  });
  up.on("error", () => res.end("data: [DONE]\n\n"));
}

// ---------- native Anthropic /v1/messages passthrough (fixes "_ide" tool names) ----------

function fixNamesDeep(obj, fixName) {
  if (!obj || typeof obj !== "object") return;
  if (obj.type === "tool_use" && typeof obj.name === "string") obj.name = fixName(obj.name);
  for (const v of Object.values(obj)) if (v && typeof v === "object") fixNamesDeep(v, fixName);
}

function sseEvent(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

// A separate text block appended after the model's last block, so it never sits
// between thinking and tool_use blocks.
function noticeEvents(index, text) {
  return (
    sseEvent("content_block_start", { index, content_block: { type: "text", text: "" } }) +
    sseEvent("content_block_delta", { index, delta: { type: "text_delta", text } }) +
    sseEvent("content_block_stop", { index })
  );
}

function handleNativeMessages(req, res, json) {
  const fixName = makeNameFixer({ tools: json.tools || [] });
  const mainLoop = (json.tools || []).length > 0;

  const send = (body, onResponse, onError) => {
    const payload = JSON.stringify(body);
    const headers = { ...req.headers, host: UPSTREAM_HOST, "content-length": Buffer.byteLength(payload) };
    delete headers["transfer-encoding"];
    delete headers["accept-encoding"];
    const upstreamReq = https.request(
      { hostname: UPSTREAM_HOST, port: 443, path: req.url, method: "POST", headers },
      onResponse
    );
    upstreamReq.on("error", onError);
    upstreamReq.end(payload);
  };

  sendWithFallback(json, send, (up, usedModel, failure) => {
    if (!up) return replayFailure(res, failure);
    if (mainLoop) noteServed(json.model, usedModel);
    const isStream = /event-stream/.test(up.headers["content-type"] || "") || json.stream;
    const outHeaders = { ...up.headers };
    delete outHeaders["content-length"];
    res.writeHead(up.statusCode || 502, outHeaders);
    up.setEncoding("utf8");
    if (!isStream) {
      let raw = "";
      up.on("data", (c) => (raw += c));
      up.on("end", () => {
        const jsonText = raw.split(/\n?data: \[DONE\]/)[0];
        try {
          const obj = JSON.parse(jsonText);
          fixNamesDeep(obj, fixName);
          const notice = mainLoop ? takeNotice(obj.stop_reason) : "";
          if (notice && Array.isArray(obj.content)) {
            const last = obj.content[obj.content.length - 1];
            if (last && last.type === "text") last.text = `${last.text}\n\n${notice}`;
            else obj.content.push({ type: "text", text: notice });
          }
          res.end(JSON.stringify(obj));
        } catch {
          res.end(raw);
        }
      });
      return;
    }
    // The notice goes inside the answer's last text block (print mode shows only that
    // block), so the stop event of each text block is held until the next event shows
    // whether it was the last one.
    let buf = "";
    let lastIndex = -1;
    const textBlocks = new Set();
    let heldStop = null; // { index, raw }
    const fixEvent = (ev) => {
      const m = /^data:[ \t]?(.*)$/m.exec(ev);
      if (!m || !m[1].startsWith("{")) return { out: ev };
      let obj;
      try {
        obj = JSON.parse(m[1]);
      } catch {
        return { out: ev };
      }
      fixNamesDeep(obj, fixName);
      return { obj, out: ev.replace(m[0], () => `data: ${JSON.stringify(obj)}`) };
    };
    const processEvent = (ev) => {
      const { obj, out } = fixEvent(ev);
      let prefix = "";
      if (obj && typeof obj.index === "number") lastIndex = Math.max(lastIndex, obj.index);
      if (obj && obj.type === "content_block_start" && obj.content_block && obj.content_block.type === "text") {
        textBlocks.add(obj.index);
      }
      if (obj && obj.type === "message_delta" && mainLoop) {
        const notice = takeNotice(obj.delta && obj.delta.stop_reason);
        if (notice && heldStop) {
          prefix = sseEvent("content_block_delta", { index: heldStop.index, delta: { type: "text_delta", text: `\n\n${notice}` } });
        } else if (notice) prefix = noticeEvents(lastIndex + 1, notice);
      }
      if (heldStop) {
        prefix += heldStop.raw;
        heldStop = null;
      }
      if (obj && obj.type === "content_block_stop" && textBlocks.has(obj.index)) {
        heldStop = { index: obj.index, raw: `${out}\n\n` };
        return prefix;
      }
      return `${prefix}${out}\n\n`;
    };
    up.on("data", (chunk) => {
      buf += chunk.replace(/\r\n/g, "\n");
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        res.write(processEvent(buf.slice(0, i)));
        buf = buf.slice(i + 2);
      }
    });
    up.on("end", () => {
      let tail = buf ? processEvent(buf) : "";
      if (heldStop) tail += heldStop.raw;
      res.end(tail);
    });
    up.on("error", () => res.end());
  });
}

// ---------- request summary log (no message contents) ----------

const fs = require("fs");
const path = require("path");
const LOG_FILE = path.join(__dirname, "requests.log");
function logSummary(route, json) {
  try {
    const tools = (json.tools || []).map((t) => (t && t.function ? t.function.name : t && t.name));
    const line = {
      at: new Date().toISOString(),
      route,
      model: json.model,
      effort: json.output_config && json.output_config.effort,
      stream: !!json.stream,
      messages: (json.messages || []).length,
      system: !!json.system || (json.messages || []).some((m) => m && m.role === "system"),
      tools: tools.length,
      toolNames: tools.slice(0, 40),
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(line) + "\n");
  } catch {}
}

function logEvent(data) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...data }) + "\n");
  } catch {}
}

// ---------- server ----------

const server = http.createServer((req, res) => {
  const isNative = req.method === "POST" && /^\/v1\/messages(\?|$)/.test(req.url);
  if (isNative) {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      let json;
      try {
        json = JSON.parse(body);
      } catch {
        return forward(req, res, body);
      }
      // OpenClaude's background calls use bare Anthropic ids (e.g. claude-haiku-4-5-...);
      // the router only knows them under the "cc/" prefix.
      if (typeof json.model === "string" && /^claude-/.test(json.model)) json.model = `cc/${json.model}`;
      logSummary("messages", json);
      handleNativeMessages(req, res, json);
    });
    return;
  }

  const isChat = req.method === "POST" && /\/chat\/completions(\?|$)/.test(req.url);
  if (!isChat) return forward(req, res);

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      return forward(req, res, body);
    }
    logSummary("chat", json);
    if (typeof json.model === "string" && json.model.startsWith("cc/")) return handleClaude(req, res, json);
    forward(req, res, body);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") process.exit(0);
  console.error("router-proxy failed to start:", err.message);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`router-proxy listening on http://127.0.0.1:${PORT} -> https://${UPSTREAM_HOST}`);
});
