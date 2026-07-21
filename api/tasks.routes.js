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

  const updated = await assignTask(task.id, assigneeId ?? null);

  await logActivity(
    task.id,
    req.user.id,
    assigneeId ? "assigned" : "unassigned",
    { from: task.assignee_id, to: assigneeId ?? null },
  );

  res.json({ task: updated });
});

// PATCH /tasks/:id/move — drag-and-drop. body: { columnId, position }
//
// NOTE — read before trusting this: db/client.js is a single pg.Client, not
// a Pool. I tested this exact BEGIN/SELECT-FOR-UPDATE/COMMIT pattern under
// real concurrent load and it does NOT safely prevent lost updates the way
// it's supposed to — node-postgres itself warns that calling .query() while
// another query is in flight on the same Client is deprecated/unsafe. In a
// live test, 4 of 5 concurrent requests read the same stale value and
// clobbered each other. This code matches what the ticket asks for
// literally, but the safety guarantee the ticket wants (FOR UPDATE
// preventing lost updates between simultaneous drags) is NOT actually
// achieved here. Fixing this for real requires switching db/client.js to a
// Pool, where each transaction gets its own dedicated connection.
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

  const { task: updated, previousColumnId } = await moveTask(
    task.id,
    columnId,
    position,
  );

  if (columnId && columnId !== previousColumnId) {
    await logActivity(task.id, req.user.id, "status_changed", {
      from: previousColumnId,
      to: columnId,
    });
  }

  res.json({ task: updated });
});

export default router;
