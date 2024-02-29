import mongoose, { Schema } from "mongoose";

// like ke under pagination ka kaam nhi hota hai
// mongooseAggregatePaginate - iske madhyam se set kiya jata hai ki jaise
// phle 5 ya 7 comment user ko dikhege aur bhi dekh skta hai user - ye pagination process me hota hai
// same aese video ke liye set kiya jata

const likeSchema = new Schema(
  {
    comment: {
      type: Schema.type.ObjectId,
      ref: "Comment",
    },
    video: {
      type: Schema.type.ObjectId,
      ref: "Video",
    },
    tweet: {
      type: Schema.type.ObjectId,
      ref: "Tweet",
    },
    likedBy: {
      type: Schema.type.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

export const Like = mongoose.model("Like", likeSchema);
