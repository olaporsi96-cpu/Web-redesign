create function public.save_result_with_subjects(
  target_result_id uuid,
  target_student_id uuid,
  target_examination_number text,
  target_candidate_number text,
  target_school text,
  target_exam_year text,
  target_subjects jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved_result_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_results') then
    raise exception 'manage_results permission required';
  end if;

  if target_student_id is null
     or length(btrim(coalesce(target_examination_number, ''))) = 0
     or length(target_examination_number) > 60
     or length(btrim(coalesce(target_candidate_number, ''))) = 0
     or length(target_candidate_number) > 60
     or length(btrim(coalesce(target_school, ''))) = 0
     or length(target_school) > 100
     or length(btrim(coalesce(target_exam_year, ''))) = 0
     or length(target_exam_year) > 30 then
    raise exception 'Required result fields are missing';
  end if;

  if jsonb_typeof(target_subjects) is distinct from 'array'
     or jsonb_array_length(target_subjects) < 1
     or jsonb_array_length(target_subjects) > 100 then
    raise exception 'A result must contain between 1 and 100 subjects';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_subjects) as subject(value)
    where jsonb_typeof(subject.value) <> 'object'
       or jsonb_typeof(subject.value -> 'name') is distinct from 'string'
       or length(btrim(coalesce(subject.value ->> 'name', ''))) = 0
       or length(subject.value ->> 'name') > 80
       or jsonb_typeof(subject.value -> 'score') is distinct from 'string'
       or length(subject.value ->> 'score') > 30
       or jsonb_typeof(subject.value -> 'grade') is distinct from 'string'
       or length(subject.value ->> 'grade') > 20
       or jsonb_typeof(subject.value -> 'remark') is distinct from 'string'
       or length(subject.value ->> 'remark') > 80
  ) then
    raise exception 'Check subject names, scores, grades, and remarks';
  end if;

  if target_result_id is null then
    insert into public.results (
      student_id,
      examination_number,
      candidate_number,
      school,
      exam_year,
      result_status
    )
    values (
      target_student_id,
      btrim(target_examination_number),
      btrim(target_candidate_number),
      btrim(target_school),
      btrim(target_exam_year),
      'Draft'
    )
    returning id into saved_result_id;
  else
    update public.results
       set student_id = target_student_id,
           examination_number = btrim(target_examination_number),
           candidate_number = btrim(target_candidate_number),
           school = btrim(target_school),
           exam_year = btrim(target_exam_year),
           updated_at = now()
     where id = target_result_id
     returning id into saved_result_id;

    if saved_result_id is null then
      raise exception 'Result not found or update is not permitted';
    end if;

    delete from public.result_subjects
     where result_id = saved_result_id;
  end if;

  insert into public.result_subjects (
    result_id,
    name,
    score,
    grade,
    remark,
    sort_order
  )
  select
    saved_result_id,
    btrim(subject.value ->> 'name'),
    coalesce(subject.value ->> 'score', ''),
    coalesce(subject.value ->> 'grade', ''),
    coalesce(subject.value ->> 'remark', ''),
    (subject.ordinality - 1)::integer
  from jsonb_array_elements(target_subjects) with ordinality as subject(value, ordinality);

  return saved_result_id;
end;
$$;

revoke all on function public.save_result_with_subjects(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.save_result_with_subjects(
  uuid, uuid, text, text, text, text, jsonb
) to authenticated;
