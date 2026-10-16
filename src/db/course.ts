import { Schema, type Model } from "mongoose";
import { type ICourseCount, type ICourses } from "@/interface";
import { getModel } from "@/lib/database/mongoose";

const courseSchema = new Schema<ICourses>({
  name: { type: String, required: true },
});

const courseCountSchema = new Schema<ICourseCount>({
  name: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
});

export const Course: Model<ICourses> = getModel<ICourses>(
  "Course",
  courseSchema,
  "courses",
);

const CourseCount: Model<ICourseCount> = getModel<ICourseCount>(
  "CourseCount",
  courseCountSchema,
  "coursecounts",
);

export default CourseCount;
