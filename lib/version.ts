/** Short commit id of the running build. Vercel sets VERCEL_GIT_COMMIT_SHA on every deployment. */
export const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7);
