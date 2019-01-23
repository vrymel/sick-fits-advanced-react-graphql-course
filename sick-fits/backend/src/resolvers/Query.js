const { forwardTo } = require("prisma-binding");
const { hasPermission } = require("../utils");

const Query = {
  items: forwardTo("db"),
  item: forwardTo("db"),
  itemsConnection: forwardTo("db"),
  me(parent, args, ctx, info) {
    if (ctx.request.userId) {
      return ctx.db.query.user(
        {
          where: { id: ctx.request.userId }
        },
        info
      );
    }

    return null;
  },
  async users(parent, args, ctx, info) {
    // 1. check if logged in
    if (!ctx.request.userId) {
      throw new Error("User is not logged in");
    }
    // 2. check if user has permissions
    hasPermission(ctx.request.user, ["ADMIN", "PERMISSIONUPDATE"]);

    // 3. get all users and return
    const allUsers = await ctx.db.query.users({}, info);

    return allUsers;
  },
  async order(_parent, args, ctx, info) {
    // 1. check if logged in
    if (!ctx.request.userId) {
      throw new Error("User is not logged in");
    }

    const order = await ctx.db.query.order(
      {
        where: { id: args.id }
      },
      info
    );

    const isOwner = order.user.id === ctx.request.userId;
    const isAdmin = ctx.request.user.permissions.includes("ADMIN");

    if (!isOwner || !isAdmin) {
      throw new Error("You cant view this please");
    }

    return order;
  }
};

module.exports = Query;
