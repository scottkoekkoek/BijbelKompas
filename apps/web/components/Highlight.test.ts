import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Highlight } from "./Highlight";

describe("Highlight", () => {
  it("marks matches and escapes everything else", () => {
    const html = renderToStaticMarkup(createElement(Highlight, { text: "De \u0001herder\u0002 <b>zorgt</b> \u0002" }));
    expect(html).toBe("De <mark>herder</mark> &lt;b&gt;zorgt&lt;/b&gt; ");
  });
});
