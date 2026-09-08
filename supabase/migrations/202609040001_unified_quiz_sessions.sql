begin;

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  client_session_id uuid,
  student_id uuid not null references public.students(student_id) on delete cascade,
  class_id bigint not null references public.classes(class_id) on delete cascade,
  quiz_mode text not null,
  launch_source text not null default 'unknown',
  status text not null default 'in_progress',
  lesson_id bigint references public.lessons(lesson_id) on delete set null,
  focus_node_id text,
  focus_topic_label text,
  recommendation_snapshot_id uuid references public.review_recommendation_snapshots(id) on delete set null,
  score_at_selection double precision,
  question_count integer not null default 0,
  answered_count integer not null default 0,
  correct_count integer not null default 0,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  legacy_lesson_session_id uuid unique,
  legacy_review_quiz_session_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_sessions_mode_check
    check (quiz_mode in ('lesson', 'daily_review', 'topic_practice', 'legacy_review')),
  constraint quiz_sessions_status_check
    check (status in ('in_progress', 'paused', 'completed', 'abandoned', 'expired')),
  constraint quiz_sessions_counts_check
    check (
      question_count >= 0
      and answered_count >= 0
      and correct_count >= 0
      and correct_count <= answered_count
      and answered_count <= question_count
    ),
  constraint quiz_sessions_lesson_context_check
    check (quiz_mode <> 'lesson' or lesson_id is not null),
  constraint quiz_sessions_completion_check
    check (
      (status = 'completed' and completed_at is not null)
      or (status <> 'completed')
    ),
  constraint quiz_sessions_client_session_unique unique (student_id, client_session_id)
);

create index if not exists quiz_sessions_student_class_started_idx
  on public.quiz_sessions (student_id, class_id, started_at desc);

create index if not exists quiz_sessions_student_class_completed_idx
  on public.quiz_sessions (student_id, class_id, completed_at desc)
  where status = 'completed';

create index if not exists quiz_sessions_recommendation_snapshot_idx
  on public.quiz_sessions (recommendation_snapshot_id)
  where recommendation_snapshot_id is not null;

create table if not exists public.quiz_session_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id bigint not null references public.questions(question_id) on delete restrict,
  position integer not null,
  question_snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  constraint quiz_session_questions_position_check check (position > 0),
  constraint quiz_session_questions_session_position_unique unique (quiz_session_id, position),
  constraint quiz_session_questions_session_question_unique unique (quiz_session_id, question_id)
);

create index if not exists quiz_session_questions_question_idx
  on public.quiz_session_questions (question_id);

alter table public.student_question_answers
  add column if not exists quiz_session_id uuid
    references public.quiz_sessions(id) on delete set null;

create index if not exists student_question_answers_quiz_session_idx
  on public.student_question_answers (quiz_session_id, answered_at);

alter table public.review_recommendation_snapshots
  add column if not exists source_quiz_session_id uuid
    references public.quiz_sessions(id) on delete set null;

create index if not exists review_snapshots_source_quiz_session_idx
  on public.review_recommendation_snapshots (source_quiz_session_id)
  where source_quiz_session_id is not null;

insert into public.quiz_sessions (
  student_id,
  class_id,
  quiz_mode,
  launch_source,
  status,
  lesson_id,
  question_count,
  answered_count,
  correct_count,
  started_at,
  last_activity_at,
  completed_at,
  ended_at,
  metadata,
  legacy_lesson_session_id
)
select
  legacy.student_id,
  legacy.class_id,
  'lesson',
  'legacy_unknown',
  'completed',
  legacy.lesson_id,
  greatest(coalesce(legacy.num_questions_total, 0)::integer, 0),
  greatest(coalesce(legacy.num_questions_total, 0)::integer, 0),
  least(
    greatest(coalesce(legacy.num_correct, 0)::integer, 0),
    greatest(coalesce(legacy.num_questions_total, 0)::integer, 0)
  ),
  legacy.completed_at,
  legacy.completed_at,
  legacy.completed_at,
  legacy.completed_at,
  jsonb_build_object('backfill', 'student_lesson_sessions', 'question_set', 'unavailable'),
  legacy.id
from public.student_lesson_sessions as legacy
where legacy.student_id is not null
  and legacy.class_id is not null
  and legacy.lesson_id is not null
on conflict (legacy_lesson_session_id) do nothing;

insert into public.quiz_sessions (
  student_id,
  class_id,
  quiz_mode,
  launch_source,
  status,
  focus_topic_label,
  recommendation_snapshot_id,
  score_at_selection,
  question_count,
  answered_count,
  correct_count,
  started_at,
  last_activity_at,
  completed_at,
  ended_at,
  metadata,
  legacy_review_quiz_session_id
)
select
  legacy.student_id,
  legacy.class_id,
  'legacy_review',
  'legacy_unknown',
  case
    when legacy.status = 'completed' and legacy.completed_at is not null then 'completed'
    else 'in_progress'
  end,
  legacy.topic_served,
  legacy.snapshot_id,
  legacy.score_at_selection,
  greatest(coalesce(legacy.num_questions, 0), coalesce(answer_totals.answered_count, 0)),
  least(
    coalesce(
      nullif(answer_totals.answered_count, 0),
      case when legacy.status = 'completed' then legacy.num_questions end,
      0
    ),
    greatest(coalesce(legacy.num_questions, 0), coalesce(answer_totals.answered_count, 0))
  ),
  least(
    case
      when answer_totals.answered_count > 0 then answer_totals.correct_count
      else coalesce(legacy.num_correct, 0)
    end,
    coalesce(
      nullif(answer_totals.answered_count, 0),
      case when legacy.status = 'completed' then legacy.num_questions end,
      0
    )
  ),
  legacy.started_at,
  coalesce(legacy.completed_at, legacy.started_at),
  case when legacy.status = 'completed' then legacy.completed_at end,
  case when legacy.status = 'completed' then legacy.completed_at end,
  jsonb_build_object(
    'backfill', 'review_quiz_sessions',
    'legacy_source', legacy.source,
    'legacy_status', legacy.status,
    'legacy_reported_num_correct', legacy.num_correct
  ),
  legacy.id
from public.review_quiz_sessions as legacy
left join lateral (
  select
    count(*)::integer as answered_count,
    count(*) filter (where answer.is_correct)::integer as correct_count
  from public.student_question_answers as answer
  where answer.review_quiz_session_id = legacy.id
) as answer_totals on true
on conflict (legacy_review_quiz_session_id) do nothing;

insert into public.quiz_session_questions (
  quiz_session_id,
  question_id,
  position,
  question_snapshot,
  issued_at
)
select
  session.id,
  question.question_id,
  question_entry.ordinality::integer,
  jsonb_build_object(
    'question_type', question.question_type,
    'prompt', question.prompt,
    'snippet', question.snippet,
    'topics', question.topics,
    'answer_options', question.answer_options,
    'answer', question.answer,
    'image_url', question.image_url
  ),
  session.started_at
from public.review_quiz_sessions as legacy
join public.quiz_sessions as session
  on session.legacy_review_quiz_session_id = legacy.id
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(legacy.question_ids_json) = 'array' then legacy.question_ids_json
    else '[]'::jsonb
  end
) with ordinality as question_entry(question_id_text, ordinality)
join public.questions as question
  on question.question_id = case
    when question_entry.question_id_text ~ '^[0-9]+$'
      then question_entry.question_id_text::bigint
    else null
  end
on conflict (quiz_session_id, question_id) do nothing;

update public.student_question_answers as answer
set quiz_session_id = session.id
from public.quiz_sessions as session
where answer.quiz_session_id is null
  and answer.review_quiz_session_id is not null
  and session.legacy_review_quiz_session_id = answer.review_quiz_session_id;

update public.review_recommendation_snapshots as snapshot
set source_quiz_session_id = session.id
from public.quiz_sessions as session
where snapshot.source_quiz_session_id is null
  and (
    session.legacy_lesson_session_id = snapshot.source_lesson_session_id
    or session.legacy_review_quiz_session_id = snapshot.source_review_quiz_session_id
  );

create or replace function public.create_quiz_session(
  p_student_id uuid,
  p_class_id bigint,
  p_quiz_mode text,
  p_launch_source text,
  p_question_rows jsonb,
  p_lesson_id bigint default null,
  p_focus_node_id text default null,
  p_focus_topic_label text default null,
  p_recommendation_snapshot_id uuid default null,
  p_score_at_selection double precision default null,
  p_client_session_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_session_id uuid;
  existing_session public.quiz_sessions%rowtype;
  supplied_question_count integer;
begin
  if jsonb_typeof(p_question_rows) <> 'array' then
    raise exception 'p_question_rows must be a JSON array';
  end if;

  supplied_question_count := jsonb_array_length(p_question_rows);
  if supplied_question_count < 1 then
    raise exception 'A quiz session requires at least one question';
  end if;

  if p_client_session_id is not null then
    select *
    into existing_session
    from public.quiz_sessions
    where student_id = p_student_id
      and client_session_id = p_client_session_id;

    if found then
      if existing_session.class_id <> p_class_id
        or existing_session.quiz_mode <> p_quiz_mode then
        raise exception 'client_session_id was already used for a different quiz';
      end if;
      return existing_session.id;
    end if;
  end if;

  insert into public.quiz_sessions (
    client_session_id,
    student_id,
    class_id,
    quiz_mode,
    launch_source,
    lesson_id,
    focus_node_id,
    focus_topic_label,
    recommendation_snapshot_id,
    score_at_selection,
    question_count,
    metadata
  ) values (
    p_client_session_id,
    p_student_id,
    p_class_id,
    p_quiz_mode,
    p_launch_source,
    p_lesson_id,
    p_focus_node_id,
    p_focus_topic_label,
    p_recommendation_snapshot_id,
    p_score_at_selection,
    supplied_question_count,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_session_id;

  insert into public.quiz_session_questions (
    quiz_session_id,
    question_id,
    position,
    question_snapshot
  )
  select
    new_session_id,
    (question_entry.value ->> 'question_id')::bigint,
    question_entry.ordinality::integer,
    coalesce(question_entry.value -> 'snapshot', '{}'::jsonb)
  from jsonb_array_elements(p_question_rows)
    with ordinality as question_entry(value, ordinality);

  return new_session_id;
end;
$$;

create or replace function public.complete_quiz_session(
  p_session_id uuid,
  p_student_id uuid,
  p_answered_count integer,
  p_correct_count integer
)
returns public.quiz_sessions
language plpgsql
set search_path = public
as $$
declare
  session_row public.quiz_sessions%rowtype;
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
    return session_row;
  end if;

  if session_row.status in ('abandoned', 'expired') then
    raise exception 'Quiz session cannot be completed from status %', session_row.status;
  end if;

  if p_answered_count <> session_row.question_count then
    raise exception 'All issued questions must be answered before completion';
  end if;

  if p_correct_count < 0 or p_correct_count > p_answered_count then
    raise exception 'Correct-answer count is outside the valid range';
  end if;

  update public.quiz_sessions
  set
    answered_count = p_answered_count,
    correct_count = p_correct_count,
    status = 'completed',
    completed_at = now(),
    ended_at = now(),
    last_activity_at = now(),
    updated_at = now()
  where id = p_session_id
  returning * into session_row;

  return session_row;
end;
$$;

revoke all on function public.create_quiz_session(
  uuid, bigint, text, text, jsonb, bigint, text, text, uuid, double precision, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_quiz_session(
  uuid, bigint, text, text, jsonb, bigint, text, text, uuid, double precision, uuid, jsonb
) to service_role;

revoke all on function public.complete_quiz_session(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.complete_quiz_session(uuid, uuid, integer, integer)
  to service_role;

alter table public.quiz_sessions enable row level security;
alter table public.quiz_session_questions enable row level security;

drop policy if exists quiz_sessions_select_own on public.quiz_sessions;
create policy quiz_sessions_select_own
  on public.quiz_sessions
  for select
  to authenticated
  using (auth.uid() = student_id);

drop policy if exists quiz_session_questions_select_own on public.quiz_session_questions;
create policy quiz_session_questions_select_own
  on public.quiz_session_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.quiz_sessions as session
      where session.id = quiz_session_id
        and session.student_id = auth.uid()
    )
  );

grant select on public.quiz_sessions to authenticated;
grant select on public.quiz_session_questions to authenticated;

comment on table public.quiz_sessions is
  'Canonical session record for lesson, daily review, and targeted topic-practice quizzes.';
comment on table public.quiz_session_questions is
  'Immutable ordered question set issued to a quiz session, with an analysis snapshot.';
comment on column public.quiz_sessions.quiz_mode is
  'Academic construction mode: lesson, daily_review, topic_practice, or legacy_review.';
comment on column public.quiz_sessions.launch_source is
  'Interaction surface that launched the quiz, separate from its academic mode.';

commit;
