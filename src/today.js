const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeTimeZone(value) {
  const timeZone = typeof value === "string" ? value.trim() : "";
  if (!timeZone || timeZone.length > 80) return "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function dateKeyForInstant(instant, timeZone = "UTC") {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function shiftDateKey(dateKey, deltaDays) {
  if (!DATE_KEY_PATTERN.test(String(dateKey))) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

export function buildStreakSummary(
  completedAtValues,
  timeZone,
  now = new Date(),
) {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const activityCounts = new Map();

  for (const value of completedAtValues || []) {
    const dateKey = dateKeyForInstant(value, normalizedTimeZone);
    if (!dateKey) continue;
    activityCounts.set(dateKey, (activityCounts.get(dateKey) || 0) + 1);
  }

  const today = dateKeyForInstant(now, normalizedTimeZone);
  const yesterday = shiftDateKey(today, -1);
  const studiedToday = activityCounts.has(today);
  let cursor = studiedToday
    ? today
    : activityCounts.has(yesterday)
      ? yesterday
      : null;
  let currentStreak = 0;

  while (cursor && activityCounts.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  const sortedDays = Array.from(activityCounts.keys()).sort();
  let longestStreak = 0;
  let run = 0;
  let previous = null;
  for (const day of sortedDays) {
    run = previous && shiftDateKey(previous, 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = day;
  }

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(today, index - 6);
    return {
      date,
      completed: activityCounts.has(date),
      completions: activityCounts.get(date) || 0,
    };
  });

  return {
    time_zone: normalizedTimeZone,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    studied_today: studiedToday,
    today_completed_count: activityCounts.get(today) || 0,
    daily_goal: 1,
    week,
  };
}

export function buildDeterministicRecommendationExplanation({
  topic,
  prerequisites = [],
  supports = [],
  dueStatus = "recommended",
}) {
  const cleanTopic = String(topic || "this topic").trim() || "this topic";
  const whyNow =
    dueStatus === "overdue"
      ? `${cleanTopic} is overdue and is your highest-priority review right now.`
      : dueStatus === "due_today"
        ? `${cleanTopic} is due today and is your highest-priority review.`
        : `${cleanTopic} is currently your highest-priority review topic.`;

  if (supports.length > 0) {
    return `${whyNow} Strengthening it will support ${supports.slice(0, 3).join(", ")}.`;
  }
  if (prerequisites.length > 0) {
    return `${whyNow} It builds on ${prerequisites.slice(0, 3).join(", ")}, so practice will reinforce that chain.`;
  }
  return `${whyNow} A short targeted quiz will reinforce it before you move on.`;
}
