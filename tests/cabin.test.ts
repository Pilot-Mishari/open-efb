import { describe, expect, it } from "vitest";
import { GREETINGS, getSessionSeat, randomSeat } from "../apps/web/src/lib/cabin";

describe("randomSeat", () => {
  it("always yields a realistic seat and never row 13", () => {
    for (let i = 0; i < 2000; i++) {
      const seat = randomSeat();
      expect(seat).toMatch(/^([1-9]|[12][0-9]|3[0-5])[A-F]$/);
      expect(seat).not.toMatch(/^13/);
    }
  });

  it("covers the first and last rows at the extremes", () => {
    expect(randomSeat(() => 0)).toBe("1A");
    expect(randomSeat(() => 0.999999)).toBe("35F");
  });
});

describe("getSessionSeat", () => {
  it("is stable across calls", () => {
    expect(getSessionSeat()).toBe(getSessionSeat());
  });
});

describe("GREETINGS", () => {
  it("has the eight requested languages, with Arabic marked right-to-left", () => {
    expect(GREETINGS.map((g) => g.lang)).toEqual(["en", "ar", "fr", "es", "de", "ru", "ja", "zh"]);
    expect(GREETINGS.filter((g) => g.dir === "rtl").map((g) => g.lang)).toEqual(["ar"]);
  });
});