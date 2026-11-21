// Contract tests for the semantic Project-panel folder model:
// FolderNode tree -> flattened FolderSpec paths -> comp/footage `folder`
// assignment. Only folders that actually hold items (plus ancestors) are
// emitted; undeclared references fail at compile time.

import { describe, expect, test } from "bun:test";
import { compileProduction, flattenFolders } from "../pv/production/compile.ts";
import type { CompProduction, ProductionProject } from "../pv/production/model.ts";
import type { FrameSpec } from "../pv/production/model.ts";

const FRAME: FrameSpec = { width: 100, height: 100, frameRate: 24, duration: 1 };

function comp(id: string, name: string, folder?: string): CompProduction {
  return {
    id,
    name,
    folder,
    sections: [
      {
        id: "s",
        role: "scene",
        layers: [{ id: "l", content: { kind: "spec", layer: { index: 0, name: "l", kind: "null" } } }],
      },
    ],
  };
}

function project(over: Partial<ProductionProject>): ProductionProject {
  return { name: "p", frame: FRAME, comps: [comp("a", "A")], ...over };
}

describe("flattenFolders", () => {
  test("emits parents before children with slash paths", () => {
    const flat = flattenFolders([
      { name: "03_Materials", children: [{ name: "Brand" }, { name: "Images" }] },
      { name: "_Verification" },
    ]);
    expect(flat).toEqual([
      { name: "03_Materials", path: "03_Materials" },
      { name: "Brand", path: "03_Materials/Brand" },
      { name: "Images", path: "03_Materials/Images" },
      { name: "_Verification", path: "_Verification" },
    ]);
  });

  test("rejects empty names and path separators", () => {
    expect(() => flattenFolders([{ name: "" }])).toThrow();
    expect(() => flattenFolders([{ name: "a/b" }])).toThrow();
  });
});

describe("compileProduction folders", () => {
  test("only folders holding items (+ancestors) reach the spec", () => {
    const p = project({
      comps: [comp("a", "A", "03_Materials/Brand"), comp("b", "B", "_Verification")],
      folders: [
        { name: "03_Materials", children: [{ name: "Brand" }, { name: "Unused" }] },
        { name: "_Verification" },
        { name: "99_Empty" },
      ],
    });
    const spec = compileProduction(p);
    expect(spec.folders).toEqual([
      { name: "03_Materials", path: "03_Materials" },
      { name: "Brand", path: "03_Materials/Brand" },
      { name: "_Verification", path: "_Verification" },
    ]);
    expect(spec.comps[0].folder).toBe("03_Materials/Brand");
    expect(spec.comps[1].folder).toBe("_Verification");
  });

  test("undeclared folder references fail loudly", () => {
    const p = project({ comps: [comp("a", "A", "Nope/Missing")] });
    expect(() => compileProduction(p)).toThrow(/undeclared folder/);
  });

  test("asset folder flows to its footage spec", () => {
    const p = project({
      comps: [
        {
          ...comp("a", "A"),
          sections: [
            {
              id: "s",
              role: "scene",
              layers: [
                {
                  id: "l",
                  content: { kind: "footage", asset: "img" },
                },
              ],
            },
          ],
        },
      ],
      assets: [
        {
          id: "img",
          kind: "file",
          name: "img.png",
          file: "assets/images/Ae.png",
          folder: "03_Materials/Images",
        },
      ],
      folders: [{ name: "03_Materials", children: [{ name: "Images" }] }],
    });
    const spec = compileProduction(p);
    expect(spec.footage[0].folder).toBe("03_Materials/Images");
    expect(spec.folders).toEqual([
      { name: "03_Materials", path: "03_Materials" },
      { name: "Images", path: "03_Materials/Images" },
    ]);
  });

  test("no folders declared -> spec carries no folder fields", () => {
    const spec = compileProduction(project({}));
    expect(spec.folders).toBeUndefined();
    expect(spec.comps[0].folder).toBeUndefined();
  });
});
