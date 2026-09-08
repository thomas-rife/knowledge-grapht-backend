import { describe, it } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
  buildProgressSummary,
  buildTopicPerformance,
} from "../src/progress.js";

describe("Progress learning history", () => {
  it("separates completed and abandoned work while preserving activity totals", () => {
    const result = buildProgressSummary(
      [
        {
          id: "lesson-1",
          quiz_mode: "lesson",
          status: "completed",
          question_count: 10,
          answered_count: 10,
          correct_count: 8,
          completed_at: "2026-09-07T20:00:00.000Z",
          ended_at: "2026-09-07T20:00:00.000Z",
        },
        {
          id: "review-1",
          quiz_mode: "daily_review",
          status: "completed",
          question_count: 5,
          answered_count: 5,
          correct_count: 4,
          completed_at: "2026-09-08T20:00:00.000Z",
          ended_at: "2026-09-08T20:00:00.000Z",
        },
        {
          id: "practice-1",
          quiz_mode: "topic_practice",
          status: "abandoned",
          question_count: 10,
          answered_count: 2,
          correct_count: 1,
          ended_at: "2026-09-08T21:00:00.000Z",
        },
      ],
      "UTC",
      new Date("2026-09-08T22:00:00.000Z"),
    );

    equal(result.summary.completed_quizzes, 2);
    equal(result.summary.abandoned_quizzes, 1);
    equal(result.summary.questions_answered, 17);
    equal(result.summary.correct_answers, 13);
    equal(result.streak.current_streak, 2);
    deepEqual(
      result.mode_breakdown.map((mode) => mode.completed),
      [1, 1, 0],
    );
    equal(result.daily_activity.at(-1).completed_quizzes, 1);
    equal(result.daily_activity.at(-1).questions_answered, 7);
  });

  it("uses the latest answer and immutable question topics", () => {
    const topics = buildTopicPerformance(
      [
        {
          quiz_session_id: "session-1",
          question_id: 10,
          is_correct: false,
          answered_at: "2026-09-08T20:00:00.000Z",
        },
        {
          quiz_session_id: "session-1",
          question_id: 10,
          is_correct: true,
          answered_at: "2026-09-08T20:01:00.000Z",
        },
      ],
      [
        {
          quiz_session_id: "session-1",
          question_id: 10,
          question_snapshot: { topics: ["Variables", "Conditionals"] },
        },
      ],
    );

    deepEqual(topics, [
      { topic: "Conditionals", attempts: 1, correct: 1, accuracy: 1 },
      { topic: "Variables", attempts: 1, correct: 1, accuracy: 1 },
    ]);
  });
});
