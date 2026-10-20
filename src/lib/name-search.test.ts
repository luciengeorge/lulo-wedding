import { describe, expect, it } from "vitest";

import { matches, nameKeys, normaliseName } from "./name-search";

const aboujaoude = nameKeys({ displayName: "Joseph & Mireille", surname: "Abou-Jaoudé" }, [
  { firstName: "Nour", lastName: "Abou-Jaoudé" },
]);

describe("normaliseName", () => {
  it("drops accents, case and punctuation", () => {
    expect(normaliseName("  Hélène  O'Brien-Saad ")).toBe("helene o brien saad");
  });
});

describe("nameKeys", () => {
  it("splits a display name on every way the sheet joins people", () => {
    const keys = nameKeys({ displayName: "Rae & Cherif, Sami + Maya / Lea et Tom and Nour", surname: "Haddad" }, []);
    expect([...keys.words].sort()).toEqual(["cherif", "haddad", "lea", "maya", "nour", "rae", "sami", "tom"]);
  });

  it("keeps a hyphenated surname both split and joined", () => {
    expect(aboujaoude.words.has("abou")).toBe(true);
    expect(aboujaoude.words.has("jaoude")).toBe(true);
    expect(aboujaoude.words.has("aboujaoude")).toBe(true);
  });

  it("includes people the couple named", () => {
    expect(aboujaoude.words.has("nour")).toBe(true);
  });
});

describe("matches", () => {
  it("finds a party with the accents left off", () => {
    expect(matches("mireille abou jaoude", aboujaoude)).toBe(true);
    expect(matches("Mireille Aboujaoudé", aboujaoude)).toBe(true);
  });

  it("needs two words, so a surname alone finds nothing", () => {
    expect(matches("Abou-Jaoudé", aboujaoude)).toBe(true);
    expect(matches("jaoude", aboujaoude)).toBe(false);
    expect(matches("joseph", aboujaoude)).toBe(false);
  });

  it("lets a party with no surname be found by its whole name", () => {
    const lucy = nameKeys({ displayName: "Lucy", surname: "" }, []);
    expect(matches("lucy", lucy)).toBe(true);
    expect(matches("Lucy!", lucy)).toBe(true);
    expect(matches("luc", lucy)).toBe(false);
  });

  it("requires every word to name someone in the party", () => {
    expect(matches("joseph haddad", aboujaoude)).toBe(false);
  });

  it("ignores 'et' and '&' in what was typed", () => {
    expect(matches("Joseph et Mireille", aboujaoude)).toBe(true);
    expect(matches("joseph & mireille", aboujaoude)).toBe(true);
  });

  it("allows the last word to be cut short, from three letters", () => {
    expect(matches("mireille abou jao", aboujaoude)).toBe(true);
    expect(matches("mireille abou ja", aboujaoude)).toBe(false);
    expect(matches("mir abou jaoude", aboujaoude)).toBe(false);
  });

  it("finds nothing for nothing", () => {
    expect(matches("   ", aboujaoude)).toBe(false);
  });
});
