import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// this method(generateAccessAndRefreshTokens) creates for new accessToken & refreshToken.

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

// registerUser

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validation - not empty
  // check if user already exists : check through username and email
  // check for images , check for avatar
  // upload them to cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  //01- // get user details from frontend
  const { fullName, email, username, password } = req.body;
  // console.log("email", email);

  //02- validation - not empty
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  //console.log(req.files);

  // for avatar
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  // for coverImage
  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

// loginUser

const loginUser = asyncHandler(async (req, res) => {
  // take the data from -  req body (frontend).
  // username or email
  // find the user
  // password check
  // if password is correct then access token and refresh token will do generate
  // send the token in form of secure cookies - to User
  // and finally send a response that user successfully login.

  // take the data from -  req body.
  const { email, username, password } = req.body;
  console.log(email);

  // username or email
  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  //here is an alternative of above code based on logic discussion
  // if(!(username || email)){
  // throw new ApiError(400, "username or email is required")
  //}

  // find the user - by findOne i am finding user (username, email) in mangoose database - that is called Query.
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // always remember this point
  // user - this is your instance user name which is take from database
  // User - this is object of mongoose (mongoDB)

  // password check
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  // access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // send the token in form of secure cookies - to User

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

// how to user - logout

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out successfully"));
});

//  create end points of refreshAccessToken

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  // why i set name incomingRefreshToken because already present refreshToken in database(mongoDB - mongoose)
  // req.body.refreshToken define the mobile user refresh token
  //req.body.refreshToken define the desktop user refresh token

  // if incomingRefreshToken does not exist then

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  // verify the incomingRefreshToken by jwt
  // i want to raw token which is save in database(mongoDB-mongoose)
  //Asynchronously verify given token using a secret or a public key
  //to get a decoded token token - JWT string to verify secretOrPublicKey - A string or buffer containing either
  // the secret for HMAC algorithms, or the PEM encoded public key for RSA and ECDSA. If jwt.verify is called asynchronous

  // incomingRefreshToken changed in decoded token by jwt
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  
    // send a Query to mongoDB for finding a user by userId
  
    const user = await User.findById(decodedToken?._id);
    // always remember - i am using await because database are present other quantinent so await using for waiting.
    // i send Query in database(mongoDB-mongoose)
  
    // if user does not come because anyone give a fictisius token then first send error
  
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }
  
    // match the  1-incomingRefreshToken & 2-incomingRefreshToken after decoded token
    // incomingRefreshToken - this token is send by user
    // and other token is incomingRefreshToken after decoded
    // if both 1 & 2 toke are same to same then
    // so give the access to user because that person is same .
    // incomingRefreshToken ko decode karke jo hamne jo user find kiya h uske pass bhi ek token hoga
    // ab token same honge to matlab mamla theek h abhi
  
    // match the both token
  
    // if both do not same token
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(402, "refresh token is expired or used");
    }
  
    // if both tokens same then create new refreshToken by generateAccessAndRefreshTokens method
  
    // first of all send in cookies then put options
    // these options can create globally but that is right no problem
    // options are created
    const options = {
      httpOnly: true,
      secure: true,
    };
    // you can do generate token before options creation or after options creation - no problem
    // generate token by generateAccessAndRefreshTokens method
    // using await for waiting because database me save hone me kuchh time bhi lagega
    const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );
  
    // options will create then send response
  
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access token refreshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token")
  }
});

// finally end point come  so go to user.route.js and create refresh token. 

export { registerUser, loginUser, logoutUser, refreshAccessToken};
