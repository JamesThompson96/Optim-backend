import { Router } from "express";
import requireUser from "#middleware/requireUser";
import { getProjectMembership } from "#db/queries/projects";
import {
  getLabelById,
  attachLabel,
  detachLabel,
  getTaskProjectId,
} from "#db/queries/labels";

const router = Router();
router.use(requireUser);

// POST /tasks/:id/labels — attach. body: { labelId }. No-op if already attached.
router.post("/:id/labels", async (req, res) => {
  const projectId = await getTaskProjectId(req.params.id);
  if (!projectId) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(projectId, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { labelId } = req.body;
  if (!labelId) return res.status(400).json({ error: "labelId is required" });

  const label = await getLabelById(labelId);
  if (!label || label.project_id !== projectId) {
    return res
      .status(400)
      .json({ error: "That label doesn't belong to this task's project" });
  }

  await attachLabel(req.params.id, labelId);
  res.status(201).json({ ok: true });
});

// DELETE /tasks/:id/labels/:labelId — detach
router.delete("/:id/labels/:labelId", async (req, res) => {
  const projectId = await getTaskProjectId(req.params.id);
  if (!projectId) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(projectId, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  await detachLabel(req.params.id, req.params.labelId);
  res.status(204).send();
});

export default router;
