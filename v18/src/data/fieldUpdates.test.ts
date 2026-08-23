import { describe, expect, it } from "vitest";
import { validateFieldUpdate, validateFieldUpdates } from "./fieldUpdates";

const safeRow = {
  id: "333598ca-37b3-4b44-9411-a490cc3da672",
  category: "road_closure",
  body: "County Road 10 is temporarily closed at the bridge.",
  company_tag: null,
  pad_id: null,
  road_name: "County Road 10",
  latitude: null,
  longitude: null,
  status: "active",
  expires_at: null,
  created_at: "2026-08-23T12:00:00Z",
  display_name: "Field Member",
  username: null,
  profile_company: null,
  job_role: "Driver",
  verified_company_rep: false,
  badge: null,
  helpful_count: 2,
  confirm_count: 1,
  comment_count: 0,
};

describe("V18 public Field Updates adapter", () => {
  it("maps only the selected public display contract", () => {
    expect(validateFieldUpdate(safeRow)).toMatchObject({
      id: safeRow.id,
      body: safeRow.body,
      roadName: safeRow.road_name,
      helpfulCount: 2,
    });
  });

  it("rejects private or unexpected fields instead of leaking them", () => {
    expect(validateFieldUpdate({ ...safeRow, author_id: "333598ca-37b3-4b44-9411-a490cc3da672" })).toBeNull();
    expect(validateFieldUpdate({ ...safeRow, private_review_notes: "do not expose" })).toBeNull();
    expect(validateFieldUpdate({ ...safeRow, latitude: 40, longitude: null })).toBeNull();
  });

  it("fails closed for oversized and partially invalid responses", () => {
    expect(validateFieldUpdates([safeRow, { ...safeRow, body: "bad\u0000text" }])).toBeNull();
    expect(validateFieldUpdates(Array.from({ length: 41 }, () => safeRow))).toBeNull();
  });
});
