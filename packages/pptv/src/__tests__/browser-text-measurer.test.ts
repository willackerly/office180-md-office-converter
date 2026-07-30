// Tests: CONTRACT:C8-PPTV-TEXT-FIT.1.1

import { describe, expect, it } from "vitest";

import {
  browserEnvironmentFromUserAgent,
  browserFontAlias,
  preparePptvBrowserTextMeasurer,
} from "../browser/text-measurer.js";

describe("browser C8 measurement foundation", () => {
  it("labels Chromium, Firefox, WebKit, and unknown user agents", () => {
    expect(
      browserEnvironmentFromUserAgent(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/146.0.1.2 Safari/537.36",
      ),
    ).toMatchObject({ engine: "chromium", engineVersion: "146.0.1.2" });
    expect(
      browserEnvironmentFromUserAgent("Mozilla/5.0 Firefox/147.0"),
    ).toMatchObject({ engine: "firefox", engineVersion: "147.0" });
    expect(
      browserEnvironmentFromUserAgent(
        "Mozilla/5.0 AppleWebKit/620.1 Version/26.0 Safari/620.1",
      ),
    ).toMatchObject({ engine: "webkit", engineVersion: "26.0" });
    expect(browserEnvironmentFromUserAgent("test-agent")).toEqual({
      userAgent: "test-agent",
      engine: "unknown",
      engineVersion: "unknown",
    });
  });

  it("derives private aliases from exact hashes and validates inputs", () => {
    const hash = "a".repeat(64);
    expect(browserFontAlias(hash, 400, "normal")).toBe(
      "Pptv_aaaaaaaaaaaaaaaaaaaaaaaa_400_normal_0",
    );
    expect(browserFontAlias(hash, 700, "italic", 2)).toBe(
      "Pptv_aaaaaaaaaaaaaaaaaaaaaaaa_700_italic_2",
    );
    expect(() => browserFontAlias("AA", 400, "normal")).toThrow(
      /lowercase SHA-256/u,
    );
  });

  it("fails clearly when invoked outside a browser environment", async () => {
    await expect(preparePptvBrowserTextMeasurer([])).rejects.toThrow(
      /requires Document, FontFace/u,
    );
  });
});
