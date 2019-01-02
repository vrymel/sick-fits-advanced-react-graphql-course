const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function createUserToken(user) {
  return jwt.sign({ userId: user.id }, process.env.APP_SECRET);
}
const TOKEN_COOKIE_KEY = "token";
function attachTokenCookie(ctx, token) {
  ctx.response.cookie(TOKEN_COOKIE_KEY, token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie
  });
}

const mutations = {
  async createItem(parent, args, ctx, info) {
    const item = await ctx.db.mutation.createItem(
      {
        data: { ...args }
      },
      info
    );

    return item;
  },
  async updateItem(parent, args, ctx, info) {
    const updates = { ...args };
    delete updates.id;

    const response = await ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id
        }
      },
      info
    );

    return response;
  },
  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id };

    // 1. find the item
    const item = await ctx.db.query.item({ where }, `{ id title }`);
    // 2. Check if they own that item, or have the permissions
    // TODO

    // 3. Delete it!
    const response = await ctx.db.mutation.deleteItem({ where }, info);

    return response;
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();

    const password = await bcrypt.hash(args.password, 10);

    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ["USER"] }
        }
      },
      info
    );

    const token = createUserToken(user);
    attachTokenCookie(ctx, token);

    return user;
  },
  async signin(parent, { email, password }, ctx, info) {
    // get user
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error(`User with email ${email} does not exist.`);
    }
    // check password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error("Invalid password.");
    }
    // create token
    const token = createUserToken(user);
    attachTokenCookie(ctx, token);
    // return user
    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie(TOKEN_COOKIE_KEY);

    return { message: "User logged out!" };
  }
};

module.exports = mutations;
