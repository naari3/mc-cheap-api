import { send, json } from "micro";
import { router, get, post, put, options } from "microrouter";
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

const accessKeyId = process.env.AWS__ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS__SECRET_ACCESS_KEY;

const sequelize = new Sequelize(process.env.POSTGRES_URL);
sequelize.addModels([User]);
// sequelize.sync({});

const twitterAuth = microAuthTwitter({
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET_KEY,
  callbackUrl: `${process.env.RUNNING_URL}/auth/twitter/callback`,
  path: "/auth/twitter"
});

const jwtSecret = process.env.JWT_SECRET;

const region = process.env.AWS__REGION;
const AutoScalingGroupName = process.env.AWS__AUTO_SCALING_GROUP_NAME;

const creds = new AWS.Credentials(accessKeyId, secretAccessKey);
AWS.config.credentials = creds;

const autoscaling = new AWS.AutoScaling({ region });
const ssm = new AWS.SSM({ region });
const ec2 = new AWS.EC2({ region });

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

const runCommand = async (
  client: AWS.SSM,
  instanceId: string,
  command: string
): Promise<AWS.SSM.SendCommandResult> => {
  // aws ssm send-command --document-name "AWS-RunShellScript" --parameters '{"commands":["docker exec mc rcon-cli whitelist add naarisan"]}' --region ap-northeast-1 --instance-ids i-0516de45466169439
  // --parameters '{"commands":["docker exec mc rcon-cli whitelist add naarisan"]}'
  return new Promise((resolve, reject) => {
    client.sendCommand(
      {
        DocumentName: "AWS-RunShellScript",
        InstanceIds: [instanceId],
        Parameters: {
          commands: [command]
        }
      },
      (err, data) => {
        if (err !== null) {
          reject(err);
        } else {
          resolve(data);
        }
      }
    );
  });
};

const getTags = async (
  client: AWS.EC2,
  instanceId: string
): Promise<AWS.EC2.DescribeTagsResult> => {
  return new Promise((resolve, reject) => {
    client.describeTags(
      {
        Filters: [
          {
            Name: "key",
            Values: ["minecraft-status"]
          },
          { Name: "resource-id", Values: [instanceId] }
        ]
      },
      (err, data) => {
        if (err !== null) {
          reject(err);
        } else {
          resolve(data);
        }
      }
    );
  });
};

// const addWhitelist = async (username: string): Promise<>

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

const getInstance = async (): Promise<AWS.AutoScaling.Instance> => {
  const AutoScalingGroupNames = [AutoScalingGroupName];
  const result = await describeAutoScalingGroup(autoscaling, {
    AutoScalingGroupNames
  });
  const group = result.AutoScalingGroups.find(
    g => g.AutoScalingGroupName === AutoScalingGroupName
  );
  return group.Instances.find(i => i);
};

const replaceErrors = (key, value) => {
  if (value instanceof Error) {
    const error = {};

    Object.getOwnPropertyNames(value).forEach(function(key) {
      error[key] = value[key];
    });

    return error;
  }

  return value;
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

      put("/user", async (req, res) => {
        const user = await currentUser(token);
        if (!user) {
          await send(res, 404, { message: "not found" });
          return;
        }

        const params = (await json(req)) as { mcUsername: string };
        if (params.mcUsername) {
          const pattern = /^[a-zA-Z0-9_]{3,16}$/;
          if (!params.mcUsername.match(pattern)) {
            await send(res, 400, { message: "invalid pattern" });
            return;
          }
        }

        const instance = await getInstance();
        if (
          !instance ||
          !instance.InstanceId ||
          instance.LifecycleState !== "InService"
        ) {
          await send(res, 403, { message: "forbidden" });
          return;
        }

        if (instance.LifecycleState === "InService") {
          const tags = await getTags(ec2, instance.InstanceId);
          const mcStatus = tags.Tags.find(t => t.Key === "minecraft-status");
          if (mcStatus && mcStatus.Value === "starting") {
            await send(res, 403, { message: "forbidden" });
            return;
          }
        }

        const removeWhitelist = `docker exec mc rcon-cli whitelist remove ${user.mcUsername}`;
        const addWhitelist = `docker exec mc rcon-cli whitelist add ${params.mcUsername}`;
        await runCommand(ssm, instance.InstanceId, removeWhitelist);
        await runCommand(ssm, instance.InstanceId, addWhitelist);
        user.update({ mcUsername: params.mcUsername });

        await send(res, 200, { message: "ok", user });
      }),

      get("/instance_status", async (_, res) => {
        if (!(await currentUserAllowed(token))) {
          await send(res, 401, { message: "Unauthorized" });
          return;
        }

        const instance = await getInstance();

        let status /* "InService" | "Launching" | "Pending" | "Terminating" | "Terminated" */ =
          "Terminated";
        if (instance) {
          status = instance.LifecycleState;
        }
        if (status === "InService") {
          const tags = await getTags(ec2, instance.InstanceId);
          const mcStatus = tags.Tags.find(t => t.Key === "minecraft-status");
          if (mcStatus && mcStatus.Value === "starting") {
            status = "Launching";
          }
        }
        await send(res, 200, { message: "ok", status, instance });
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
          await send(res, 500, {
            message: "autherr",
            error: JSON.parse(JSON.stringify(auth.err, replaceErrors))
          });
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

export = async (req, res): Promise<void> => {
  try {
    cors(handler)(req, res);
  } catch (err) {
    await send(res, 500, {
      message: "err plz retry",
      error: JSON.parse(JSON.stringify(err, replaceErrors))
    });
    console.error({ err });
  }
};
