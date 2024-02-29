import { Router } from "express";
import {
  loginUser,
  logoutUser,
  registerUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);

// secured routes - because user should be logged in .
router.route("/logout").post(verifyJWT, logoutUser);
//create a end point of refresh token
router.route("/refresh-token").post(refreshAccessToken);

// in refresh-token- no  need verifyJWT because already refresh token verify in controller.js file

// change password -route

router.route("/change-password").post(verifyJWT, changeCurrentPassword);

// get current user - route
router.route("/current-user").get(verifyJWT, getCurrentUser);

// jab url se aa rha ho to - params use kare
// jab body se aa data aa rha ho to - post use krte hai

// updateAccountDetails - route
router.route("/update-account").patch(verifyJWT, updateAccountDetails);
// yaha par (patch) use kare na ki (post) kuki keval ek ko update krna hai
// agar (post) use karenge to sari details update ho jayegi

// updateUserAvatar - route
router
  .route("/avatar")
  .patch(verifyJWT, upload.single("avatar"), updateUserAvatar);

//coverImage - route

router
  .route("/cover-image")
  .patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage);

// username - route
router.route("/c/:username").get(verifyJWT, getUserChannelProfile);

// watchHistory - user
router.route("/history").get(verifyJWT, getWatchHistory);

export default router;
