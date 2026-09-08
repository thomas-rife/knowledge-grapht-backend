begin;

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
  'Marks an unfinished quiz as abandoned using only its persisted question answers.';

commit;
