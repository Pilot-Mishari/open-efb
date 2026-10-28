import { describe, expect, it } from "vitest";
import { buildEmbeddedBrowserUrl, buildVatsimListenUrl, needsPlayerWindow, normalizeVatsimStationId } from "../apps/web/src/lib/browser";

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

  it("accepts the controller callsigns the VATSIM feed uses as station ids", () => {
    expect(normalizeVatsimStationId("EDDF_TWR")).toBe("EDDF_TWR");
    expect(normalizeVatsimStationId("eddf_gnd")).toBe("EDDF_GND");
    expect(normalizeVatsimStationId("KJFK_APP")).toBe("KJFK_APP");
    expect(normalizeVatsimStationId("https://listen.vatsim.net/live/LON_CTR")).toBe("LON_CTR");
  });

  it("rejects non-official station IDs", () => {
    expect(normalizeVatsimStationId("example.com")).toBeNull();
    expect(normalizeVatsimStationId("KJFK")).toBeNull();
    expect(normalizeVatsimStationId("EDDF/TRZ")).toBeNull();
    expect(normalizeVatsimStationId("a_" + "x".repeat(40))).toBeNull();
  });

  it("builds the official VATSIM Listen url for a valid station", () => {
    expect(buildVatsimListenUrl("OTHH_1_GND")).toBe("https://listen.vatsim.net/live/OTHH_1_GND");
    expect(buildVatsimListenUrl("example.com")).toBeNull();
  });
});

describe("needsPlayerWindow", () => {
  it("gives the VATSIM Listen host its own window, because its sign-in cannot be framed", () => {
    expect(needsPlayerWindow("https://listen.vatsim.net/live/EDDF_TWR")).toBe(true);
    expect(needsPlayerWindow("https://listen.vatsim.net/")).toBe(true);
  });

  it("keeps every other site in the embedded iframe", () => {
    expect(needsPlayerWindow("https://chartfox.org/EDDF/chart/12")).toBe(false);
    expect(needsPlayerWindow("https://charts.navigraph.com/")).toBe(false);
    // Look-alike hostnames must not be treated as the VATSIM player.
    expect(needsPlayerWindow("https://listen.vatsim.net.evil.example/live/EDDF_TWR")).toBe(false);
    expect(needsPlayerWindow("not a url")).toBe(false);
  });
});
