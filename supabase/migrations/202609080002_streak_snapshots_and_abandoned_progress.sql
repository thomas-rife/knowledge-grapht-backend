begin;

alter table public.quiz_sessions
  add column if not exists streak_previous_current integer,
  add column if not exists streak_current integer,
  add column if not exists streak_longest integer,
  add column if not exists streak_time_zone text;

alter table public.quiz_sessions
  drop constraint if exists quiz_sessions_streak_values_check;

alter table public.quiz_sessions
  add constraint quiz_sessions_streak_values_check
  check (
    (streak_previous_current is null or streak_previous_current >= 0)
    and (streak_current is null or streak_current >= 0)
    and (streak_longest is null or streak_longest >= 0)
  );

create or replace function public.abandon_quiz_session(
  p_session_id uuid,
  p_student_id uuid
)
returns public.quiz_sessions
language plpgsql
set search_path = public
as $$
declare
  session_row public.quiz_sessions%rowtype;
  actual_answered_count integer := 0;
  actual_correct_count integer := 0;
  topic_result record;
begin
  select *
  into session_row
  from public.quiz_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Quiz session not found';
  end if;

  if session_row.student_id <> p_student_id then
    raise exception 'Quiz session does not belong to the authenticated student';
  end if;

  if session_row.status = 'completed' then
    raise exception 'A completed quiz session cannot be abandoned';
  end if;

  if session_row.status = 'abandoned' then
    return session_row;
  end if;

  if session_row.status = 'expired' then
    raise exception 'An expired quiz session cannot be abandoned';
  end if;

  select
    count(*)::integer,
    count(*) filter (where latest_answer.is_correct)::integer
  into actual_answered_count, actual_correct_count
  from (
    select distinct on (answer.question_id)
      answer.question_id,
      answer.is_correct
    from public.student_question_answers as answer
    join public.quiz_session_questions as issued
      on issued.quiz_session_id = p_session_id
      and issued.question_id = answer.question_id
    where answer.quiz_session_id = p_session_id
      and answer.student_id = p_student_id
    order by answer.question_id, answer.answered_at desc
  ) as latest_answer;

  for topic_result in
    with latest_answers as (
      select distinct on (answer.question_id)
        answer.question_id,
        answer.is_correct
      from public.student_question_answers as answer
      join public.quiz_session_questions as issued
        on issued.quiz_session_id = p_session_id
        and issued.question_id = answer.question_id
      where answer.quiz_session_id = p_session_id
        and answer.student_id = p_student_id
      order by answer.question_id, answer.answered_at desc
    ), tagged_answers as (
      select
        trim(topic.value) as node_label,
        latest.is_correct
      from latest_answers as latest
      join public.quiz_session_questions as issued
        on issued.quiz_session_id = p_session_id
        and issued.question_id = latest.question_id
      cross join lateral jsonb_array_elements_text(
        case
          when jsonb_typeof(issued.question_snapshot -> 'topics') = 'array'
            then issued.question_snapshot -> 'topics'
          else '[]'::jsonb
        end
      ) as topic(value)
      where trim(topic.value) <> ''
    )
    select
      node_label,
      count(*)::integer as attempts,
      count(*) filter (where is_correct)::integer as correct
    from tagged_answers
    group by node_label
  loop
    insert into public.leitner_schedule as schedule (
      student_id,
      class_id,
      node_label,
      total_attempts,
      total_correct,
      last_quiz_attempts,
      last_quiz_correct,
      box,
      streak,
      last_reviewed,
      next_review
    ) values (
      p_student_id,
      session_row.class_id,
      topic_result.node_label,
      topic_result.attempts,
      topic_result.correct,
      topic_result.attempts,
      topic_result.correct,
      1,
      0,
      now(),
      now() + interval '1 day'
    )
    on conflict (student_id, class_id, node_label) do update
    set
      total_attempts = coalesce(schedule.total_attempts, 0)
        + excluded.total_attempts,
      total_correct = coalesce(schedule.total_correct, 0)
        + excluded.total_correct,
      last_quiz_attempts = excluded.last_quiz_attempts,
      last_quiz_correct = excluded.last_quiz_correct,
      box = case
        when excluded.last_quiz_correct::numeric
          / nullif(excluded.last_quiz_attempts, 0) < 0.9
          then greatest(1, coalesce(schedule.box, 1) - 1)
        else coalesce(schedule.box, 1)
      end,
      streak = case
        when excluded.last_quiz_correct::numeric
          / nullif(excluded.last_quiz_attempts, 0) < 0.9
          then 0
        else coalesce(schedule.streak, 0)
      end,
      last_reviewed = now(),
      next_review = now() + interval '1 day';
  end loop;

  update public.quiz_sessions
  set
    answered_count = actual_answered_count,
    correct_count = actual_correct_count,
    status = 'abandoned',
    completed_at = null,
    ended_at = now(),
    last_activity_at = now(),
    updated_at = now()
  where id = p_session_id
  returning * into session_row;

  return session_row;
end;
$$;

revoke all on function public.abandon_quiz_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.abandon_quiz_session(uuid, uuid)
  to service_role;

comment on function public.abandon_quiz_session(uuid, uuid) is
  'Atomically preserves partial answer evidence in Leitner state and marks an unfinished quiz abandoned.';

comment on column public.quiz_sessions.streak_previous_current is
  'Current daily study streak immediately before this session completed.';
comment on column public.quiz_sessions.streak_current is
  'Current daily study streak immediately after this session completed.';
comment on column public.quiz_sessions.streak_longest is
  'Longest daily study streak immediately after this session completed.';
comment on column public.quiz_sessions.streak_time_zone is
  'IANA time zone used to calculate the stored streak snapshot.';

commit;
