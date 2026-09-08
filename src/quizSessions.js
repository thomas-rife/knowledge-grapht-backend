export const QUIZ_MODES = Object.freeze({
  LESSON: "lesson",
  DAILY_REVIEW: "daily_review",
  TOPIC_PRACTICE: "topic_practice",
});

export const SNAPSHOT_TYPES = Object.freeze({
  POST_LESSON: "post_lesson",
  POST_DAILY_REVIEW: "post_daily_review",
  POST_TOPIC_PRACTICE: "post_topic_practice",
});

const launchSources = new Set([
  "today",
  "lesson_screen",
  "graph_node",
  "notification",
  "resume",
  "unknown",
]);

export function normalizeQuizMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(QUIZ_MODES).includes(normalized) ? normalized : null;
}

export function normalizeLaunchSource(value, quizMode) {
  const normalized = String(value || "").trim().toLowerCase();
  if (launchSources.has(normalized)) return normalized;
  if (quizMode === QUIZ_MODES.LESSON) return "lesson_screen";
  if (quizMode === QUIZ_MODES.DAILY_REVIEW) return "today";
  if (quizMode === QUIZ_MODES.TOPIC_PRACTICE) return "graph_node";
  return "unknown";
}

export function snapshotTypeForQuizMode(quizMode) {
  if (quizMode === QUIZ_MODES.LESSON) return SNAPSHOT_TYPES.POST_LESSON;
  if (quizMode === QUIZ_MODES.DAILY_REVIEW) {
    return SNAPSHOT_TYPES.POST_DAILY_REVIEW;
  }
  if (quizMode === QUIZ_MODES.TOPIC_PRACTICE) {
    return SNAPSHOT_TYPES.POST_TOPIC_PRACTICE;
  }
  return null;
}

export function buildSessionStreakSnapshot(streakBefore, streakAfter) {
  if (!streakBefore || !streakAfter) return null;

  const nonnegativeInteger = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  };

  return {
    streak_previous_current: nonnegativeInteger(streakBefore?.current_streak),
    streak_current: nonnegativeInteger(streakAfter.current_streak),
    streak_longest: nonnegativeInteger(streakAfter.longest_streak),
    streak_time_zone:
      typeof streakAfter.time_zone === "string" && streakAfter.time_zone
        ? streakAfter.time_zone
        : "UTC",
  };
}

export function buildSessionQuestionRows(questions) {
  if (!Array.isArray(questions)) return [];

  return questions
    .filter((question) => Number.isFinite(Number(question?.question_id)))
    .map((question) => ({
      question_id: Number(question.question_id),
      snapshot: {
        question_type: question.question_type ?? null,
        prompt: question.prompt ?? null,
        snippet: question.snippet ?? null,
        topics: Array.isArray(question.topics) ? question.topics : [],
        answer_options: Array.isArray(question.answer_options)
          ? question.answer_options
          : [],
        answer: question.answer ?? null,
        image_url: question.image_url ?? null,
      },
    }));
}

export function validateCompletionCounts(questionCount, answeredCount, correctCount) {
  const expected = Number(questionCount);
  const answered = Number(answeredCount);
  const correct = Number(correctCount);

  if (!Number.isInteger(expected) || expected < 1) {
    return { valid: false, error: "Quiz session has an invalid question count" };
  }
  if (!Number.isInteger(answered) || answered !== expected) {
    return { valid: false, error: "All issued questions must be answered before completion" };
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > answered) {
    return { valid: false, error: "Correct-answer count is outside the valid range" };
  }

  return { valid: true, answered, correct };
}
