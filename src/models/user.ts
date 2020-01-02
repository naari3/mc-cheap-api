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
  twitterUserId: number;

  @Column
  twitterAccessToken: string;

  @Column
  twitterAccessTokenSecret: string;

  @Column
  allowed: boolean;

  @Column
  mcUsername: string;

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
