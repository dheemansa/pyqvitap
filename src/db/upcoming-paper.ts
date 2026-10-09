import { Schema, type Model } from "mongoose";
import { type IUpcomingSubject } from "@/interface";
import { getModel } from "@/lib/database/mongoose";

const upcomingSubjectSchema = new Schema<IUpcomingSubject>({
  subject: { type: String, required: true },
  slots: { type: [String], required: true },
});

const UpcomingSubject: Model<IUpcomingSubject> =
  getModel<IUpcomingSubject>("UpcomingSubject", upcomingSubjectSchema);

export default UpcomingSubject;
