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

async function getLabel(labelId) {
  const {
    rows: [label],
  } = await pool.query(
    "SELECT id, project_id, name, color FROM labels WHERE id = $1",
    [labelId],
  );
  return label || null;
}

async function getTaskProjectId(taskId) {
  const {
    rows: [task],
  } = await pool.query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
  return task?.project_id || null;
}

// POST /api/labels — create label. body: { projectId, name, color }
router.post("/", async (req, res) => {
  const { projectId, name, color } = req.body;
  if (!projectId || !name || !color) {
    return res
      .status(400)
      .json({ error: "projectId, name, and color are required" });
  }

  const membership = await getProjectMembership(projectId, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  try {
    const {
      rows: [label],
    } = await pool.query(
      "INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3) RETURNING id, project_id, name, color",
      [projectId, name, color],
    );
    res.status(201).json({ label });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({
          error: "A label with that name already exists on this project",
        });
    }
    throw err;
  }
});

// GET /api/labels?project_id=
router.get("/", async (req, res) => {
  const { project_id: projectId } = req.query;
  if (!projectId)
    return res
      .status(400)
      .json({ error: "project_id query param is required" });

  const membership = await getProjectMembership(projectId, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { rows: labels } = await pool.query(
    "SELECT id, project_id, name, color FROM labels WHERE project_id = $1 ORDER BY name ASC",
    [projectId],
  );
  res.json({ labels });
});

// PATCH /api/labels/:id — rename/recolor
router.patch("/:id", async (req, res) => {
  const label = await getLabel(req.params.id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  const membership = await getProjectMembership(label.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { name, color } = req.body;
  try {
    const {
      rows: [updated],
    } = await pool.query(
      `UPDATE labels SET name = COALESCE($1, name), color = COALESCE($2, color)
       WHERE id = $3
       RETURNING id, project_id, name, color`,
      [name, color, label.id],
    );
    res.json({ label: updated });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({
          error: "A label with that name already exists on this project",
        });
    }
    throw err;
  }
});

// DELETE /api/labels/:id — cascades to task_labels
router.delete("/:id", async (req, res) => {
  const label = await getLabel(req.params.id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  const membership = await getProjectMembership(label.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  await pool.query("DELETE FROM labels WHERE id = $1", [label.id]);
  res.status(204).send();
});

// POST /api/labels/:id/tasks/:taskId — attach label to task
router.post("/:id/tasks/:taskId", async (req, res) => {
  const label = await getLabel(req.params.id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  const membership = await getProjectMembership(label.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const taskProjectId = await getTaskProjectId(req.params.taskId);
  if (!taskProjectId) return res.status(404).json({ error: "Task not found" });
  if (taskProjectId !== label.project_id) {
    return res
      .status(400)
      .json({ error: "That label doesn't belong to this task's project" });
  }

  try {
    await pool.query(
      "INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)",
      [req.params.taskId, label.id],
    );
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "That label is already on this task" });
    }
    throw err;
  }

  res.status(201).json({ label });
});

// DELETE /api/labels/:id/tasks/:taskId — remove label from task
router.delete("/:id/tasks/:taskId", async (req, res) => {
  const label = await getLabel(req.params.id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  const membership = await getProjectMembership(label.project_id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  await pool.query(
    "DELETE FROM task_labels WHERE task_id = $1 AND label_id = $2",
    [req.params.taskId, label.id],
  );
  res.status(204).send();
});

export default router;
