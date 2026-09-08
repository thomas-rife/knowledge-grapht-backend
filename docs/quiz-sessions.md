# Unified quiz sessions

`quiz_sessions` is the canonical session record for all student quizzes. The
academic mode is stored separately from the UI surface that launched it:

| `quiz_mode` | Meaning |
| --- | --- |
| `lesson` | The fixed quiz attached to a lesson |
| `daily_review` | The adaptive quiz selected from a recommendation snapshot |
| `topic_practice` | Practice targeted at a graph topic |
| `legacy_review` | Historical review data whose original launch surface is unknown |

`launch_source` records attribution such as `today`, `lesson_screen`,
`graph_node`, `notification`, or `resume`.

## API contract

Start any new quiz with `POST /user/quiz-sessions/start`. The request includes
`class_id`, `quiz_mode`, and `launch_source`, plus `lesson_id` for a lesson or
topic/recommendation context for review practice. The response includes a
`quiz_session_id` and the issued questions.

Complete it with `POST /user/quiz-sessions/:sessionId/complete`. Completion is
idempotent and only succeeds when `answered_count` equals the question count
recorded at session creation.

Abandon an unfinished quiz with `POST /user/quiz-sessions/:sessionId/abandon`.
The server derives `answered_count` and `correct_count` from persisted answers,
sets the session status to `abandoned`, and leaves `completed_at` empty. An
abandoned session does not count toward the student's study streak.

`quiz_session_questions` stores the ordered question set and a snapshot of each
question as it was issued. New `student_question_answers` rows use
`quiz_session_id` to connect response evidence to that set.

## Migration and compatibility

The migration is additive. It does not delete `student_lesson_sessions` or
`review_quiz_sessions`.

- Historical lesson completions are backfilled into `quiz_sessions`. Their
  exact historical question set is marked unavailable because it was never
  recorded.
- Historical review sessions and `question_ids_json` are backfilled, preserving
  question order where available.
- Existing review answer rows and recommendation snapshots are linked to the
  new canonical session.
- Legacy IDs remain on `quiz_sessions` for audit and reconciliation.

Apply pending migrations from the backend checkout with:

```sh
supabase db push --dry-run
supabase db push
```

The next migration slice will move answer grading and Leitner updates into one
transaction per submitted answer. Resume and expiration policies remain future
work.
