import { send, json } from "micro";
import { router, get, post, options } from "microrouter";
import * as microAuthTwitter from "microauth-twitter";
import * as Cors from "micro-cors";

const cors = Cors({ origin: `${process.env.WEB_HOST}`, maxAge: 60 * 10 });

import { Sequelize } from "sequelize-typescript";
import { User } from "./models/user";

import * as jwt from "jsonwebtoken";
import * as cookie from "cookie";

import * as cookieParse from "micro-cookie";

import * as AWS from "aws-sdk";

const HOSTNAME = process.env.HOSTNAME;

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const sequelize = new Sequelize(process.env.POSTGRES_URL);
sequelize.addModels([User]);
sequelize.sync({});

const twitterAuth = microAuthTwitter({
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET_KEY,
  callbackUrl: `${process.env.RUNNING_URL}/auth/twitter/callback`,
  path: "/auth/twitter"
});

const jwtSecret = process.env.JWT_SECRET;

const region = process.env.AWS_REGION;
const AutoScalingGroupName = process.env.AWS_AUTO_SCALING_GROUP_NAME;

const creds = new AWS.Credentials(accessKeyId, secretAccessKey);
AWS.config.credentials = creds;

const autoscaling = new AWS.AutoScaling({ region });

const updateAutoScalingGroup = async (
  client: AWS.AutoScaling,
  params: AWS.AutoScaling.UpdateAutoScalingGroupType
): Promise<object> => {
  return new Promise((resolve, reject) => {
    client.updateAutoScalingGroup(params, (err, data) => {
      if (err !== null) {
        reject(err);
      }
      resolve(data);
    });
  });
};

const describeAutoScalingGroup = async (
  client: AWS.AutoScaling,
  params: AWS.AutoScaling.Types.AutoScalingGroupNamesType
): Promise<AWS.AutoScaling.AutoScalingGroupsType> => {
  return new Promise((resolve, reject) => {
    client.describeAutoScalingGroups(params, (err, data) => {
      if (err !== null) {
        reject(err);
      }
      resolve(data);
    });
  });
};

const currentUser = async (token: string): Promise<User> => {
  try {
    const { id } = jwt.verify(token, jwtSecret) as { id: string };
    return User.findByPk(id);
  } catch (error) {
    return null;
  }
};

const currentUserAllowed = async (token: string): Promise<boolean> => {
  const user = await currentUser(token);
  return !!user && user.allowed;
};

const handler = cookieParse(async function(req, res) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // const token = ((req as any).cookies || {}).token || "";
  const token = (req.headers.authorization || "").replace("Bearer ", "");

  twitterAuth(async (req, res, auth) => {
    const routes = router(
      get("/", async (req, res) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await send(res, 200, { message: "Hello World" });
      }),

      get("/token", async (req, res) => {
        const token = ((req as any).cookies || {}).token || "";
        const user = await currentUser(token);
        if (user) {
          await send(res, 200, { message: "ok", token });
        } else {
          await send(res, 404, { message: "not found" });
        }
      }),

      get("/user", async (req, res) => {
        const user = await currentUser(token);
        if (user) {
          await send(res, 200, { message: "ok", user });
        } else {
          await send(res, 404, { message: "not found" });
        }
      }),

      get("/instance_status", async (_, res) => {
        if (!(await currentUserAllowed(token))) {
          await send(res, 401, { message: "Unauthorized" });
          return;
        }

        const AutoScalingGroupNames = [AutoScalingGroupName];
        const result = await describeAutoScalingGroup(autoscaling, {
          AutoScalingGroupNames
        });
        const group = result.AutoScalingGroups.find(
          g => g.AutoScalingGroupName === AutoScalingGroupName
        );
        const instance = group.Instances.find(i => i);

        let status /* "Pending" | "InService" | "Terminating" | "Terminated" */ =
          "Terminated";
        if (instance) {
          status = instance.LifecycleState;
        }
        await send(res, 200, { message: "ok", status, result });
      }),

      post("/boot", async (_, res) => {
        if (!(await currentUserAllowed(token))) {
          await send(res, 401, { message: "Unauthorized" });
          return;
        }
        78;
        const DesiredCapacity = 1;
        const result = await updateAutoScalingGroup(autoscaling, {
          AutoScalingGroupName,
          DesiredCapacity
        });
        await send(res, 200, { message: "ok", result });
      }),

      get("/auth/twitter/callback", async (_, res) => {
        if (auth.err) {
          await send(res, 500, { message: "err" });
          return;
        }
        const u = await User.findOrCreateByAuth(auth);
        const token = jwt.sign({ id: u.id }, jwtSecret, {
          algorithm: "HS256",
          expiresIn: 60 * 60 * 24 * 30
        });
        const setCookie = cookie.serialize("token", token, {
          domain: HOSTNAME,
          httpOnly: true,
          maxAge: 60 * 60 * 24 * 30,
          path: "/"
        });
        res.setHeader("Set-Cookie", setCookie);
        res.setHeader("Location", process.env.WEB_HOST);
        res.statusCode = 302;
        res.end();
      }),
      get("/*", async (_, res) => {
        await send(res, 404, { message: "not found" });
      }),
      options("/*", async (req, res) => {
        res.end();
      })
    );
    routes(req, res);
  })(req, res);
});

export = cors(handler);
