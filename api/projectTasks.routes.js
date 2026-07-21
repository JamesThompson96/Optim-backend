import { Router } from "express";
import requireUser from "#middleware/requireUser";
import { getProjectMembership } from "#db/queries/projects";
import {
  getColumnForProject,
  createTask,
  logActivity,
} from "#db/queries/tasks";
import db from "#db/client";

const router = Router();
router.use(requireUser);

// POST /projects/:id/tasks — create task.
// body: { columnId, title, description?, type?, priority?, assigneeId? }
router.post("/:id/tasks", async (req, res) => {
  const projectId = req.params.id;
  const { columnId, title, description, type, priority, assigneeId } = req.body;

  if (!title || !columnId) {
    return res.status(400).json({ error: "title and columnId are required" });
  }

  const membership = await getProjectMembership(projectId, req.user.id);
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
    if (!assigneeMembership) {
      return res
        .status(400)
        .json({ error: "Assignee must be a member of this project" });
    }
  }

  const task = await createTask(
    { projectId, columnId, title, description, type, priority, assigneeId },
    req.user.id,
    column.board_id,
  );

  await logActivity(task.id, req.user.id, "created", { title });

  res.status(201).json({ task });
});

// GET /projects/:id/tasks — list tasks (no filters — see the separate
// Search & Filter ticket for query-param filtering).
router.get("/:id/tasks", async (req, res) => {
  const membership = await getProjectMembership(req.params.id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { rows: tasks } = await db.query(
    "SELECT * FROM tasks WHERE project_id = $1 ORDER BY column_id, position ASC",
    [req.params.id],
  );
  res.json({ tasks });
});

export default router;
