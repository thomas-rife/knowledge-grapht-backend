begin;

alter table public.review_recommendation_snapshots
  drop constraint if exists review_recommendation_snapshots_snapshot_type_check;

alter table public.review_recommendation_snapshots
  add constraint review_recommendation_snapshots_snapshot_type_check
  check (
    snapshot_type in (
      'post_lesson',
      'post_review_quiz',
      'post_daily_review',
      'post_topic_practice'
    )
  );

update public.review_recommendation_snapshots as snapshot
set snapshot_type = case session.quiz_mode
  when 'daily_review' then 'post_daily_review'
  when 'topic_practice' then 'post_topic_practice'
  else snapshot.snapshot_type
end
from public.quiz_sessions as session
where snapshot.source_quiz_session_id = session.id
  and snapshot.snapshot_type = 'post_review_quiz'
  and session.quiz_mode in ('daily_review', 'topic_practice');

comment on column public.review_recommendation_snapshots.snapshot_type is
  'Origin of the snapshot, including post_lesson, post_daily_review, post_topic_practice, and legacy post_review_quiz.';

commit;
