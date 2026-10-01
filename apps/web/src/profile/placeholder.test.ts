import { describe, expect, it } from "vitest";
import { colorForLabel, fileExtensionLabel } from "./placeholder.js";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

describe("colorForLabel", () => {
  it("is deterministic: the same label always yields the same color", () => {
    expect(colorForLabel("epic-lore")).toBe(colorForLabel("epic-lore"));
  });

  it("returns a valid hex color for an arbitrary label", () => {
    expect(colorForLabel("epic-lore-webui")).toMatch(HEX_COLOR_PATTERN);
  });

  it("handles an empty string without throwing", () => {
    expect(colorForLabel("")).toMatch(HEX_COLOR_PATTERN);
  });

  it("spreads distinct labels across more than one color (not a constant function)", () => {
    const labels = ["main", "feature/lazy-tree-loading", "release/1.0", "epic-lore", "epic-lore-webui"];
    const colors = new Set(labels.map(colorForLabel));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("fileExtensionLabel", () => {
  it("uppercases a simple extension", () => {
    expect(fileExtensionLabel("crates/lore-server/src/main.rs")).toBe("RS");
  });

  it("truncates a long extension to 4 chars", () => {
    expect(fileExtensionLabel("notes.markdown")).toBe("MARK");
  });

  it("falls back to FILE for an extension-less name", () => {
    expect(fileExtensionLabel("Makefile")).toBe("FILE");
  });

  it("falls back to FILE for a leading-dot dotfile (no real extension)", () => {
    expect(fileExtensionLabel(".gitignore")).toBe("FILE");
  });

  it("falls back to FILE for a trailing-dot name", () => {
    expect(fileExtensionLabel("weird.")).toBe("FILE");
  });

  it("uses only the final path segment's extension", () => {
    expect(fileExtensionLabel("a.tar/b.png")).toBe("PNG");
  });
});
