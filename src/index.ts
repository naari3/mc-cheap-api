import { send } from "micro";
import { router, get, post } from "microrouter";
import * as microAuthTwitter from "microauth-twitter";

import { Sequelize } from "sequelize-typescript";
import { User } from "./models/user";

import * as AWS from "aws-sdk";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const sequelize = new Sequelize(process.env.POSTGRES_URL);
sequelize.addModels([User]);
sequelize.sync({ force: true });
sequelize.sync({});

const options = {
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET_KEY,
  callbackUrl: "http://localhost:3000/auth/twitter/callback",
  path: "/auth/twitter"
};
const twitterAuth = microAuthTwitter(options);

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

export = twitterAuth(async (req, res, auth) => {
  const routes = router(
    get("/", async (_, res) => {
      await send(res, 200, { message: "Hello World" });
    }),

    get("/instance_status", async (_, res) => {
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
      const DesiredCapacity = 1;
      const result = await updateAutoScalingGroup(autoscaling, {
        AutoScalingGroupName,
        DesiredCapacity
      });
      await send(res, 200, { message: "ok", result });
    }),

    get("/instance_status", async (_, res) => {
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

    get("/auth/twitter/callback", async (req, res) => {
      console.log(auth.result);
      auth.result.info.name;
      auth.result.info.screen_name;
      auth.result.info.id;
      auth.result.accessToken;
      auth.result.accessTokenSecret;
      const [
        name,
        twitterScreenName,
        twitterUserId,
        twitterAccessToken,
        twitterAccessTokenSecret,
        allowed
      ] = [
        auth.result.info.name,
        auth.result.info.screen_name,
        auth.result.info.id,
        auth.result.accessToken,
        auth.result.accessTokenSecret,
        false
      ];
      console.log(
        name,
        twitterScreenName,
        twitterUserId,
        twitterAccessToken,
        twitterAccessTokenSecret,
        allowed
      );
      await send(res, 200, { message: "ok", auth });
    })
  );
  routes(req, res);
});
