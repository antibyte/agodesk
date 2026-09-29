import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { chromium } from "playwright";
import { loadModule } from "./test-module-loader.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const csp = JSON.parse(read("src-tauri/tauri.conf.json")).app.security.csp;
const nativeSource = read("src-tauri/src/computer_use/browser/cdp.rs");
const binding = nativeSource.match(/PAGE_AGENT_BINDING:\s*&str\s*=\s*"([^"]+)"/)[1];
const world = nativeSource.match(/PAGE_AGENT_WORLD:\s*&str\s*=\s*"([^"]+)"/)[1];
const wrapper = nativeSource.slice(
  nativeSource.indexOf("fn wrap_page_agent_source("),
  nativeSource.indexOf("pub async fn page_agent_resolve("),
);
const parts = [...wrapper.matchAll(/r#"([\s\S]*?)"#/g)].map((match) => match[1]);
assert.equal(parts.length, 2);
const { buildPageAgentBootstrap } = loadModule("src/lib/services/page-agent/bootstrap.ts");
const bootstrap = buildPageAgentBootstrap({
  bindingName: binding,
  baseUrl: "https://agodesk.pageagent.local/v1",
  model: "test",
  language: "en-US",
  maxSteps: 2,
});
const source =
  parts[0] +
  read("src/lib/services/page-agent/vendor/page-agent.iife.js") +
  "\n;\n" +
  bootstrap +
  parts[1];
new Function(source);

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": csp });
  response.end(
    '<!doctype html><html><head><title>Browser security fixture</title></head><body><main><h1>Local browser fixture</h1><button id="fixture-button">Test</button></main></body></html>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.AGODESK_BROWSER_CHANNEL
      ? { channel: process.env.AGODESK_BROWSER_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Embedded media fixture</body></html>",
    }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  const media = await page.evaluate(async () => {
    const violations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      violations.push(event.effectiveDirective),
    );
    const wav = new Uint8Array(46);
    const view = new DataView(wav.buffer);
    const tag = (offset, text) => {
      for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
    };
    tag(0, "RIFF");
    view.setUint32(4, 38, true);
    tag(8, "WAVE");
    tag(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    tag(36, "data");
    view.setUint32(40, 2, true);
    const blobUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    for (const src of [`data:audio/wav;base64,${btoa(String.fromCharCode(...wav))}`, blobUrl]) {
      await new Promise((resolve, reject) => {
        const audio = new Audio();
        const timer = setTimeout(() => reject(Error("Media did not load")), 5000);
        audio.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        audio.onerror = () => {
          clearTimeout(timer);
          reject(Error("Media blocked"));
        };
        audio.src = src;
        audio.load();
      });
    }
    URL.revokeObjectURL(blobUrl);
    await new Promise((resolve) => {
      const frame = document.createElement("iframe");
      frame.onload = resolve;
      frame.src = "https://www.youtube-nocookie.com/embed/test";
      document.body.append(frame);
    });
    return violations;
  });
  assert.ok(!media.includes("media-src") && !media.includes("frame-src"), JSON.stringify(media));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  cdp.on("Runtime.exceptionThrown", (event) =>
    console.error("Browser script exception:", event.exceptionDetails),
  );
  const requests = [];
  cdp.on("Runtime.bindingCalled", (event) => requests.push(event));
  await cdp.send("Runtime.addBinding", { name: binding, executionContextName: world });
  const hook = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source,
    worldName: world,
  });
  const context = async () => {
    const { frameTree } = await cdp.send("Page.getFrameTree");
    return (
      await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: world })
    ).executionContextId;
  };
  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      contextId: await context(),
      awaitPromise: true,
      returnByValue: true,
    });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await evaluate(source);
  const root = page.locator("#page-agent-runtime_agent-panel");
  await root.waitFor({ state: "visible" });
  assert.equal(await page.evaluate((name) => typeof window[name], binding), "undefined");
  assert.equal(await page.evaluate(() => typeof window.__agodeskPageAgentResolve), "undefined");
  assert.equal(
    await evaluate(
      "window.__agodeskPageAgent.execute('unauthorized').then(() => false, () => true)",
    ),
    true,
  );
  assert.equal(await evaluate("window.__agodeskPageAgentTaskActive"), false);
  await root
    .locator("textarea, input")
    .first()
    .evaluate((input) => {
      input.value = "Synthetic task";
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
  await page.waitForTimeout(100);
  assert.equal(requests.length, 0);
  await root.locator("textarea, input").first().fill("Read the heading of this local test page");
  await root.locator("textarea, input").first().press("Enter");
  for (let i = 0; i < 60 && !requests.length; i++) await page.waitForTimeout(100);
  assert.ok(requests.length > 0, "Trusted panel input must still start the agent");
  const request = JSON.parse(requests[0].payload);
  assert.equal(request.documentId, await evaluate("window.__agodeskPageAgentDocumentId"));
  assert.equal(requests[0].executionContextId, await context());
  assert.ok(request.body.includes("Read the heading"));
  if (process.env.AGODESK_BROWSER_SCREENSHOT)
    await page.screenshot({ path: process.env.AGODESK_BROWSER_SCREENSHOT, fullPage: true });
  const documentId = request.documentId;
  await page.goto(url + "/next");
  await root.waitFor({ state: "visible" });
  assert.notEqual(await evaluate("window.__agodeskPageAgentDocumentId"), documentId);
  assert.equal(await evaluate("window.__agodeskPageAgentTaskActive"), false);
  assert.equal(await page.evaluate((name) => typeof window[name], binding), "undefined");
  await evaluate("window.__agodeskPageAgentTeardown()");
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: hook.identifier });
  await cdp.send("Runtime.removeBinding", { name: binding });
  await page.goto(url + "/disabled");
  assert.equal(await evaluate("!!window.__agodeskPageAgent"), false);
  console.log(
    "PASS: data/blob audio, media frame, isolated bridge, trusted task, synthetic event rejection, navigation reset, teardown",
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
