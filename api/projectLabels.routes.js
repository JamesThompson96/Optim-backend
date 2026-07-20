import { Router } from "express";
import requireUser from "#middleware/requireUser";
import { getProjectMembership } from "#db/queries/projects";
import { createLabel, getLabelsForProject } from "#db/queries/labels";

const router = Router();
router.use(requireUser);

// POST /projects/:id/labels — create label. body: { name, color }
router.post("/:id/labels", async (req, res) => {
  const membership = await getProjectMembership(req.params.id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { name, color } = req.body;
  if (!name || !color)
    return res.status(400).json({ error: "name and color are required" });

  try {
    const label = await createLabel(req.params.id, name, color);
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

// GET /projects/:id/labels — list all labels for a project
router.get("/:id/labels", async (req, res) => {
  const membership = await getProjectMembership(req.params.id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const labels = await getLabelsForProject(req.params.id);
  res.json({ labels });
});

export default router;
