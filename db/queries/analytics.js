import db from "#db/client";

// A task's "completion" is the FIRST time it entered a done column — if it
// bounces in and out of Done multiple times, it only counts once, at its
// earliest completion. Used by both velocity and cycle time for consistency.
const COMPLETIONS_CTE = `
  WITH completions AS (
    SELECT a.task_id, MIN(a.created_at) AS completed_at
    FROM activity_log a
    JOIN columns c ON c.id = (a.details->>'toId')::integer
    JOIN tasks t ON t.id = a.task_id
    WHERE a.action = 'status_changed'
      AND c.is_done_column = true
      AND t.project_id = $1
    GROUP BY a.task_id
  )
`;

export async function getVelocity(projectId, weeks = 6) {
  const sinceDate = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
  const sql = `
    ${COMPLETIONS_CTE}
    SELECT date_trunc('week', completed_at) AS week_start, COUNT(*)::int AS completed
    FROM completions
    WHERE completed_at >= $2
    GROUP BY week_start
    ORDER BY week_start ASC
  `;
  const { rows } = await db.query(sql, [projectId, sinceDate]);
  return rows;
}

export async function getCycleTime(projectId) {
  const sql = `
    ${COMPLETIONS_CTE}
    SELECT t.id, t.title,
           EXTRACT(EPOCH FROM (c.completed_at - t.created_at)) / 3600 AS hours
    FROM completions c
    JOIN tasks t ON t.id = c.task_id
    ORDER BY hours DESC
  `;
  const { rows: tasks } = await db.query(sql, [projectId]);
  const averageHours = tasks.length
    ? tasks.reduce((sum, t) => sum + Number(t.hours), 0) / tasks.length
    : null;
  return { averageHours, taskCount: tasks.length, tasks };
}

export async function getWorkload(projectId) {
  const sql = `
    SELECT u.id, u.name,
      COUNT(t.id) FILTER (WHERE t.id IS NOT NULL AND (c.is_done_column IS NULL OR c.is_done_column = false)) AS open_task_count
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    LEFT JOIN tasks t ON t.assignee_id = u.id AND t.project_id = $1
    LEFT JOIN columns c ON c.id = t.column_id
    WHERE pm.project_id = $1
    GROUP BY u.id, u.name
    ORDER BY open_task_count DESC
  `;
  const { rows } = await db.query(sql, [projectId]);
  return rows;
}

// NOTE: these run sequentially, not via Promise.all — db/client.js is a
// single pg.Client, and firing concurrent queries on it triggers the same
// node-postgres deprecation warning found earlier with the drag-and-drop
// concurrency issue. These are independent read-only SELECTs, so it
// happened to return correct results in testing, but running them
// concurrently isn't a pattern worth relying on given what we already know
// about this client setup.
export async function getAnalytics(projectId, weeks = 6) {
  const velocity = await getVelocity(projectId, weeks);
  const cycleTime = await getCycleTime(projectId);
  const workload = await getWorkload(projectId);
  return { velocity, cycleTime, workload };
}
