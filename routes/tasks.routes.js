import { Router } from "express";
import { pool } from "#db/pool";
import { requireAuth } from "#middleware/auth";

const router = Router();
router.use(requireAuth);

async function getProjectMembership(projectId, userId) {
  const {
    rows: [m],
  } = await pool.query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  return m || null;
}

// Loads a task along with its parent project_id, so every route below can do
// one membership check without a second round trip.
async function getTask(taskId) {
  const {
    rows: [task],
  } = await pool.query(
    "SELECT id, project_id, board_id, column_id FROM tasks WHERE id = $1",
    [taskId],
  );
  return task || null;
}

// Confirms a column actually belongs to this project's board — prevents a
// client from moving a task into a column from a different project.
async function getColumnForProject(columnId, projectId) {
  const {
    rows: [col],
  } = await pool.query(
    `SELECT c.id, c.board_id, c.name
     FROM columns c
     JOIN boards b ON b.id = c.board_id
     WHERE c.id = $1 AND b.project_id = $2`,
    [columnId, projectId],
  );
  return col || null;
}

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

// POST /api/tasks — create task. body: { projectId, columnId, title, description?, type?, priority?, dueDate?, assigneeId? }
router.post("/", async (req, res) => {
  const {
    projectId,
    columnId,
    title,
    description,
    type,
    priority,
    dueDate,
    assigneeId,
  } = req.body;
  if (!projectId || !columnId || !title) {
    return res
      .status(400)
      .json({ error: "projectId, columnId, and title are required" });
  }

  const membership = await getProjectMembership(projectId, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const column = await getColumnForProject(columnId, projectId);
  if (!column)
    return res
      .status(400)
      .json({ error: "That column doesn't belong to this project" });

  if (assigneeId) {
    const assigneeMembership = await getProjectMembership(
      projectId,
      assigneeId,
    );
    if (!assigneeMembership)
      return res
        .status(400)
        .json({ error: "Assignee must be a member of this project" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // task_number is scoped per project (ENG-1, ENG-2, ...). This MAX+1 approach
    // has a small race window under concurrent inserts on the same project —
    // fine for MVP traffic, but worth revisiting (e.g. a per-project sequence
    // or SELECT ... FOR UPDATE) if that ever becomes a real problem.
    const {
      rows: [task],
    } = await client.query(
      `INSERT INTO tasks (project_id, board_id, column_id, task_number, title, description, type, priority, due_date, assignee_id, reporter_id, position)
       SELECT $1, $2, $3, COALESCE(MAX(task_number), 0) + 1, $4, $5, $6, $7, $8, $9, $10,
              COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE column_id = $3), 0)
       FROM tasks WHERE project_id = $1
       RETURNING ${taskRow()}`,
      [
        projectId,
        column.board_id,
        columnId,
        title,
        description || null,
        type || "task",
        priority || "medium",
        dueDate || null,
        assigneeId || null,
        req.user.sub,
      ],
    );

    await client.query(
      "INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, 'created', $3)",
      [task.id, req.user.sub, JSON.stringify({ title })],
    );

    await client.query("COMMIT");
    res.status(201).json({ task });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/tasks?project_id=&assignee=&label=&priority=&status=
router.get("/", async (req, res) => {
  const {
    project_id: projectId,
    assignee,
    label,
    priority,
    status,
  } = req.query;
  if (!projectId)
    return res
      .status(400)
      .json({ error: "project_id query param is required" });

  const membership = await getProjectMembership(projectId, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const conditions = ["t.project_id = $1"];
  const params = [projectId];

  if (assignee) {
    params.push(assignee);
    conditions.push(`t.assignee_id = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`t.priority = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.column_id = $${params.length}`);
  }

  let labelJoin = "";
  if (label) {
    params.push(label);
    labelJoin = `JOIN task_labels tl ON tl.task_id = t.id AND tl.label_id = $${params.length}`;
  }

  const { rows: tasks } = await pool.query(
    `SELECT ${taskRow("t.")}, u.name AS assignee_name
     FROM tasks t
     ${labelJoin}
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.column_id, t.position ASC`,
    params,
  );
  res.json({ tasks });
});

// GET /api/tasks/:id — task detail, including its labels
router.get("/:id", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const {
    rows: [full],
  } = await pool.query(
    `SELECT ${taskRow("t.")},
            assignee.name AS assignee_name, reporter.name AS reporter_name
     FROM tasks t
     LEFT JOIN users assignee ON assignee.id = t.assignee_id
     JOIN users reporter ON reporter.id = t.reporter_id
     WHERE t.id = $1`,
    [task.id],
  );

  const { rows: labels } = await pool.query(
    `SELECT l.id, l.name, l.color FROM labels l
     JOIN task_labels tl ON tl.label_id = l.id
     WHERE tl.task_id = $1`,
    [task.id],
  );

  res.json({ task: { ...full, labels } });
});

// PATCH /api/tasks/:id — edit fields; quick-assign (assigneeId); drag-drop (columnId/position)
router.patch("/:id", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const {
    title,
    description,
    type,
    priority,
    dueDate,
    assigneeId,
    columnId,
    position,
  } = req.body;

  let newColumn = null;
  if (columnId && columnId !== task.column_id) {
    newColumn = await getColumnForProject(columnId, task.project_id);
    if (!newColumn)
      return res
        .status(400)
        .json({ error: "That column doesn't belong to this project" });
  }

  if (assigneeId) {
    const assigneeMembership = await getProjectMembership(
      task.project_id,
      assigneeId,
    );
    if (!assigneeMembership)
      return res
        .status(400)
        .json({ error: "Assignee must be a member of this project" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      rows: [before],
    } = await client.query(
      "SELECT column_id, assignee_id FROM tasks WHERE id = $1 FOR UPDATE",
      [task.id],
    );

    const {
      rows: [updated],
    } = await client.query(
      `UPDATE tasks SET
         title       = COALESCE($1, title),
         description = COALESCE($2, description),
         type        = COALESCE($3, type),
         priority    = COALESCE($4, priority),
         due_date    = COALESCE($5, due_date),
         assignee_id = CASE WHEN $6::boolean THEN $7::uuid ELSE assignee_id END,
         column_id   = COALESCE($8, column_id),
         position    = COALESCE($9, position)
       WHERE id = $10
       RETURNING ${taskRow()}`,
      [
        title,
        description,
        type,
        priority,
        dueDate,
        Object.prototype.hasOwnProperty.call(req.body, "assigneeId"),
        assigneeId || null,
        columnId,
        position,
        task.id,
      ],
    );

    if (columnId && columnId !== before.column_id) {
      await client.query(
        "INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, 'status_changed', $3)",
        [
          task.id,
          req.user.sub,
          JSON.stringify({ from: before.column_id, to: columnId }),
        ],
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(req.body, "assigneeId") &&
      assigneeId !== before.assignee_id
    ) {
      await client.query(
        "INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, 'assigned', $3)",
        [
          task.id,
          req.user.sub,
          JSON.stringify({ from: before.assignee_id, to: assigneeId || null }),
        ],
      );
    }

    await client.query("COMMIT");
    res.json({ task: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  await pool.query("DELETE FROM tasks WHERE id = $1", [task.id]);
  res.status(204).send();
});

// GET /api/tasks/:id/activity
router.get("/:id/activity", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { rows: activity } = await pool.query(
    `SELECT a.id, a.action, a.details, a.created_at, u.name AS user_name
     FROM activity_log a
     JOIN users u ON u.id = a.user_id
     WHERE a.task_id = $1
     ORDER BY a.created_at ASC`,
    [task.id],
  );
  res.json({ activity });
});

export default router;
