import { describe, expect, it } from "vitest";
import { displaySavedDirectionText, parseSavedDirectionReference } from "./savedDirectionReference";

describe("saved direction reference parser", () => {
  it("parses ACE-style cleaned directions without changing saved wording", () => {
    const directionsClear = [
      "Road sequence reference:",
      "US-22 → OH-9 → ACE Lease Road → Pad",
      "",
      "Step-by-step directions:",
      "1. Travel east on US-22 for 4.7 miles.",
      "2. Turn right onto OH-9.",
      "3. Continue to the ACE Lease Road gate.",
    ].join("\n");

    const parsed = parseSavedDirectionReference({ directionsClear });

    expect(parsed).toMatchObject({
      rawText: directionsClear,
      source: "directions_clear",
      structured: true,
      roadSequenceReference: "US-22 → OH-9 → ACE Lease Road → Pad",
      orderedSteps: [
        { number: 1, instruction: "Travel east on US-22 for 4.7 miles." },
        { number: 2, instruction: "Turn right onto OH-9." },
        { number: 3, instruction: "Continue to the ACE Lease Road gate." },
      ],
      additionalNotes: [],
    });
  });

  it("parses ALABASTER-style cleaned directions and keeps remaining notes", () => {
    const parsed = parseSavedDirectionReference({
      directionsClear: [
        "Road sequence reference:",
        "OH-78 → Bean Ridge Rd → Lease Road → Pad",
        "Use the west entrance only.",
        "Step-by-step directions:",
        "1. Start on OH-78.",
        "2. Turn left onto Bean Ridge Rd and continue 2.12 miles.",
        "Call dispatch before opening the gate.",
      ].join("\n"),
    });

    expect(parsed?.roadSequenceReference).toBe("OH-78 → Bean Ridge Rd → Lease Road → Pad");
    expect(parsed?.orderedSteps).toEqual([
      { number: 1, instruction: "Start on OH-78." },
      { number: 2, instruction: "Turn left onto Bean Ridge Rd and continue 2.12 miles." },
    ]);
    expect(parsed?.additionalNotes).toEqual([
      "Use the west entrance only.",
      "Call dispatch before opening the gate.",
    ]);
  });

  it("preserves a written_directions-only record as an unstructured reference", () => {
    const writtenDirections = "From the red barn, continue 0.8 miles.\nGate is on the right.";
    const parsed = parseSavedDirectionReference({ writtenDirections });

    expect(parsed).toMatchObject({
      rawText: writtenDirections,
      displayText: writtenDirections,
      source: "written_directions",
      structured: false,
      roadSequenceReference: null,
      orderedSteps: [],
      additionalNotes: [writtenDirections],
    });
  });

  it("returns the road sequence, numbered steps, and additional notes separately", () => {
    const parsed = parseSavedDirectionReference({
      directionsClear: [
        "Approach from the north.",
        "Road sequence reference:",
        "US-250 → CR-10 → Pad",
        "Step-by-step directions:",
        "1. Leave US-250 at CR-10.",
        "2. Continue 1.3 miles.",
        "Do not use the south gate.",
      ].join("\n"),
    });

    expect(parsed?.roadSequenceReference).toBe("US-250 → CR-10 → Pad");
    expect(parsed?.orderedSteps.map((step) => step.number)).toEqual([1, 2]);
    expect(parsed?.additionalNotes).toEqual(["Approach from the north.", "Do not use the south gate."]);
    expect(parsed?.orderedBlocks.map((block) => block.kind)).toEqual(["notes", "sequence", "steps", "notes"]);
  });

  it("does not invent missing numbered steps and leaves malformed numbering as a note", () => {
    const parsed = parseSavedDirectionReference({
      directionsClear: [
        "Step-by-step directions:",
        "1. Start on OH-9.",
        "2) This malformed line stays saved text.",
        "3. Turn at the signed gate.",
      ].join("\n"),
    });

    expect(parsed?.orderedSteps).toEqual([
      { number: 1, instruction: "Start on OH-9." },
      { number: 3, instruction: "Turn at the signed gate." },
    ]);
    expect(parsed?.additionalNotes).toEqual(["2) This malformed line stays saved text."]);
    expect(parsed?.orderedBlocks.map((block) => block.kind)).toEqual(["steps", "notes", "steps"]);
  });

  it("normalizes actual and encoded newline formatting only for display", () => {
    const directionsClear = "Road sequence reference:\\r\\nOH-9 → Pad\\nStep-by-step directions:\\r1. Continue to the pin.";
    const parsed = parseSavedDirectionReference({ directionsClear });

    expect(displaySavedDirectionText(directionsClear)).toBe(
      "Road sequence reference:\nOH-9 → Pad\nStep-by-step directions:\n1. Continue to the pin.",
    );
    expect(parsed?.roadSequenceReference).toBe("OH-9 → Pad");
    expect(parsed?.orderedSteps).toEqual([{ number: 1, instruction: "Continue to the pin." }]);
    expect(parsed?.rawText).toBe(directionsClear);
  });

  it("keeps Lease Road, Pad, and Gate wording as text only", () => {
    const parsed = parseSavedDirectionReference({
      directionsClear: [
        "Road sequence reference:",
        "OH-9 → Lease Road → Pad",
        "Step-by-step directions:",
        "1. Continue on Lease Road to the Gate and Pad.",
      ].join("\n"),
    });

    expect(parsed?.roadSequenceReference).toBe("OH-9 → Lease Road → Pad");
    expect(parsed?.orderedSteps[0]?.instruction).toBe("Continue on Lease Road to the Gate and Pad.");
  });

  it("does not produce a road identity or geometry from saved text", () => {
    const parsed = parseSavedDirectionReference({
      directionsClear: "Road sequence reference:\nOH-9 → Maynard Rd → Pad",
    });

    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed ?? {})).not.toContain("roadId");
    expect(Object.keys(parsed ?? {})).not.toContain("roadIdentity");
    expect(Object.keys(parsed ?? {})).not.toContain("geometry");
  });

  it("uses directions_clear for display while preserving written_directions verbatim", () => {
    const directionsClear = "Step-by-step directions:\n1. Use the reviewed wording.";
    const writtenDirections = "Older wording stays here exactly.  ";
    const parsed = parseSavedDirectionReference({ directionsClear, writtenDirections });

    expect(parsed?.source).toBe("directions_clear");
    expect(parsed?.rawText).toBe(directionsClear);
    expect(parsed?.preservedSourceText).toEqual({ directionsClear, writtenDirections });
  });

  it("returns null when neither saved source contains text", () => {
    expect(parseSavedDirectionReference({ directionsClear: "  ", writtenDirections: null })).toBeNull();
  });
});
