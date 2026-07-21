import db from "#db/client";

function taskRow(prefix = "") {
  const cols = [
    "id",
    "project_id",
    "board_id",
    "column_id",
    "task_number",
    "title",
    "description",
    "type",
    "priority",
    "assignee_id",
    "reporter_id",
    "due_date",
    "position",
    "created_at",
    "updated_at",
  ];
  return cols.map((c) => `${prefix}${c}`).join(", ");
}

export async function getTask(taskId) {
  const {
    rows: [task],
  } = await db.query(`SELECT ${taskRow()} FROM tasks WHERE id = $1`, [taskId]);
  return task || null;
}

// Confirms a column actually belongs to this project's board — prevents a
// client from filing/moving a task into a column from a different project.
export async function getColumnForProject(columnId, projectId) {
  const {
    rows: [col],
  } = await db.query(
    `SELECT c.id, c.board_id, c.name
     FROM columns c
     JOIN boards b ON b.id = c.board_id
     WHERE c.id = $1 AND b.project_id = $2`,
    [columnId, projectId],
  );
  return col || null;
}

// task_number is scoped per project (ENG-1, ENG-2, ...). This MAX+1 read
// has a small race window under concurrent creates on the same project —
// documented MVP limitation per the ticket, not fixed here.
export async function createTask(
  {
    projectId,
    columnId,
    title,
    description,
    type,
    priority,
    dueDate,
    assigneeId,
  },
  reporterId,
  boardId,
) {
  const {
    rows: [task],
  } = await db.query(
    `INSERT INTO tasks (project_id, board_id, column_id, task_number, title, description, type, priority, due_date, assignee_id, reporter_id, position)
     SELECT $1, $2, $3, COALESCE(MAX(task_number), 0) + 1, $4, $5, $6, $7, $8, $9, $10,
            COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE column_id = $3), 0)
     FROM tasks WHERE project_id = $1
     RETURNING ${taskRow()}`,
    [
      projectId,
      boardId,
      columnId,
      title,
      description ?? null,
      type ?? "task",
      priority ?? "medium",
      dueDate ?? null,
      assigneeId ?? null,
      reporterId,
    ],
  );
  return task;
}

// Edit Task ticket: title/description/type/priority ONLY — assignee and
// column/position each have their own dedicated endpoint (separate tickets).
export async function updateTaskFields(
  id,
  { title, description, type, priority },
) {
  const {
    rows: [task],
  } = await db.query(
    `UPDATE tasks SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       type = COALESCE($3, type),
       priority = COALESCE($4, priority),
       updated_at = now()
     WHERE id = $5
     RETURNING ${taskRow()}`,
    [title, description, type, priority, id],
  );
  return task;
}

export async function deleteTask(id) {
  await db.query("DELETE FROM tasks WHERE id = $1", [id]);
}

// Quick-assign: assigneeId may be null (to unassign).
export async function assignTask(id, assigneeId) {
  const {
    rows: [task],
  } = await db.query(
    `UPDATE tasks SET assignee_id = $1, updated_at = now() WHERE id = $2 RETURNING ${taskRow()}`,
    [assigneeId, id],
  );
  return task;
}

// Drag-and-drop move. See the prominent NOTE in the route file about why
// FOR UPDATE here doesn't actually protect against lost updates given
// db/client.js's single-Client setup.
export async function moveTask(id, columnId, position) {
  await db.query("BEGIN");
  try {
    const {
      rows: [before],
    } = await db.query("SELECT column_id FROM tasks WHERE id = $1 FOR UPDATE", [
      id,
    ]);

    const {
      rows: [task],
    } = await db.query(
      `UPDATE tasks SET column_id = COALESCE($1, column_id), position = COALESCE($2, position), updated_at = now()
       WHERE id = $3 RETURNING ${taskRow()}`,
      [columnId, position, id],
    );

    await db.query("COMMIT");
    return { task, previousColumnId: before.column_id };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

export async function logActivity(taskId, userId, action, details) {
  await db.query(
    "INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)",
    [taskId, userId, action, details ? JSON.stringify(details) : null],
  );
}
