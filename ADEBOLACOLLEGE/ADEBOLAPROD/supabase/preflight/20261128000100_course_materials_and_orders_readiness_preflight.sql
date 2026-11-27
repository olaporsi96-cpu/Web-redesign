-- Read-only pre-migration readiness check for 20261128000100.
-- Dynamic probes are SELECT-only and are guarded by catalog checks.
-- Missing tables, columns, or functions are reported instead of referenced directly.
-- query_to_xml is limited to these guarded optional-relation probes; every probe
-- aggregates to one row, avoiding empty-result XML and XPath parsing behavior.

WITH
required_relations(schema_name, relation_name) AS (
  VALUES
    ('public', 'course_payment_settings'),
    ('public', 'course_materials'),
    ('public', 'courses'),
    ('public', 'lessons'),
    ('public', 'course_orders'),
    ('public', 'course_access'),
    ('public', 'course_guest_access'),
    ('storage', 'buckets'),
    ('storage', 'objects')
),
required_columns(schema_name, table_name, column_name, expected_type, missing_is_warning) AS (
  VALUES
    ('public', 'course_payment_settings', 'id', 'boolean', false),
    ('public', 'course_payment_settings', 'bank_name', 'text', false),
    ('public', 'course_payment_settings', 'account_name', 'text', false),
    ('public', 'course_payment_settings', 'account_number', 'text', false),
    ('public', 'course_payment_settings', 'account_type', 'text', false),
    ('public', 'course_payment_settings', 'updated_by', 'uuid', false),
    ('public', 'courses', 'id', 'uuid', false),
    ('public', 'courses', 'status', 'text', false),
    ('public', 'lessons', 'id', 'uuid', false),
    ('public', 'lessons', 'course_id', 'uuid', false),
    ('public', 'lessons', 'status', 'text', false),
    ('public', 'course_materials', 'id', 'uuid', false),
    ('public', 'course_materials', 'course_id', 'uuid', false),
    ('public', 'course_materials', 'lesson_id', 'uuid', false),
    ('public', 'course_materials', 'storage_path', 'text', false),
    ('public', 'course_materials', 'file_name', 'text', false),
    ('public', 'course_materials', 'mime_type', 'text', false),
    ('public', 'course_materials', 'updated_by', 'uuid', false),
    ('public', 'course_orders', 'id', 'uuid', false),
    ('public', 'course_orders', 'course_id', 'uuid', false),
    ('public', 'course_orders', 'admin_email_sent_at', 'timestamp with time zone', true),
    ('public', 'course_orders', 'admin_email_error', 'text', true),
    ('public', 'course_orders', 'buyer_email_sent_at', 'timestamp with time zone', true),
    ('public', 'course_orders', 'buyer_email_error', 'text', true),
    ('storage', 'objects', 'id', 'uuid', false),
    ('storage', 'objects', 'bucket_id', 'text', false),
    ('storage', 'objects', 'name', 'text', false),
    ('storage', 'objects', 'metadata', 'jsonb', false),
    ('storage', 'buckets', 'id', 'text', false),
    ('storage', 'buckets', 'public', 'boolean', false),
    ('storage', 'buckets', 'file_size_limit', 'bigint', false),
    ('storage', 'buckets', 'allowed_mime_types', 'ARRAY', false)
),
raw_probes AS (
  SELECT
    query_to_xml(
      CASE
        WHEN to_regclass('public.course_materials') IS NOT NULL
         AND to_regclass('public.courses') IS NOT NULL
         AND to_regclass('public.lessons') IS NOT NULL
         AND (SELECT count(*) = 3 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'course_materials'
                AND column_name IN ('id', 'course_id', 'lesson_id'))
         AND (SELECT count(*) = 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'id')
         AND (SELECT count(*) = 2 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'lessons'
                AND column_name IN ('id', 'course_id'))
        THEN $q$
          SELECT count(*) AS issue_count,
            coalesce(string_agg(issue, '; ' ORDER BY record_id), 'none') AS issue_details
          FROM (
            SELECT cm.id::text AS record_id,
              cm.id::text || ': ' ||
              CASE
                WHEN c.id IS NULL THEN 'missing course ' || cm.course_id::text
                WHEN cm.lesson_id IS NOT NULL AND l.id IS NULL THEN 'missing lesson ' || cm.lesson_id::text
                ELSE 'course_id=' || cm.course_id::text || ' differs from lesson course_id=' || l.course_id::text
              END AS issue
            FROM public.course_materials cm
            LEFT JOIN public.courses c ON c.id = cm.course_id
            LEFT JOIN public.lessons l ON l.id = cm.lesson_id
            WHERE c.id IS NULL
               OR (cm.lesson_id IS NOT NULL AND (l.id IS NULL OR l.course_id IS DISTINCT FROM cm.course_id))
          ) invalid_associations
        $q$
        ELSE 'SELECT 0::bigint AS issue_count, ''not evaluated: prerequisite relation or column missing''::text AS issue_details'
      END,
      false, true, ''
    ) AS association_xml,
    query_to_xml(
      CASE
        WHEN to_regclass('public.course_materials') IS NOT NULL
         AND to_regclass('storage.objects') IS NOT NULL
         AND (SELECT count(*) = 2 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'course_materials'
                AND column_name IN ('id', 'storage_path'))
         AND (SELECT count(*) = 3 FROM information_schema.columns
              WHERE table_schema = 'storage' AND table_name = 'objects'
                AND column_name IN ('id', 'bucket_id', 'name'))
        THEN $q$
          SELECT count(*) AS issue_count,
            coalesce(string_agg(issue, '; ' ORDER BY record_id), 'none') AS issue_details
          FROM (
            SELECT cm.id::text AS record_id,
              cm.id::text || ': missing private Storage object ' || cm.storage_path AS issue
            FROM public.course_materials cm
            LEFT JOIN storage.objects o
              ON o.bucket_id = 'course-materials' AND o.name = cm.storage_path
            WHERE o.id IS NULL
          ) missing_material_objects
        $q$
        ELSE 'SELECT 0::bigint AS issue_count, ''not evaluated: prerequisite relation or column missing''::text AS issue_details'
      END,
      false, true, ''
    ) AS missing_objects_xml,
    query_to_xml(
      CASE
        WHEN to_regclass('public.course_materials') IS NOT NULL
         AND to_regprocedure('storage.foldername(text)') IS NOT NULL
         AND (SELECT count(*) = 6 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'course_materials'
                AND column_name IN ('id', 'course_id', 'lesson_id', 'mime_type', 'file_name', 'storage_path'))
        THEN $q$
          SELECT count(*) AS issue_count,
            coalesce(string_agg(issue, '; ' ORDER BY record_id), 'none') AS issue_details
          FROM (
            SELECT cm.id::text AS record_id,
              cm.id::text || ': mime=' || coalesce(cm.mime_type, '<NULL>') ||
              ', name=' || coalesce(cm.file_name, '<NULL>') ||
              ', path=' || coalesce(cm.storage_path, '<NULL>') AS issue
            FROM public.course_materials cm
            WHERE cm.mime_type IS NULL
               OR cm.mime_type NOT IN ('application/pdf', 'video/mp4')
               OR cm.file_name IS NULL
               OR length(btrim(cm.file_name)) NOT BETWEEN 1 AND 255
               OR position('/' IN btrim(cm.file_name)) > 0
               OR cm.storage_path IS NULL
               OR coalesce(cardinality(storage.foldername(cm.storage_path)), 0) <> 2
               OR (storage.foldername(cm.storage_path))[1] <> cm.course_id::text
               OR (cm.lesson_id IS NULL AND (storage.foldername(cm.storage_path))[2] <> 'course')
               OR (cm.lesson_id IS NOT NULL AND (storage.foldername(cm.storage_path))[2] <> cm.lesson_id::text)
          ) invalid_material_rows
        $q$
        ELSE 'SELECT 0::bigint AS issue_count, ''not evaluated: prerequisite relation, column, or helper missing''::text AS issue_details'
      END,
      false, true, ''
    ) AS invalid_materials_xml,
    query_to_xml(
      CASE
        WHEN to_regclass('public.course_materials') IS NOT NULL
         AND (SELECT count(*) = 2 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'course_materials'
                AND column_name IN ('id', 'storage_path'))
        THEN $q$
          SELECT count(*) AS issue_count,
            coalesce(string_agg(storage_path || ' (records=' || row_count::text || ')', '; ' ORDER BY storage_path), 'none') AS issue_details
          FROM (
            SELECT storage_path, count(*) AS row_count
            FROM public.course_materials
            GROUP BY storage_path
            HAVING count(*) > 1
          ) duplicate_paths
        $q$
        ELSE 'SELECT 0::bigint AS issue_count, ''not evaluated: prerequisite relation or column missing''::text AS issue_details'
      END,
      false, true, ''
    ) AS duplicate_paths_xml,
    query_to_xml(
      CASE
        WHEN to_regclass('public.course_materials') IS NOT NULL
         AND to_regclass('storage.objects') IS NOT NULL
         AND (SELECT count(*) = 3 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'course_materials'
                AND column_name IN ('id', 'mime_type', 'storage_path'))
         AND (SELECT count(*) = 3 FROM information_schema.columns
              WHERE table_schema = 'storage' AND table_name = 'objects'
                AND column_name IN ('bucket_id', 'name', 'metadata'))
        THEN $q$
          SELECT count(*) AS issue_count,
            coalesce(string_agg(issue, '; ' ORDER BY record_id), 'none') AS issue_details
          FROM (
            SELECT cm.id::text AS record_id,
              cm.id::text || ': object MIME=' || coalesce(o.metadata->>'mimetype', '<missing>') ||
              ', size=' || coalesce(o.metadata->>'size', '<missing>') AS issue
            FROM public.course_materials cm
            JOIN storage.objects o
              ON o.bucket_id = 'course-materials' AND o.name = cm.storage_path
            WHERE coalesce(o.metadata->>'mimetype', '') <> cm.mime_type
               OR coalesce(o.metadata->>'size', '') !~ '^[0-9]+$'
               OR CASE WHEN coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
                       THEN (o.metadata->>'size')::bigint NOT BETWEEN 1 AND 52428800
                       ELSE true
                  END
          ) invalid_object_rows
        $q$
        ELSE 'SELECT 0::bigint AS issue_count, ''not evaluated: prerequisite relation or column missing''::text AS issue_details'
      END,
      false, true, ''
    ) AS object_metadata_xml,
    query_to_xml(
      CASE
        WHEN to_regclass('public.courses') IS NOT NULL
         AND to_regclass('public.lessons') IS NOT NULL
         AND to_regclass('public.course_materials') IS NOT NULL
         AND to_regclass('public.course_orders') IS NOT NULL
        THEN $q$
          SELECT (SELECT count(*) FROM public.courses) AS courses,
            (SELECT count(*) FROM public.lessons) AS lessons,
            (SELECT count(*) FROM public.course_materials) AS materials,
            (SELECT count(*) FROM public.course_orders) AS orders
        $q$
        ELSE 'SELECT 0 AS courses, 0 AS lessons, 0 AS materials, 0 AS orders'
      END,
      false, true, ''
    ) AS record_counts_xml,
    query_to_xml(
      CASE
        WHEN to_regclass('storage.buckets') IS NOT NULL
         AND (SELECT count(*) = 4 FROM information_schema.columns
              WHERE table_schema = 'storage' AND table_name = 'buckets'
                AND column_name IN ('id', 'public', 'file_size_limit', 'allowed_mime_types'))
        THEN $q$
          SELECT count(*) AS bucket_count,
            coalesce(bool_or(public), true) AS is_public,
            coalesce(max(file_size_limit)::text, '') AS file_size_limit,
            coalesce(max(array_to_string(allowed_mime_types, ',')), '') AS allowed_mime_types
          FROM storage.buckets
          WHERE id = 'course-materials'
        $q$
        ELSE 'SELECT 0::bigint AS bucket_count, true AS is_public, ''''::text AS file_size_limit, ''''::text AS allowed_mime_types'
      END,
      false, true, ''
    ) AS bucket_xml,
    query_to_xml(
      CASE
        WHEN to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'supabase_migrations'
             AND table_name = 'schema_migrations'
             AND column_name = 'version'
         )
        THEN $q$
          SELECT coalesce(string_agg(version::text, ', ' ORDER BY version::text), 'none') AS listed_versions
          FROM supabase_migrations.schema_migrations
          WHERE version::text IN (
            '20261125000100', '20261125000200',
            '20261126000100', '20261127000100', '20261128000100'
          )
        $q$
        ELSE 'SELECT ''ledger unavailable''::text AS listed_versions'
      END,
      false, true, ''
    ) AS migration_history_xml
),
probe_text AS (
  SELECT
    coalesce(xmlserialize(content association_xml AS text), '') AS associations,
    coalesce(xmlserialize(content missing_objects_xml AS text), '') AS missing_objects,
    coalesce(xmlserialize(content invalid_materials_xml AS text), '') AS invalid_materials,
    coalesce(xmlserialize(content duplicate_paths_xml AS text), '') AS duplicate_paths,
    coalesce(xmlserialize(content object_metadata_xml AS text), '') AS object_metadata,
    coalesce(xmlserialize(content record_counts_xml AS text), '') AS record_counts,
    coalesce(xmlserialize(content bucket_xml AS text), '') AS bucket,
    coalesce(xmlserialize(content migration_history_xml AS text), '') AS migration_history
  FROM raw_probes
),
checks(result, check_name, detail) AS (
  SELECT
    CASE WHEN to_regclass(format('%I.%I', schema_name, relation_name)) IS NULL THEN 'FAIL' ELSE 'PASS' END,
    'Required relation ' || schema_name || '.' || relation_name,
    coalesce(to_regclass(format('%I.%I', schema_name, relation_name))::text, 'missing')
  FROM required_relations

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass(format('%I.%I', c.schema_name, c.table_name)) IS NULL THEN 'FAIL'
      WHEN col.column_name IS NULL AND c.missing_is_warning THEN 'WARNING'
      WHEN col.column_name IS NULL THEN 'FAIL'
      WHEN col.data_type <> c.expected_type THEN 'FAIL'
      ELSE 'PASS'
    END,
    'Column ' || c.schema_name || '.' || c.table_name || '.' || c.column_name,
    CASE
      WHEN to_regclass(format('%I.%I', c.schema_name, c.table_name)) IS NULL THEN 'table missing'
      WHEN col.column_name IS NULL AND c.missing_is_warning THEN 'missing; migration 280001 adds this nullable email-status column'
      WHEN col.column_name IS NULL THEN 'missing'
      ELSE 'type=' || col.data_type || ', nullable=' || col.is_nullable || ', expected type=' || c.expected_type
    END
  FROM required_columns c
  LEFT JOIN information_schema.columns col
    ON col.table_schema = c.schema_name
   AND col.table_name = c.table_name
   AND col.column_name = c.column_name

  UNION ALL

  SELECT
    CASE WHEN to_regprocedure(signature) IS NULL THEN 'FAIL' ELSE 'PASS' END,
    'Required helper ' || signature,
    coalesce(to_regprocedure(signature)::text, 'missing')
  FROM (VALUES
    ('auth.uid()'),
    ('storage.foldername(text)'),
    ('public.has_admin_permission(text)'),
    ('public.has_course_access(uuid)'),
    ('public.write_sensitive_audit_log()')
  ) helpers(signature)

  UNION ALL

  SELECT
    CASE
      WHEN p.oid IS NULL THEN 'WARNING'
      WHEN pg_get_function_result(p.oid) <> f.expected_return THEN 'FAIL'
      WHEN coalesce(p.proargnames[1:p.pronargs], array[]::text[]) <> f.expected_names THEN 'FAIL'
      ELSE 'PASS'
    END,
    'Replaceable function ' || f.signature,
    CASE WHEN p.oid IS NULL THEN 'not present; migration 280001 creates/replaces it'
      ELSE 'return=' || pg_get_function_result(p.oid) ||
        '; argument names=' || coalesce(array_to_string(p.proargnames[1:p.pronargs], ', '), '<none>')
    END
  FROM (VALUES
    ('public.save_course_payment_settings(text,text,text,text)', 'void', ARRAY['configured_bank','configured_account_name','configured_account_number','configured_account_type']::text[]),
    ('public.save_course_payment_settings(text,text,text)', 'void', ARRAY['configured_bank','configured_account_name','configured_account_number']::text[]),
    ('public.save_course_material_v2(uuid,uuid,text,text,text,uuid)', 'uuid', ARRAY['target_course_id','target_lesson_id','material_path','material_name','material_mime','replace_material_id']::text[]),
    ('public.save_course_material(uuid,text,text,text)', 'void', ARRAY['target_lesson_id','material_path','material_name','material_mime']::text[]),
    ('public.save_course_material_record(uuid,text,text,text,uuid)', 'uuid', ARRAY['target_lesson_id','material_path','material_name','material_mime','replace_material_id']::text[]),
    ('public.remove_course_material(uuid)', 'text', ARRAY['target_lesson_id']::text[]),
    ('public.remove_course_material_record(uuid)', 'text', ARRAY['target_material_id']::text[]),
    ('public.delete_lesson(uuid)', 'void', ARRAY['target_lesson_id']::text[]),
    ('public.delete_course(uuid)', 'void', ARRAY['target_id']::text[])
  ) f(signature, expected_return, expected_names)
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.signature)

  UNION ALL

  SELECT
    CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Payment RPC overload count',
    'existing overloads=' || count(*)::text || '; expected exactly the three-text and four-text overloads'
  FROM pg_proc
  WHERE pronamespace = to_regnamespace('public')
    AND proname = 'save_course_payment_settings'

  UNION ALL

  SELECT
    'WARNING',
    'Read-only migration ledger snapshot',
    migration_history || '; reconcile earlier pending migrations before deciding on 280001 order'
  FROM probe_text

  UNION ALL

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'course_payment_settings'
          AND column_name = 'id' AND data_type = 'boolean'
          AND is_nullable = 'NO' AND column_default LIKE '%true%'
      )
       AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.course_payment_settings')
          AND contype = 'p'
          AND conkey = ARRAY[(
            SELECT attnum FROM pg_attribute
            WHERE attrelid = to_regclass('public.course_payment_settings')
              AND attname = 'id' AND NOT attisdropped
          )]::smallint[]
      )
       AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.course_payment_settings')
          AND contype = 'c'
          AND lower(pg_get_constraintdef(oid)) LIKE '%check (id)%'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Boolean payment-settings id / PK / CHECK contract',
    'id must remain Boolean NOT NULL DEFAULT true, with its Boolean primary key and check constraint'

  UNION ALL

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.course_materials')
          AND c.contype = 'f' AND c.confrelid = to_regclass('public.courses')
          AND c.convalidated
      ) THEN 'PASS'
      ELSE 'WARNING'
    END,
    'Existing validated course foreign key',
    'migration 280001 adds a course_id foreign key if absent'

  UNION ALL

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.course_materials')
          AND c.conname = 'course_materials_course_lesson_fk'
          AND NOT (c.contype = 'f' AND c.confrelid = to_regclass('public.lessons')
            AND pg_get_constraintdef(c.oid) ILIKE 'FOREIGN KEY (course_id, lesson_id)%')
      ) THEN 'FAIL'
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.course_materials')
          AND c.contype = 'f' AND c.confrelid = to_regclass('public.lessons')
          AND pg_get_constraintdef(c.oid) ILIKE 'FOREIGN KEY (course_id, lesson_id)%'
          AND (NOT c.convalidated OR c.confdeltype <> 'c')
      ) THEN 'FAIL'
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.course_materials')
          AND c.contype = 'f' AND c.confrelid = to_regclass('public.lessons')
          AND pg_get_constraintdef(c.oid) ILIKE 'FOREIGN KEY (course_id, lesson_id)%'
      ) THEN 'PASS'
      ELSE 'WARNING'
    END,
    'Composite course/lesson foreign key',
    'an existing key must be validated and ON DELETE CASCADE; otherwise migration adds it'

  UNION ALL

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.course_materials')
          AND c.conname = 'course_materials_course_id_courses_fk'
          AND NOT (c.contype = 'f' AND c.confrelid = to_regclass('public.courses')
            AND pg_get_constraintdef(c.oid) ILIKE 'FOREIGN KEY (course_id)%')
      ) THEN 'FAIL'
      ELSE 'PASS'
    END,
    'Constraint-name collision: course_materials_course_id_courses_fk',
    'existing name must be absent or match the course_id foreign key'

  UNION ALL

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.lessons')
          AND c.conname = 'lessons_course_id_id_key'
          AND NOT (c.contype IN ('p', 'u')
            AND pg_get_constraintdef(c.oid) ILIKE 'UNIQUE (course_id, id)%')
      ) THEN 'FAIL'
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.lessons')
          AND c.contype IN ('p', 'u')
          AND pg_get_constraintdef(c.oid) ILIKE 'UNIQUE (course_id, id)%'
      ) THEN 'PASS'
      ELSE 'WARNING'
    END,
    'Unique lessons(course_id, id) key',
    'migration adds this referenced key if absent'

  UNION ALL

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.course_materials')
          AND c.conname = 'course_materials_mime_type_allowed_check'
          AND NOT (c.contype = 'c'
            AND lower(pg_get_constraintdef(c.oid)) LIKE '%mime_type%'
            AND lower(pg_get_constraintdef(c.oid)) LIKE '%application/pdf%'
            AND lower(pg_get_constraintdef(c.oid)) LIKE '%video/mp4%')
      ) THEN 'FAIL'
      ELSE 'PASS'
    END,
    'Constraint-name collision: course_materials_mime_type_allowed_check',
    'existing name must be absent or compatible with the PDF/MP4 MIME check'

  UNION ALL

  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = to_regclass('public.course_materials')
        AND i.indisunique AND i.indnkeyatts = 1
        AND i.indkey[0] = (
          SELECT attnum FROM pg_attribute
          WHERE attrelid = to_regclass('public.course_materials')
            AND attname = 'storage_path' AND NOT attisdropped
        )
    ) THEN 'PASS' ELSE 'WARNING' END,
    'Unique course-material storage_path',
    'migration ensures unique Storage paths; duplicate data is checked separately'

  UNION ALL

  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = to_regclass('public.course_materials')
          AND i.indisunique AND i.indnkeyatts = 1
          AND i.indkey[0] = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = to_regclass('public.course_materials')
              AND attname = 'storage_path' AND NOT attisdropped
          )
      ) AND EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'course_materials_storage_path_repair_uidx'
      ) THEN 'FAIL'
      ELSE 'PASS'
    END,
    'Index-name collision: course_materials_storage_path_repair_uidx',
    'if migration needs to create this index, its name must be unused'

  UNION ALL

  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.course_materials')
        AND c.conname = 'course_materials_mime_type_allowed_check'
        AND c.contype = 'c'
    ) THEN 'PASS' ELSE 'WARNING' END,
    'Existing material MIME check',
    'migration adds a PDF/MP4 MIME check if no compatible check exists'

  UNION ALL

  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint u
      JOIN pg_constraint f ON f.contype = 'f' AND f.conindid = u.conindid
      WHERE u.conrelid = to_regclass('public.course_materials')
        AND u.contype = 'u'
        AND u.conkey = ARRAY[(
          SELECT attnum FROM pg_attribute
          WHERE attrelid = to_regclass('public.course_materials')
            AND attname = 'lesson_id' AND NOT attisdropped
        )]::smallint[]
    ) THEN 'FAIL' ELSE 'PASS' END,
    'Lesson-only unique-constraint dependencies',
    'migration aborts rather than dropping a lesson-only constraint referenced by a foreign key'

  UNION ALL

  SELECT
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid
        AND a.attnum = i.indkey[0] AND a.attname = 'lesson_id' AND NOT a.attisdropped
      JOIN pg_constraint f ON f.contype = 'f' AND f.conindid = i.indexrelid
      WHERE i.indrelid = to_regclass('public.course_materials')
        AND i.indisunique AND i.indnkeyatts = 1 AND NOT i.indisprimary
        AND NOT EXISTS (SELECT 1 FROM pg_constraint u WHERE u.conindid = i.indexrelid)
    ) THEN 'FAIL' ELSE 'PASS' END,
    'Lesson-only unique-index dependencies',
    'migration must not drop a lesson-only unique index referenced by a foreign key'

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass('public.course_materials') IS NULL
        OR to_regclass('public.courses') IS NULL
        OR to_regclass('public.lessons') IS NULL THEN 'FAIL'
      WHEN position('<issue_count>0</issue_count>' IN p.associations) > 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Existing material course/lesson associations',
    p.associations
  FROM probe_text p

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass('public.course_materials') IS NULL
        OR to_regclass('storage.objects') IS NULL THEN 'FAIL'
      WHEN position('<issue_count>0</issue_count>' IN p.missing_objects) > 0 THEN 'PASS'
      ELSE 'WARNING'
    END,
    'Material Storage objects exist',
    p.missing_objects
  FROM probe_text p

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass('public.course_materials') IS NULL
        OR to_regprocedure('storage.foldername(text)') IS NULL THEN 'FAIL'
      WHEN position('<issue_count>0</issue_count>' IN p.invalid_materials) > 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Existing material MIME, filename, and Storage-path constraints',
    p.invalid_materials
  FROM probe_text p

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass('public.course_materials') IS NULL THEN 'FAIL'
      WHEN position('<issue_count>0</issue_count>' IN p.duplicate_paths) > 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Duplicate material Storage paths',
    p.duplicate_paths
  FROM probe_text p

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass('public.course_materials') IS NULL
        OR to_regclass('storage.objects') IS NULL THEN 'FAIL'
      WHEN position('<issue_count>0</issue_count>' IN p.object_metadata) > 0 THEN 'PASS'
      ELSE 'WARNING'
    END,
    'Existing Storage MIME and size metadata',
    p.object_metadata
  FROM probe_text p

  UNION ALL

  SELECT
    CASE WHEN coalesce(c.relrowsecurity, false) THEN 'PASS' ELSE 'FAIL' END,
    'RLS enabled on ' || x.relation_name,
    coalesce(c.relrowsecurity::text, 'relation missing')
  FROM (VALUES
    ('public.course_materials'),
    ('storage.objects'),
    ('public.course_orders'),
    ('public.course_access'),
    ('public.course_guest_access')
  ) x(relation_name)
  LEFT JOIN pg_class c ON c.oid = to_regclass(x.relation_name)

  UNION ALL

  SELECT
    CASE
      WHEN count(*) FILTER (WHERE policyname IN (
        'materials_admin_or_access_read',
        'course_material_objects_admin_insert',
        'course_material_objects_authorized_read'
      )) = 3 THEN 'WARNING'
      ELSE 'PASS'
    END,
    'Policies replaced by migration 280001',
    'matching existing policies=' ||
      count(*) FILTER (WHERE policyname IN (
        'materials_admin_or_access_read',
        'course_material_objects_admin_insert',
        'course_material_objects_authorized_read'
      ))::text || '; inspect relevant policies below'
  FROM pg_policies
  WHERE (schemaname = 'public' AND tablename = 'course_materials')
     OR (schemaname = 'storage' AND tablename = 'objects')

  UNION ALL

  SELECT
    CASE
      WHEN count(*) FILTER (WHERE roles && ARRAY['anon', 'public']::name[]) > 0 THEN 'WARNING'
      ELSE 'PASS'
    END,
    'Course and Storage policy definitions',
    coalesce(string_agg(
      schemaname || '.' || tablename || '.' || policyname ||
      ' roles=' || roles::text || ' command=' || cmd ||
      ' using=' || coalesce(qual, '<none>') ||
      ' check=' || coalesce(with_check, '<none>'),
      E'\n'
    ), 'no policies found')
  FROM pg_policies
  WHERE (schemaname = 'public' AND tablename IN (
      'course_materials', 'course_orders', 'course_access', 'course_guest_access'
    ))
     OR (schemaname = 'storage' AND tablename = 'objects')

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass('storage.buckets') IS NULL THEN 'FAIL'
      WHEN position('<bucket_count>1</bucket_count>' IN p.bucket) = 0 THEN 'WARNING'
      WHEN position('<is_public>false</is_public>' IN p.bucket) > 0
       AND position('<file_size_limit>52428800</file_size_limit>' IN p.bucket) > 0
       AND position('application/pdf,video/mp4' IN p.bucket) > 0 THEN 'PASS'
      WHEN position('<is_public>false</is_public>' IN p.bucket) > 0
       AND position('<file_size_limit>52428800</file_size_limit>' IN p.bucket) > 0
       AND position('video/mp4,application/pdf' IN p.bucket) > 0 THEN 'PASS'
      ELSE 'WARNING'
    END,
    'Private course-materials bucket',
    p.bucket || '; migration sets the bucket private and allows PDF/MP4'
  FROM probe_text p

  UNION ALL

  SELECT
    CASE
      WHEN count(*) = 0 THEN 'WARNING'
      WHEN count(*) FILTER (
        WHERE p.oid = to_regprocedure('public.write_sensitive_audit_log()')
          AND EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = 'course_payment_settings'
              AND c.column_name = 'id'
              AND c.data_type = 'boolean'
          )
          AND (
            position('(after_data ->> ''id'')::uuid' IN lower(pg_get_functiondef(p.oid))) > 0
            OR position('(before_data ->> ''id'')::uuid' IN lower(pg_get_functiondef(p.oid))) > 0
          )
      ) > 0 THEN 'FAIL'
      ELSE 'PASS'
    END,
    'Payment audit trigger and Boolean-id UUID cast',
    coalesce(string_agg(
      pg_get_triggerdef(t.oid) || ' ; function=' ||
      coalesce(pg_get_functiondef(p.oid), '<missing trigger function>'),
      E'\n'
    ), 'no user triggers attached to course_payment_settings')
  FROM pg_trigger t
  LEFT JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = to_regclass('public.course_payment_settings')
    AND NOT t.tgisinternal

  UNION ALL

  SELECT
    'WARNING',
    'All triggers on course_payment_settings (events and arguments)',
    coalesce(string_agg(
      t.tgname || ' ; ' || pg_get_triggerdef(t.oid) ||
      ' ; tgtype=' || t.tgtype::text ||
      ' ; args=' || encode(t.tgargs, 'escape'),
      E'\n'
    ), 'no user triggers attached')
  FROM pg_trigger t
  WHERE t.tgrelid = to_regclass('public.course_payment_settings')
    AND NOT t.tgisinternal

  UNION ALL

  SELECT
    CASE
      WHEN to_regclass('public.courses') IS NULL
        OR to_regclass('public.lessons') IS NULL
        OR to_regclass('public.course_materials') IS NULL
        OR to_regclass('public.course_orders') IS NULL THEN 'FAIL'
      ELSE 'WARNING'
    END,
    'Existing courses, lessons, materials, and orders preservation baseline',
    p.record_counts
  FROM probe_text p
)
SELECT result, check_name, detail
FROM checks
ORDER BY CASE result WHEN 'FAIL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END, check_name;
