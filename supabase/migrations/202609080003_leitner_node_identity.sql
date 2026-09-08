begin;

alter table public.leitner_schedule
  add column if not exists node_id text;

create or replace function public.resolve_class_node_id(
  p_class_id bigint,
  p_node_label text
)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(trim(node.value ->> 'id'), '')
  from public.class_knowledge_graph as graph
  cross join lateral unnest(
    coalesce(graph.react_flow_data, array[]::jsonb[])
  ) as flow(value)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(flow.value -> 'reactFlowNodes') = 'array'
        then flow.value -> 'reactFlowNodes'
      else '[]'::jsonb
    end
  ) as node(value)
  where graph.class_id = p_class_id
    and lower(trim(node.value #>> '{data,label}')) = lower(trim(p_node_label))
  order by node.value ->> 'id'
  limit 1;
$$;

update public.leitner_schedule
set node_id = public.resolve_class_node_id(class_id, node_label)
where node_id is null
  and class_id is not null
  and nullif(trim(node_label), '') is not null;

alter table public.leitner_schedule
  drop constraint if exists leitner_schedule_node_id_not_blank;

alter table public.leitner_schedule
  add constraint leitner_schedule_node_id_not_blank
  check (node_id is null or nullif(trim(node_id), '') is not null);

alter table public.leitner_schedule
  drop constraint if exists leitner_schedule_student_class_node_id_key;

alter table public.leitner_schedule
  add constraint leitner_schedule_student_class_node_id_key
  unique (student_id, class_id, node_id);

create or replace function public.populate_leitner_node_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.node_id is null or nullif(trim(new.node_id), '') is null then
    new.node_id := public.resolve_class_node_id(new.class_id, new.node_label);
  end if;

  return new;
end;
$$;

drop trigger if exists populate_leitner_node_identity
  on public.leitner_schedule;

create trigger populate_leitner_node_identity
before insert or update of class_id, node_label, node_id
on public.leitner_schedule
for each row
execute function public.populate_leitner_node_identity();

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
      public.resolve_class_node_id(session_row.class_id, node_label) as node_id,
      count(*)::integer as attempts,
      count(*) filter (where is_correct)::integer as correct
    from tagged_answers
    group by node_label
  loop
    if topic_result.node_id is not null then
      insert into public.leitner_schedule as schedule (
        student_id,
        class_id,
        node_id,
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
        topic_result.node_id,
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
      on conflict (student_id, class_id, node_id) do update
      set
        node_label = excluded.node_label,
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
    else
      insert into public.leitner_schedule as schedule (
        student_id,
        class_id,
        node_id,
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
        null,
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
    end if;
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

revoke all on function public.resolve_class_node_id(bigint, text)
  from public, anon, authenticated;
grant execute on function public.resolve_class_node_id(bigint, text)
  to service_role;

revoke all on function public.populate_leitner_node_identity()
  from public, anon, authenticated;

revoke all on function public.abandon_quiz_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.abandon_quiz_session(uuid, uuid)
  to service_role;

comment on column public.leitner_schedule.node_id is
  'Stable class knowledge-graph node identifier. node_label remains a readable label snapshot.';

comment on function public.abandon_quiz_session(uuid, uuid) is
  'Atomically preserves partial answer evidence in node-identified Leitner state and marks an unfinished quiz abandoned.';

commit;
