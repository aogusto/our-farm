import { describe, it, expect } from "vitest";
import { mulberry32, hashString } from "./rng";

describe("mulberry32", () => {
  it("produz a mesma sequência pra mesma seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produz sequências distintas pra seeds distintas", () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    expect(a()).not.toBe(b());
  });

  it("retorna valores em [0, 1)", () => {
    const r = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hashString", () => {
  it("é determinístico", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("produz hashes distintos pra inputs distintos", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("retorna inteiro não-negativo em 32 bits", () => {
    const h = hashString("our-farm");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});
