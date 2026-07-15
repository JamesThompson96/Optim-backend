import { getMembership } from "#db/queries/workspaces";

/**
 * Confirms the logged-in user (req.user, set by getUserFromToken) is a
 * member of the workspace in req.params.id, and attaches the membership
 * row (with .role) to req.membership.
 *
 * Must run AFTER requireUser (so req.user exists).
 * Use alone on routes any member can hit, e.g. GET /workspaces/:id/members.
 */
export async function requireWorkspaceMember(req, res, next) {
  const workspaceId = req.params.id;
  const membership = await getMembership(workspaceId, req.user.id);

  if (!membership) {
    return res.status(403).send("You are not a member of this workspace.");
  }

  req.membership = membership;
  next();
}

/**
 * Confirms the logged-in user is an ADMIN of the workspace in req.params.id.
 * This is the Ticket 6 reusable check -- use it on every admin-only action:
 * inviting members, removing members, renaming the workspace, deleting the
 * workspace. Must run AFTER requireUser.
 */
export async function requireWorkspaceAdmin(req, res, next) {
  const workspaceId = req.params.id;
  const membership = await getMembership(workspaceId, req.user.id);

  if (!membership) {
    return res.status(403).send("You are not a member of this workspace.");
  }

  if (membership.role !== "admin") {
    return res.status(403).send("Only workspace admins can perform this action.");
  }

  req.membership = membership;
  next();
}
