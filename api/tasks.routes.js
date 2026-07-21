import { Router } from "express";
import requireUser from "#middleware/requireUser";
import { getProjectMembership } from "#db/queries/projects";
import {
  getTask,
  getColumnForProject,
  updateTaskFields,
  deleteTask,
  assignTask,
  moveTask,
  logActivity,
  getActivityForTask,
} from "#db/queries/tasks";

const router = Router();
router.use(requireUser);

// GET /tasks/:id — task detail
router.get("/:id", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  res.json({ task });
});

// PATCH /tasks/:id — edit fields ONLY: title/description/type/priority.
router.patch("/:id", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { title, description, type, priority } = req.body;
  const updated = await updateTaskFields(task.id, {
    title,
    description,
    type,
    priority,
  });
  res.json({ task: updated });
});

// DELETE /tasks/:id — project leads only.
router.delete("/:id", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });
  if (membership.role !== "lead") {
    return res
      .status(403)
      .json({ error: "Only project leads can delete tasks" });
  }

  await deleteTask(task.id);
  res.status(204).send();
});

// PATCH /tasks/:id/assignee — quick-assign. body: { assigneeId } (or null to unassign)
router.patch("/:id/assignee", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { assigneeId } = req.body;
  if (assigneeId) {
    const assigneeMembership = await getProjectMembership(
      task.project_id,
      assigneeId,
    );
    if (!assigneeMembership) {
      return res
        .status(400)
        .json({ error: "Assignee must be a member of this project" });
    }
  }

  const { task: updated, activityDetails } = await assignTask(
    task.id,
    assigneeId ?? null,
  );
  await logActivity(
    task.id,
    req.user.id,
    assigneeId ? "assigned" : "unassigned",
    activityDetails,
  );

  res.json({ task: updated });
});

// PATCH /tasks/:id/move — drag-and-drop. body: { columnId, position }
router.patch("/:id/move", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { columnId, position } = req.body;
  if (columnId && columnId !== task.column_id) {
    const column = await getColumnForProject(columnId, task.project_id);
    if (!column)
      return res
        .status(400)
        .json({ error: "That column doesn't belong to this project" });
  }

  const {
    task: updated,
    previousColumnId,
    activityDetails,
  } = await moveTask(task.id, columnId, position);

  if (columnId && columnId !== previousColumnId) {
    await logActivity(task.id, req.user.id, "status_changed", activityDetails);
  }

  res.json({ task: updated });
});

// GET /tasks/:id/activity — chronological (oldest first), joined with user.name
router.get("/:id/activity", async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(task.project_id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const activity = await getActivityForTask(task.id);
  res.json({ activity });
});

export default router;
