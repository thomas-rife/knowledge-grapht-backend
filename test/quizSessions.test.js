import { describe, it } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
  QUIZ_MODES,
  SNAPSHOT_TYPES,
  buildSessionQuestionRows,
  buildSessionStreakSnapshot,
  normalizeLaunchSource,
  normalizeQuizMode,
  snapshotTypeForQuizMode,
  validateCompletionCounts,
} from "../src/quizSessions.js";

describe("Unified quiz-session contract", () => {
  it("accepts only the three new quiz modes", () => {
    equal(normalizeQuizMode("lesson"), QUIZ_MODES.LESSON);
    equal(normalizeQuizMode("DAILY_REVIEW"), QUIZ_MODES.DAILY_REVIEW);
    equal(normalizeQuizMode("node_quiz"), null);
  });

  it("keeps launch source separate from quiz mode", () => {
    equal(normalizeLaunchSource("notification", QUIZ_MODES.DAILY_REVIEW), "notification");
    equal(normalizeLaunchSource("", QUIZ_MODES.TOPIC_PRACTICE), "graph_node");
  });

  it("records a distinct recommendation snapshot type for every quiz mode", () => {
    equal(
      snapshotTypeForQuizMode(QUIZ_MODES.LESSON),
      SNAPSHOT_TYPES.POST_LESSON,
    );
    equal(
      snapshotTypeForQuizMode(QUIZ_MODES.DAILY_REVIEW),
      SNAPSHOT_TYPES.POST_DAILY_REVIEW,
    );
    equal(
      snapshotTypeForQuizMode(QUIZ_MODES.TOPIC_PRACTICE),
      SNAPSHOT_TYPES.POST_TOPIC_PRACTICE,
    );
    equal(snapshotTypeForQuizMode("legacy_review"), null);
  });

  it("freezes the before and after streak values on a completed session", () => {
    deepEqual(
      buildSessionStreakSnapshot(
        { current_streak: 3 },
        {
          current_streak: 4,
          longest_streak: 7,
          time_zone: "America/Los_Angeles",
        },
      ),
      {
        streak_previous_current: 3,
        streak_current: 4,
        streak_longest: 7,
        streak_time_zone: "America/Los_Angeles",
      },
    );
    equal(buildSessionStreakSnapshot(null, null), null);
    equal(
      buildSessionStreakSnapshot(null, {
        current_streak: 1,
        longest_streak: 1,
        time_zone: "UTC",
      }),
      null,
    );
  });

  it("captures the issued question state for reproducible sessions", () => {
    deepEqual(
      buildSessionQuestionRows([
        {
          question_id: 41,
          question_type: "multiple-choice",
          prompt: "What is x?",
          topics: ["Variables"],
          answer_options: ["1", "2"],
          answer: "2",
        },
      ]),
      [
        {
          question_id: 41,
          snapshot: {
            question_type: "multiple-choice",
            prompt: "What is x?",
            snippet: null,
            topics: ["Variables"],
            answer_options: ["1", "2"],
            answer: "2",
            image_url: null,
          },
        },
      ],
    );
  });

  it("only completes when every issued question is accounted for", () => {
    equal(validateCompletionCounts(10, 9, 8).valid, false);
    deepEqual(validateCompletionCounts(10, 10, 8), {
      valid: true,
      answered: 10,
      correct: 8,
    });
  });
});
