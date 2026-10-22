// Teste do fallback de modelos: node proxy/test-fallback.js
// Harness: loads router-proxy.js with a fake upstream (https.request mocked) on a random port.
"use strict";
const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");
const { Readable } = require("stream");

const PROXY = process.argv[2] || require("path").join(__dirname, "router-proxy.js");
let opusLimited = true;
let timeOffset = 0;
const seen = [];
const realNow = Date.now;
Date.now = () => realNow() + timeOffset;

https.request = (opts, onRes) => {
  const req = new EventEmitter();
  req.end = (payload) => {
    const body = JSON.parse(payload);
    seen.push(body.model);
    let status = 200, text;
    if (/opus/.test(body.model) && opusLimited) {
      status = 503;
      text = JSON.stringify({ error: { message: '[claude/x] [429]: {"type":"error","error":{"type":"rate_limit_error","message":"Error"}} (reset after 1m 10s)' } });
    } else {
      const stop = body.messages[0].content === "tool" ? "tool_use" : "end_turn";
      const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`;
      if (body.stream) {
        text =
          ev("message_start", { message: { model: body.model, content: [], usage: { input_tokens: 1 } } }) +
          ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
          ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: `resposta de ${body.model}` } }) +
          ev("content_block_stop", { index: 0 }) +
          ev("message_delta", { delta: { stop_reason: stop }, usage: { output_tokens: 1 } }) +
          ev("message_stop", {});
      } else {
        text = JSON.stringify({ model: body.model, content: [{ type: "text", text: `resposta de ${body.model}` }], stop_reason: stop });
      }
    }
    const up = Readable.from([text]);
    up.statusCode = status;
    up.headers = { "content-type": body.stream && status === 200 ? "text/event-stream" : "application/json" };
    setImmediate(() => onRes(up));
  };
  return req;
};

let port;
const origListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (_p, host, cb) {
  return origListen.call(this, 0, host, () => { port = this.address().port; cb && cb(); run(); });
};
const fs = require("fs"); const realAppend = fs.appendFileSync; fs.appendFileSync = (f, d) => (/requests.log$/.test(String(f)) ? undefined : realAppend(f, d));
require(PROXY);

function call(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const r = http.request({ port, path, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, (res) => {
      let s = ""; res.setEncoding("utf8"); res.on("data", (c) => (s += c)); res.on("end", () => resolve({ status: res.statusCode, s }));
    });
    r.end(data);
  });
}
const tools = [{ name: "Read", input_schema: { type: "object" } }];
const texts = (s) => [...s.matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]).filter(Boolean).concat([...s.matchAll(/"content":"([^"]*)"/g)].map((m) => m[1]));
let fails = 0;
const check = (name, ok, extra) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? "  -> " + extra : ""}`); };

async function run() {
  const native = (content, stream = true, withTools = true) =>
    call("/v1/messages", { model: "claude-opus-5-5", max_tokens: 10, stream, ...(withTools ? { tools } : {}), messages: [{ role: "user", content }] });

  seen.length = 0;
  let r = await native("tool");
  check("1. tool_use turn falls back to Sonnet 5.5, notice held back", r.status === 200 && /sonnet-5-5/.test(r.s) && !/\[proxy\]/.test(r.s), JSON.stringify(seen));

  seen.length = 0;
  r = await native("oi");
  const types = [...r.s.matchAll(/^data: (.*)$/gm)].map((m) => JSON.parse(m[1])).map((o) => o.type + (o.delta && o.delta.text ? `(${o.delta.text.slice(0, 12)})` : "") + (typeof o.index === "number" ? `#${o.index}` : ""));
  check(
    "2. end_turn gets the notice inside the last text block; Opus skipped while blocked",
    /\[proxy\] Opus 5.5 indispon/.test(r.s) && !seen.includes("cc/claude-opus-5-5") && !/"index":1/.test(r.s) &&
      types.indexOf("content_block_stop#0") === types.length - 3 && /^content_block_delta\(\n\n⚠️/.test(types[types.length - 4]),
    types.join(" > ")
  );

  r = await native("oi");
  check("3. notice is not repeated", !/\[proxy\]/.test(r.s));

  r = await native("oi", false);
  check("4. non-stream works on fallback", r.status === 200 && /sonnet-5-5/.test(r.s));

  r = await native("oi", true, false);
  check("5. background call (no tools) gets no notice", !/\[proxy\]/.test(r.s));

  opusLimited = false; timeOffset = 2 * 60 * 1000; seen.length = 0;
  r = await native("oi");
  check("6. after cooldown Opus is used again + recovery notice", seen[0] === "cc/claude-opus-5-5" && /voltou a responder/.test(r.s), texts(r.s).join(" | "));

  opusLimited = true; timeOffset = 10 * 60 * 1000;
  r = await call("/v1/chat/completions", { model: "cc/claude-opus-5-5", stream: true, tools: [{ type: "function", function: { name: "Read", parameters: {} } }], messages: [{ role: "user", content: "oi" }] });
  check("7. OpenAI route also falls back with notice", /sonnet-5-5/.test(r.s) && /\[proxy\] Opus 5.5/.test(r.s), texts(r.s).join(" | "));

  console.log(fails ? `${fails} FALHA(S)` : "TUDO OK");
  process.exit(fails ? 1 : 0);
}
