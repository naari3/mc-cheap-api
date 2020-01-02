import { User } from "../models/user";
import * as Twitter from "twitter";

export class UserAllowed {
  user: User;
  twitter: Twitter;
  constructor(u: User) {
    this.user = u;
    /* eslint-disable @typescript-eslint/camelcase */
    this.twitter = new Twitter({
      consumer_key: process.env.TWITTER_CONSUMER_KEY,
      consumer_secret: process.env.TWITTER_CONSUMER_SECRET_KEY,
      access_token_key: u.twitterAccessToken,
      access_token_secret: u.twitterAccessTokenSecret
    });
    /* eslint-enable @typescript-eslint/camelcase */
  }

  /**
   * allowed
   */
  public async allowed(): Promise<boolean> {
    /* eslint-disable @typescript-eslint/camelcase */
    const { ids } = (await this.twitter.get("friends/ids", {
      screen_name: "",
      count: 5000
    })) as { ids: Array<number> };
    /* eslint-enable @typescript-eslint/camelcase */
    console.log({ user: this.user, id: this.user.twitterUserId });
    return (
      ids.includes(this.user.twitterUserId) ||
      this.user.twitterUserId === 822483434173911000
    );
  }
}
