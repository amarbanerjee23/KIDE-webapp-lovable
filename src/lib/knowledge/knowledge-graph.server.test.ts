import { describe, expect, it } from "vitest";
import { unwrapGraphson } from "./knowledge-graph.server";

describe("JanusGraph GraphSON normalization", () => {
  it("unwraps typed lists and scalar values", () => {
    expect(
      unwrapGraphson({
        "@type": "g:List",
        "@value": [{ "@type": "g:Int64", "@value": 7 }, "value"],
      }),
    ).toEqual([7, "value"]);
  });

  it("unwraps typed maps recursively", () => {
    expect(
      unwrapGraphson({
        "@type": "g:Map",
        "@value": [
          "count",
          { "@type": "g:Int32", "@value": 2 },
          "items",
          { "@type": "g:List", "@value": ["a", "b"] },
        ],
      }),
    ).toEqual({ count: 2, items: ["a", "b"] });
  });
});
