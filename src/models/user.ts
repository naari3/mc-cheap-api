import {
  Table,
  Column,
  Model,
  PrimaryKey,
  IsUUID,
  Default,
  AllowNull,
  DataType,
  Unique
} from "sequelize-typescript";
import * as uuid from "uuid/v4";

import { UserAllowed } from "../services/userAllowed";

// import * as pg from "pg";
// pg.defaults.parseInt8 = true;

@Table({ timestamps: true })
export class User extends Model<User> {
  @AllowNull(false)
  @IsUUID(4)
  @PrimaryKey
  @Default(uuid())
  @Column(DataType.UUID)
  id: string;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  twitterScreenName: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.BIGINT)
  twitterUserId: string;

  @Column
  twitterAccessToken: string;

  @Column
  twitterAccessTokenSecret: string;

  @Column
  allowed: boolean;

  @Column
  mcUsername: string;

  /**
   * findOrCreateByAuth
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOrCreateByAuth(auth: any): Promise<User> {
    const [
      name,
      twitterScreenName,
      twitterUserId,
      twitterAccessToken,
      twitterAccessTokenSecret
    ] = [
      auth.result.info.name,
      auth.result.info.screen_name,
      auth.result.info.id_str,
      auth.result.accessToken,
      auth.result.accessTokenSecret
    ];
    let u = await User.findOne({ where: { twitterUserId } });
    const allowed = await new UserAllowed(
      twitterAccessToken,
      twitterAccessTokenSecret,
      twitterUserId
    ).allowed();
    if (u) {
      u.update({
        name,
        twitterScreenName,
        twitterAccessToken,
        twitterAccessTokenSecret,
        allowed
      });
    } else {
      console.log({
        name,
        twitterScreenName,
        twitterUserId,
        twitterAccessToken,
        twitterAccessTokenSecret,
        allowed
      });
      u = await User.create({
        name,
        twitterScreenName,
        twitterUserId,
        twitterAccessToken,
        twitterAccessTokenSecret,
        allowed
      });
    }
    return u;
  }

  /**
   * toJSON
   */
  public toJSON(): object {
    const [id, name, twitterScreenName, twitterUserId, allowed, mcUsername] = [
      this.id,
      this.name,
      this.twitterScreenName,
      this.twitterUserId,
      this.allowed,
      this.mcUsername
    ];
    return { id, name, twitterScreenName, twitterUserId, allowed, mcUsername };
  }
}
