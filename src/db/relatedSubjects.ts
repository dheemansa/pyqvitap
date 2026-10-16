import { Schema, type Model } from "mongoose";
import { type IRelatedSubject } from "@/interface";
import { getModel } from "@/lib/database/mongoose";

const relatedSubjectSchema = new Schema<IRelatedSubject>({
  subject: { type: String, required: true },
  related_subjects: { type: [String], required: true },
});

const RelatedSubject: Model<IRelatedSubject> = getModel<IRelatedSubject>(
  "RelatedSubject",
  relatedSubjectSchema,
);

export default RelatedSubject;
