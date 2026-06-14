import assert from "node:assert/strict";
import test from "node:test";
import { resolvePersonaChatImage, resolvePersonaWelcomeImage } from "./persona-display.ts";

test("resolvePersonaWelcomeImage bevorzugt Avatar", () => {
  const result = resolvePersonaWelcomeImage({
    avatarUrl: "data:image/png;base64,avatar",
    avatarFallbackUrl: "https://host/avatar.png",
    iconUrl: "data:image/png;base64,icon",
    iconFallbackUrl: "https://host/icon.png",
  });
  assert.equal(result.imageUrl, "data:image/png;base64,avatar");
  assert.equal(result.fallbackImageUrl, "https://host/avatar.png");
});

test("resolvePersonaChatImage bevorzugt Icon mit Avatar-Fallback", () => {
  const result = resolvePersonaChatImage({
    avatarUrl: "data:image/png;base64,avatar",
    avatarFallbackUrl: "https://host/avatar.png",
    iconUrl: "",
    iconFallbackUrl: "https://host/icon.png",
  });
  assert.equal(result.imageUrl, "data:image/png;base64,avatar");
  assert.equal(result.fallbackImageUrl, "https://host/icon.png");
});

test("resolvePersonaChatImage nutzt Icon wenn vorhanden", () => {
  const result = resolvePersonaChatImage({
    avatarUrl: "data:image/png;base64,avatar",
    avatarFallbackUrl: "https://host/avatar.png",
    iconUrl: "data:image/png;base64,icon",
    iconFallbackUrl: "https://host/icon.png",
  });
  assert.equal(result.imageUrl, "data:image/png;base64,icon");
  assert.equal(result.fallbackImageUrl, "https://host/icon.png");
});
