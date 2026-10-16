import { Schema, type Document, type Model } from "mongoose";
import { getModel } from "@/lib/database/mongoose";

export interface IUserDoc extends Document {
  clerkUserId: string;
  email: string;
  name?: string;
  role: "student" | "admin";
  accessStatus: "active" | "suspended" | "pending";
  createdAt: Date;
  lastLoginAt?: Date;
}

const userSchema = new Schema<IUserDoc>(
  {
    clerkUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
    },
    accessStatus: {
      type: String,
      enum: ["active", "suspended", "pending"],
      default: "active",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

export const User: Model<IUserDoc> = getModel<IUserDoc>(
  "User",
  userSchema,
  "users",
);
