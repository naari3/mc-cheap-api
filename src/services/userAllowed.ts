import { User } from "../models/user";
import * as Twitter from "twitter";

export class UserAllowed {
  user: User;
  twitterUserId: string;
  twitter: Twitter;
  constructor(
    accessTokenKey: string,
    accessTokenSecret: string,
    twitterUserId: string
  ) {
    this.twitterUserId = twitterUserId;
    /* eslint-disable @typescript-eslint/camelcase */
    this.twitter = new Twitter({
      consumer_key: process.env.TWITTER_CONSUMER_KEY,
      consumer_secret: process.env.TWITTER_CONSUMER_SECRET_KEY,
      access_token_key: accessTokenKey,
      access_token_secret: accessTokenSecret
    });
    /* eslint-enable @typescript-eslint/camelcase */
  }

  /**
   * allowed
   */
  public async allowed(): Promise<boolean> {
    /* eslint-disable @typescript-eslint/camelcase */
    const { ids } = (await this.twitter.get("friends/ids", {
      screen_name: "_naari_",
      count: 5000,
      stringify_ids: true
    })) as { ids: Array<string> };
    /* eslint-enable @typescript-eslint/camelcase */
    console.log(this.twitterUserId);
    return (
      ids.includes(this.twitterUserId) ||
      this.twitterUserId === "822483434173911041"
    );
  }
}
