import process from "node:process";

/**
 * Protect backend API routes with the configured shared API key.
 * @param {Function} getApiKey Retrieves the current key without retaining a stale environment value.
 * @returns {Function} Express middleware accepting x-api-key or Bearer credentials.
 */
export function createApiKeyMiddleware(getApiKey = () => process.env.API_KEY) {
  return (req, res, next) => {
    const provided =
      req.header("x-api-key") ||
      req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const expected = getApiKey();
    if (!expected || provided !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };
}
