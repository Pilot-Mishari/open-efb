import { describe, expect, it } from "vitest";
import { buildEmbeddedBrowserUrl } from "../apps/web/src/lib/browser";

describe("buildEmbeddedBrowserUrl", () => {
  it("encodes external URLs for the in-app browser route", () => {
    expect(buildEmbeddedBrowserUrl("https://chartfox.org/"))
      .toBe("/browser?url=https%3A%2F%2Fchartfox.org%2F");
  });

  it("rejects non-HTTP targets", () => {
    expect(buildEmbeddedBrowserUrl("mailto:test@example.com")).toBeNull();
  });
});
