import { describe, it } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
  buildDeterministicRecommendationExplanation,
  buildStreakSummary,
  normalizeTimeZone,
} from "../src/today.js";

describe("Today learning state", () => {
  it("counts one streak day even when multiple quizzes are completed", () => {
    const result = buildStreakSummary(
      [
        "2026-09-02T18:00:00.000Z",
        "2026-09-03T18:00:00.000Z",
        "2026-09-03T20:00:00.000Z",
        "2026-09-04T18:00:00.000Z",
      ],
      "UTC",
      new Date("2026-09-04T21:00:00.000Z"),
    );

    equal(result.current_streak, 3);
    equal(result.today_completed_count, 1);
    equal(result.studied_today, true);
  });

  it("keeps yesterday's streak alive until the current day ends", () => {
    const result = buildStreakSummary(
      ["2026-09-02T18:00:00.000Z", "2026-09-03T18:00:00.000Z"],
      "UTC",
      new Date("2026-09-04T10:00:00.000Z"),
    );

    equal(result.current_streak, 2);
    equal(result.studied_today, false);
    deepEqual(
      result.week.slice(-2).map((day) => day.completed),
      [true, false],
    );
  });

  it("falls back to UTC for invalid time zones", () => {
    equal(normalizeTimeZone("definitely/not-a-zone"), "UTC");
  });

  it("grounds fallback explanations in downstream graph topics", () => {
    equal(
      buildDeterministicRecommendationExplanation({
        topic: "Variables",
        supports: ["Conditionals", "Loops"],
        dueStatus: "overdue",
      }),
      "Variables is overdue and is your highest-priority review right now. Strengthening it will support Conditionals, Loops.",
    );
  });
});
