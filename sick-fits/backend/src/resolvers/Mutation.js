const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { promisify } = require("util");
const { transport, makeANiceEmail } = require("../mail");
const { hasPermission } = require("../utils");

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

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

const mutations = {
  async createItem(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("Please login before creating an item");
    }

    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // This is how to create a relationship between the Item and the User
          user: {
            connect: {
              id: ctx.request.userId
            }
          },
          ...args
        }
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
    const item = await ctx.db.query.item({ where }, `{ id title user { id } }`);
    // 2. Check if they own that item, or have the permissions
    const ownsItem = item.user.id === ctx.request.userId;
    const canDeleteWithPermission = ctx.request.user.permissions.some(p =>
      ["ADMIN", "ITEMDELETE"].includes(p)
    );
    if (ownsItem || canDeleteWithPermission) {
      // 3. Delete it!
      return ctx.db.mutation.deleteItem({ where }, info);
    }

    throw new Error("You are not allowed to delete this item!");
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();

    const password = await hashPassword(args.password);

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
  },
  async requestReset(parent, { email }, ctx, info) {
    // get user
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error("User does not exist!");
    }

    // create reset token and expiry
    const resetToken = (await promisify(randomBytes)(20)).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // update user with token and expiry
    const updateResponse = await ctx.db.mutation.updateUser({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    // email
    const mailRes = await transport.sendMail({
      from: "hello@sickfit.com",
      to: user.email,
      subject: "Your password reset token",
      html: makeANiceEmail(`Your password reset token is here!
      \n\n
      <a href="${
        process.env.FRONTEND_URL
      }/reset?resetToken=${resetToken}">Click here to Reset</a>`)
    });

    return { message: "Password reset link sent!" };
  },
  async resetPassword(
    parent,
    { resetToken, password, confirmPassword },
    ctx,
    info
  ) {
    // 1. Check if the passwords match
    if (password !== confirmPassword) {
      throw new Error("The password don't match!");
    }

    // 2. Check if its a legit reset token
    // 3. Check if its expired
    const [user] = await ctx.db.query.users({
      where: {
        resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000 // 1 hour
      }
    });
    if (!user) {
      throw new Error("The token is invalid or expired!");
    }

    // 4. Hash their new password
    const newPassword = await hashPassword(password);

    // 5. Save the new password to the user and remove old resetToken fields
    const updatedUser = await ctx.db.mutation.updateUser({
      where: {
        id: user.id
      },
      data: {
        password: newPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    // 6. Generate JWT
    const jwtToken = createUserToken(updatedUser);

    // 7. Set the JWT cookie
    attachTokenCookie(ctx, jwtToken);

    // 8. Return the new user
    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You are not logged in");
    }

    hasPermission(ctx.request.user, ["ADMIN", "PERMISSIONUPDATE"]);

    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions
          }
        },
        where: {
          id: args.userId
        }
      },
      info
    );
  },
  async addToCart(_, args, ctx, info) {
    const { userId } = ctx.request;
    if (!userId) {
      throw new Error("You are not logged in");
    }

    const [existingItem] = await ctx.db.query.cartItems({
      where: {
        user: { id: userId },
        item: { id: args.id }
      }
    });

    if (existingItem) {
      return ctx.db.mutation.updateCartItem(
        {
          data: {
            quantity: existingItem.quantity + 1
          },
          where: {
            id: existingItem.id
          }
        },
        info
      );
    }

    return ctx.db.mutation.createCartItem(
      {
        data: {
          user: {
            connect: { id: userId }
          },
          item: {
            connect: { id: args.id }
          }
        }
      },
      info
    );
  }
};

module.exports = mutations;
