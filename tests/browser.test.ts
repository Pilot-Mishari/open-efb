import { describe, expect, it } from "vitest";
import { buildEmbeddedBrowserUrl, buildVatsimListenUrl, normalizeVatsimStationId } from "../apps/web/src/lib/browser";

describe("buildEmbeddedBrowserUrl", () => {
  it("encodes external URLs for the in-app browser route", () => {
    expect(buildEmbeddedBrowserUrl("https://chartfox.org/"))
      .toBe("/browser?url=https%3A%2F%2Fchartfox.org%2F");
  });

  it("supports a return target and alternate route", () => {
    expect(buildEmbeddedBrowserUrl("https://listen.vatsim.net/live/OTHH_1_GND", {
      route: "/cabin/browser",
      returnTo: "/cabin/home",
    })).toBe("/cabin/browser?url=https%3A%2F%2Flisten.vatsim.net%2Flive%2FOTHH_1_GND&returnTo=%2Fcabin%2Fhome");
  });

  it("rejects non-HTTP targets", () => {
    expect(buildEmbeddedBrowserUrl("mailto:test@example.com")).toBeNull();
  });
});

describe("VATSIM Listen URL helpers", () => {
  it("normalizes official station IDs to the official format", () => {
    expect(normalizeVatsimStationId("othh 1 gnd")).toBe("OTHH_1_GND");
    expect(normalizeVatsimStationId("OTHH_1_GND")).toBe("OTHH_1_GND");
  });

  it("rejects non-official station IDs", () => {
    expect(normalizeVatsimStationId("example.com")).toBeNull();
    expect(normalizeVatsimStationId("KJFK")).toBeNull();
  });

  it("builds the official VATSIM Listen url for a valid station", () => {
    expect(buildVatsimListenUrl("OTHH_1_GND")).toBe("https://listen.vatsim.net/live/OTHH_1_GND");
    expect(buildVatsimListenUrl("example.com")).toBeNull();
  });
});
