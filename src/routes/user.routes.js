import { Router } from "express";
import { loginUser, logoutUser, registerUser,refreshAccessToken } from "../controllers/user.controller.js";
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
        name:"coverImage",
        maxCount: 1
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser)

// secured routes - because user should be logged in . 
router.route("/logout").post(verifyJWT, logoutUser)
//create a end point of refresh token 
router.route("/refresh-token").post(refreshAccessToken)

// in refresh-token- no  need verifyJWT because already refresh token verify in controller.js file 


export default router;

