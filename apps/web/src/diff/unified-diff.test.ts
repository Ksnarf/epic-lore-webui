import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./unified-diff.js";

describe("parseUnifiedDiff", () => {
  it("returns no hunks for an empty diff text (e.g. a rename with unchanged content)", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("aligns a pure addition hunk with every row on the right, left null", () => {
    const diff = "@@ -0,0 +1,2 @@\n+pub mod handlers;\n+pub mod grpc;\n";
    const hunks = parseUnifiedDiff(diff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.header).toBe("@@ -0,0 +1,2 @@");
    expect(hunks[0]!.rows).toEqual([
      { left: null, right: { lineNumber: 1, text: "pub mod handlers;" } },
      { left: null, right: { lineNumber: 2, text: "pub mod grpc;" } },
    ]);
  });

  it("aligns a pure deletion hunk with every row on the left, right null", () => {
    const diff = '@@ -1,3 +0,0 @@\n-fn main() {\n-    println!("lore-server starting");\n-}\n';
    const hunks = parseUnifiedDiff(diff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.rows).toEqual([
      { left: { lineNumber: 1, text: "fn main() {" }, right: null },
      { left: { lineNumber: 2, text: '    println!("lore-server starting");' }, right: null },
      { left: { lineNumber: 3, text: "}" }, right: null },
    ]);
  });

  it("pairs a mixed change group row-by-row and leaves a trailing one-sided addition, with context lines aligned on both sides", () => {
    const diff = [
      "@@ -1,3 +1,4 @@",
      ' pub const REVIEWED_BY: &str = "reviewed-by";',
      '-pub const MERGED_BY: &str = "merged-by";',
      '+pub const MERGED_BY: &str = "merged-by-user";',
      ' pub const CHANGE_REQUEST: &str = "change-request";',
      '+pub const CREATED_BY: &str = "created-by";',
      "",
    ].join("\n");

    const hunks = parseUnifiedDiff(diff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.rows).toEqual([
      {
        left: { lineNumber: 1, text: 'pub const REVIEWED_BY: &str = "reviewed-by";' },
        right: { lineNumber: 1, text: 'pub const REVIEWED_BY: &str = "reviewed-by";' },
      },
      {
        left: { lineNumber: 2, text: 'pub const MERGED_BY: &str = "merged-by";' },
        right: { lineNumber: 2, text: 'pub const MERGED_BY: &str = "merged-by-user";' },
      },
      {
        left: { lineNumber: 3, text: 'pub const CHANGE_REQUEST: &str = "change-request";' },
        right: { lineNumber: 3, text: 'pub const CHANGE_REQUEST: &str = "change-request";' },
      },
      { left: null, right: { lineNumber: 4, text: 'pub const CREATED_BY: &str = "created-by";' } },
    ]);
  });

  it("parses multiple hunks in one diff text independently, each with its own line-number base", () => {
    const diff = ["@@ -1,1 +1,1 @@", "-a", "+b", "@@ -10,1 +10,2 @@", " c", "+d", ""].join("\n");

    const hunks = parseUnifiedDiff(diff);

    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.rows).toEqual([{ left: { lineNumber: 1, text: "a" }, right: { lineNumber: 1, text: "b" } }]);
    expect(hunks[1]!.rows).toEqual([
      { left: { lineNumber: 10, text: "c" }, right: { lineNumber: 10, text: "c" } },
      { left: null, right: { lineNumber: 11, text: "d" } },
    ]);
  });

  it("ignores a '\\ No newline at end of file' marker without producing a row or shifting line numbers", () => {
    const diff = ["@@ -1,1 +1,1 @@", "-old", "\\ No newline at end of file", "+new", "\\ No newline at end of file", ""].join(
      "\n",
    );

    const hunks = parseUnifiedDiff(diff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.rows).toEqual([{ left: { lineNumber: 1, text: "old" }, right: { lineNumber: 1, text: "new" } }]);
  });
});
