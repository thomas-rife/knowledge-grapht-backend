import {
  buildStreakSummary,
  dateKeyForInstant,
  normalizeTimeZone,
  shiftDateKey,
} from "./today.js";

const DISPLAYED_MODES = ["lesson", "daily_review", "topic_practice"];

const finiteCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function buildProgressSummary(
  sessions,
  timeZone,
  now = new Date(),
) {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const completed = safeSessions.filter(
    (session) => session?.status === "completed" && session?.completed_at,
  );
  const abandoned = safeSessions.filter(
    (session) => session?.status === "abandoned",
  );
  const answeredCount = safeSessions.reduce(
    (sum, session) => sum + finiteCount(session?.answered_count),
    0,
  );
  const correctCount = safeSessions.reduce(
    (sum, session) => sum + finiteCount(session?.correct_count),
    0,
  );
  const today = dateKeyForInstant(now, normalizedTimeZone);
  const dailyByDate = new Map(
    Array.from({ length: 7 }, (_, index) => {
      const date = shiftDateKey(today, index - 6);
      return [
        date,
        {
          date,
          completed_quizzes: 0,
          questions_answered: 0,
          correct_answers: 0,
        },
      ];
    }),
  );

  for (const session of safeSessions) {
    const activityAt =
      session?.status === "completed"
        ? session?.completed_at
        : session?.ended_at || session?.last_activity_at;
    const date = dateKeyForInstant(activityAt, normalizedTimeZone);
    const day = dailyByDate.get(date);
    if (!day) continue;

    if (session?.status === "completed") day.completed_quizzes += 1;
    day.questions_answered += finiteCount(session?.answered_count);
    day.correct_answers += finiteCount(session?.correct_count);
  }

  const modeBreakdown = DISPLAYED_MODES.map((quizMode) => ({
    quiz_mode: quizMode,
    completed: completed.filter((session) => session?.quiz_mode === quizMode).length,
  }));
  const legacyCompleted = completed.filter(
    (session) => !DISPLAYED_MODES.includes(session?.quiz_mode),
  ).length;
  if (legacyCompleted > 0) {
    modeBreakdown.push({ quiz_mode: "legacy_review", completed: legacyCompleted });
  }

  const streak = buildStreakSummary(
    completed.map((session) => session.completed_at),
    normalizedTimeZone,
    now,
  );

  return {
    summary: {
      completed_quizzes: completed.length,
      abandoned_quizzes: abandoned.length,
      questions_answered: answeredCount,
      correct_answers: correctCount,
      accuracy: answeredCount > 0 ? correctCount / answeredCount : null,
      study_days: new Set(
        completed
          .map((session) =>
            dateKeyForInstant(session.completed_at, normalizedTimeZone),
          )
          .filter(Boolean),
      ).size,
    },
    streak,
    daily_activity: Array.from(dailyByDate.values()).map((day) => ({
      ...day,
      accuracy:
        day.questions_answered > 0
          ? day.correct_answers / day.questions_answered
          : null,
    })),
    mode_breakdown: modeBreakdown,
    recent_sessions: [...safeSessions]
      .filter((session) =>
        ["completed", "abandoned"].includes(session?.status),
      )
      .sort((left, right) => {
        const leftTime = new Date(
          left?.ended_at || left?.completed_at || left?.started_at || 0,
        ).getTime();
        const rightTime = new Date(
          right?.ended_at || right?.completed_at || right?.started_at || 0,
        ).getTime();
        return rightTime - leftTime;
      })
      .slice(0, 8)
      .map((session) => ({
        id: session.id,
        quiz_mode: session.quiz_mode,
        status: session.status,
        focus_topic_label: session.focus_topic_label || null,
        question_count: finiteCount(session.question_count),
        answered_count: finiteCount(session.answered_count),
        correct_count: finiteCount(session.correct_count),
        started_at: session.started_at || null,
        ended_at: session.ended_at || session.completed_at || null,
      })),
  };
}

export function buildTopicPerformance(answers, issuedQuestions) {
  const issuedByQuestion = new Map();
  for (const issued of Array.isArray(issuedQuestions) ? issuedQuestions : []) {
    issuedByQuestion.set(
      `${issued?.quiz_session_id}:${issued?.question_id}`,
      issued?.question_snapshot || {},
    );
  }

  // A session should normally have one answer per question. If historical data
  // contains retries, use the latest response for student-facing performance.
  const latestAnswers = new Map();
  for (const answer of Array.isArray(answers) ? answers : []) {
    if (!answer?.quiz_session_id || answer?.question_id == null) continue;
    const key = `${answer.quiz_session_id}:${answer.question_id}`;
    const previous = latestAnswers.get(key);
    const previousTime = new Date(previous?.answered_at || 0).getTime();
    const answerTime = new Date(answer?.answered_at || 0).getTime();
    if (!previous || answerTime >= previousTime) latestAnswers.set(key, answer);
  }

  const topicStats = new Map();
  for (const [key, answer] of latestAnswers) {
    const snapshot = issuedByQuestion.get(key);
    const topics = Array.isArray(snapshot?.topics) ? snapshot.topics : [];
    for (const rawTopic of topics) {
      const topic = String(rawTopic || "").trim();
      if (!topic) continue;
      const stats = topicStats.get(topic) || { attempts: 0, correct: 0 };
      stats.attempts += 1;
      if (answer?.is_correct === true) stats.correct += 1;
      topicStats.set(topic, stats);
    }
  }

  return Array.from(topicStats.entries())
    .map(([topic, stats]) => ({
      topic,
      attempts: stats.attempts,
      correct: stats.correct,
      accuracy: stats.attempts > 0 ? stats.correct / stats.attempts : null,
    }))
    .sort(
      (left, right) =>
        right.attempts - left.attempts ||
        (right.accuracy || 0) - (left.accuracy || 0) ||
        left.topic.localeCompare(right.topic),
    );
}
