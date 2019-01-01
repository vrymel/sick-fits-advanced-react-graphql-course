const { forwardTo } = require("prisma-binding");

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
  }
};

module.exports = Query;
