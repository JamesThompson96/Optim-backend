import { Router } from "express";
import requireUser from "#middleware/requireUser";
import { getProjectMembership } from "#db/queries/projects";
import { getLabelById, deleteLabel } from "#db/queries/labels";

const router = Router();
router.use(requireUser);

// DELETE /labels/:id — deletes the label and its task_labels rows (cascade)
router.delete("/:id", async (req, res) => {
  const label = await getLabelById(req.params.id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  const membership = await getProjectMembership(label.project_id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  await deleteLabel(label.id);
  res.status(204).send();
});

export default router;
