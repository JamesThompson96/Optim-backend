import { Router } from "express";
import requireUser from "#middleware/requireUser";
import { getProjectMembership } from "#db/queries/projects";
import { getAnalytics } from "#db/queries/analytics";

const router = Router();
router.use(requireUser);

// GET /projects/:id/analytics?weeks=6
router.get("/:id/analytics", async (req, res) => {
  const membership = await getProjectMembership(req.params.id, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const weeks = req.query.weeks ? parseInt(req.query.weeks, 10) : 6;
  const analytics = await getAnalytics(req.params.id, weeks);
  res.json(analytics);
});

export default router;
