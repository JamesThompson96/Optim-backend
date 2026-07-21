import db from "#db/client";

export async function createLabel(projectId, name, color) {
  const {
    rows: [label],
  } = await db.query(
    "INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3) RETURNING *",
    [projectId, name, color],
  );
  return label;
}

export async function getLabelsForProject(projectId) {
  const { rows } = await db.query(
    "SELECT * FROM labels WHERE project_id = $1 ORDER BY name ASC",
    [projectId],
  );
  return rows;
}

export async function getLabelById(id) {
  const {
    rows: [label],
  } = await db.query("SELECT * FROM labels WHERE id = $1", [id]);
  return label;
}

export async function deleteLabel(id) {
  await db.query("DELETE FROM labels WHERE id = $1", [id]);
}

// Attaching is explicitly a no-op (not an error) if already attached —
// ON CONFLICT DO NOTHING on the composite PK handles that in one query.
export async function attachLabel(taskId, labelId) {
  await db.query(
    "INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [taskId, labelId],
  );
}

export async function detachLabel(taskId, labelId) {
  await db.query(
    "DELETE FROM task_labels WHERE task_id = $1 AND label_id = $2",
    [taskId, labelId],
  );
}

export async function getLabelsForTask(taskId) {
  const sql = `
    SELECT l.id, l.name, l.color
    FROM labels l
    JOIN task_labels tl ON tl.label_id = l.id
    WHERE tl.task_id = $1
    ORDER BY l.name ASC
  `;
  const { rows } = await db.query(sql, [taskId]);
  return rows;
}

export async function getTaskProjectId(taskId) {
  const {
    rows: [task],
  } = await db.query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
  return task?.project_id;
}
