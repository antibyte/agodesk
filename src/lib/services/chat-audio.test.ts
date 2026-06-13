import test from "node:test";
import assert from "node:assert/strict";

function extractBase64FromDataUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) {
    return null;
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  return dataUrl.slice(commaIndex + 1);
}

test("extractBase64FromDataUrl liest base64 aus data-URLs", () => {
  assert.equal(extractBase64FromDataUrl("data:audio/mpeg;base64,QUJD"), "QUJD");
  assert.equal(extractBase64FromDataUrl("https://example.com/a.mp3"), null);
});
