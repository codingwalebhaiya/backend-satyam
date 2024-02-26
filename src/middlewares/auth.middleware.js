import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken"
import { User } from "../models/user.models.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

     // console.log(token)

    // if token does not exist then
    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    // if token exist then

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // if user is present
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    // if user does not present

    if (!user) {
      // video no-15: discuss about frontend
      throw new ApiError(401, "Invalid Access Token");
    }

    // if you confirm 100% about user then

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid accessToken");
  }
});
