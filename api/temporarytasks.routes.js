import { Router } from "express";
import requireUser from "#middleware/requireUser";
import db from "#db/client";
import { getProjectMembership, getProjectById } from "#db/queries/projects";

const router = Router();
router.use(requireUser);

const STATUSES = ["todo", "in_progress", "review", "blocked", "completed"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

async function getProjectAccess(projectId, userId) {
  const project = await getProjectById(projectId);
  if (!project) return null;
  const isMember = await getProjectMembership(projectId, userId);
  const isLead = project.owner_id === userId;
  return { project, isMember: isMember || isLead, isLead };
}

async function columnBelongsToProject(columnId, projectId) {
  if (columnId == null) return true;
  const {
    rows: [column],
  } = await db.query(
    `SELECT c.id FROM columns c JOIN boards b ON b.id = c.board_id
     WHERE c.id = $1 AND b.project_id = $2`,
    [columnId, projectId],
  );
  return !!column;
}

function logActivity(taskId, userId, action, details = null) {
  return db.query(
    `INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
    [taskId, userId, action, details ? JSON.stringify(details) : null],
  );
}

router.post("/", async (req, res) => {
  const {
    project_id,
    epic_id = null,
    column_id = null,
    assigned_to = null,
    title,
    description = null,
    status,
    priority,
    due_date = null,
    blocked_by_task_id = null,
  } = req.body;

  if (!project_id || !title || !status || !priority) {
    return res
      .status(400)
      .json({ error: "project_id, title, status, and priority are required" });
  }
  if (!STATUSES.includes(status))
    return res
      .status(400)
      .json({ error: `status must be one of ${STATUSES.join(", ")}` });
  if (!PRIORITIES.includes(priority))
    return res
      .status(400)
      .json({ error: `priority must be one of ${PRIORITIES.join(", ")}` });

  const access = await getProjectAccess(project_id, req.user.id);
  if (!access) return res.status(404).json({ error: "Project not found" });
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });
  if (!(await columnBelongsToProject(column_id, project_id))) {
    return res
      .status(400)
      .json({ error: "column_id does not belong to a board on this project" });
  }

  const {
    rows: [task],
  } = await db.query(
    `INSERT INTO tasks (project_id, epic_id, column_id, assigned_to, title, description, status, priority, due_date, blocked_by_task_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      project_id,
      epic_id,
      column_id,
      assigned_to,
      title,
      description,
      status,
      priority,
      due_date,
      blocked_by_task_id,
    ],
  );
  await logActivity(task.id, req.user.id, "created");
  res.status(201).json({ task });
});

router.get("/", async (req, res) => {
  const { project_id, assignee, priority, status, column_id } = req.query;
  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  const access = await getProjectAccess(project_id, req.user.id);
  if (!access) return res.status(404).json({ error: "Project not found" });
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });

  const clauses = ["project_id = $1"];
  const params = [project_id];
  if (assignee) {
    params.push(assignee);
    clauses.push(`assigned_to = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    clauses.push(`priority = $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (column_id) {
    params.push(column_id);
    clauses.push(`column_id = $${params.length}`);
  }

  const { rows: tasks } = await db.query(
    `SELECT * FROM tasks WHERE ${clauses.join(" AND ")} ORDER BY created_at ASC`,
    params,
  );
  res.json({ tasks });
});

router.get("/:id", async (req, res) => {
  const {
    rows: [task],
  } = await db.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const access = await getProjectAccess(task.project_id, req.user.id);
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });
  res.json({ task });
});

router.patch("/:id", async (req, res) => {
  const {
    rows: [task],
  } = await db.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const access = await getProjectAccess(task.project_id, req.user.id);
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });

  const fields = [
    "epic_id",
    "column_id",
    "assigned_to",
    "title",
    "description",
    "status",
    "priority",
    "due_date",
    "blocked_by_task_id",
  ];
  const updates = {};
  for (const f of fields) if (f in req.body) updates[f] = req.body[f];

  if (updates.status && !STATUSES.includes(updates.status))
    return res
      .status(400)
      .json({ error: `status must be one of ${STATUSES.join(", ")}` });
  if (updates.priority && !PRIORITIES.includes(updates.priority))
    return res
      .status(400)
      .json({ error: `priority must be one of ${PRIORITIES.join(", ")}` });
  if (
    "column_id" in updates &&
    !(await columnBelongsToProject(updates.column_id, task.project_id))
  ) {
    return res
      .status(400)
      .json({ error: "column_id does not belong to a board on this project" });
  }
  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: "No updatable fields provided" });

  const setCols = Object.keys(updates);
  const setSql = setCols.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const {
    rows: [updated],
  } = await db.query(
    `UPDATE tasks SET ${setSql}, updated_at = now() WHERE id = $1 RETURNING *`,
    [task.id, ...setCols.map((c) => updates[c])],
  );
  await logActivity(task.id, req.user.id, "updated", updates);
  res.json({ task: updated });
});

router.delete("/:id", async (req, res) => {
  const {
    rows: [task],
  } = await db.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const access = await getProjectAccess(task.project_id, req.user.id);
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });
  await db.query("DELETE FROM tasks WHERE id = $1", [task.id]);
  res.status(204).send();
});

router.get("/:id/activity", async (req, res) => {
  const {
    rows: [task],
  } = await db.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const access = await getProjectAccess(task.project_id, req.user.id);
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });
  const { rows: activity } = await db.query(
    "SELECT * FROM activity_log WHERE task_id = $1 ORDER BY created_at DESC",
    [task.id],
  );
  res.json({ activity });
});

export default router;
