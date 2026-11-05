import { EmptyState, PageHeading } from '../../_components/admin-ui';
import { createClient } from '../../../../utils/supabase/server';

export default async function AdminActivityPage() {
  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, details, created_at, actor_id')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <>
        <PageHeading title="Activity" description="Recent audit events." />
        <p className="admin-auth-error" role="alert">Unable to load audit events: {error.message}</p>
      </>
    );
  }

  const actorIds = [...new Set(logs.map((item) => item.actor_id).filter(Boolean))];
  let actorNames = new Map();
  if (actorIds.length) {
    const { data: actors, error: actorsError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', actorIds);
    if (actorsError) {
      return (
        <>
          <PageHeading title="Activity" description="Recent audit events." />
          <p className="admin-auth-error" role="alert">Unable to load audit actor names: {actorsError.message}</p>
        </>
      );
    }
    actorNames = new Map(actors.map((actor) => [actor.id, actor.display_name]));
  }

  return (
    <>
      <PageHeading title="Activity" description="Recent audit events recorded for sensitive Admin changes." />
      {logs.length ? (
        <section className="admin-panel">
          <ul className="activity-list activity-full-list">
            {logs.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.action} · {entry.entity_type}</strong>
                <span>{entry.details?.changed_fields?.length
                  ? `Changed fields: ${entry.details.changed_fields.join(', ')}`
                  : entry.entity_id || 'Record'}</span>
                <span>Actor: {actorNames.get(entry.actor_id) || 'System'}</span>
                <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState title="No audit events have been recorded yet" description="Sensitive Admin changes will appear here when recorded." />
      )}
    </>
  );
}
