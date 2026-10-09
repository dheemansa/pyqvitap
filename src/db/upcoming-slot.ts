import { type IUpcomingSlot } from "@/interface";
import { Schema, type Model } from "mongoose";
import { getModel } from "@/lib/database/mongoose";

const upcomingSlotSchema = new Schema<IUpcomingSlot>({
  slot: { type: String, required: true, unique: true },
  lastSyncedDate: { type: String },
  syncMode: {
    type: String, 
    enum: ["CAT", "FAT"],
    default: "CAT",
  },
});

const UpcomingSlot: Model<IUpcomingSlot> =
  getModel<IUpcomingSlot>("UpcomingSlot", upcomingSlotSchema);

export default UpcomingSlot;
