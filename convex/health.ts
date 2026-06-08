import { query } from "./_generated/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    return {
      authenticated: identity !== null,
      subject: identity?.subject ?? null,
      email: identity?.email ?? null,
      name: identity?.name ?? null,
    };
  },
});
