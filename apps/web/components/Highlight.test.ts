import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Highlight, restoreOpening } from "./Highlight";

describe("Highlight", () => {
  it("marks matches and escapes everything else", () => {
    const html = renderToStaticMarkup(createElement(Highlight, { text: "De \u0001herder\u0002 <b>zorgt</b> \u0002" }));
    expect(html).toBe("De <mark>herder</mark> &lt;b&gt;zorgt&lt;/b&gt; ");
  });

  it("puts back an opening bracket that the database fragment dropped (V14)", () => {
    expect(restoreOpening("TEST] \u0001Inzicht\u0002 over genade")).toBe("[TEST] \u0001Inzicht\u0002 over genade");
    expect(restoreOpening("zie [Rom 8] en verder")).toBe("zie [Rom 8] en verder");
    expect(restoreOpening("gewone tekst zonder haken")).toBe("gewone tekst zonder haken");
    expect(restoreOpening("Johannes 3) staat er")).toBe("(Johannes 3) staat er");
  });
});
