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
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

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
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

// finally end point come  so go to user.route.js and create refresh token.

const changeCurrentPassword = asyncHandler(async (req, res) => {
  //isme hame ka user se currentPassword change karana hai
  // currentPassword change krte time hame koi tension nhi h ki user login hai ya nhi ya cookies hai ya nhi
  // because hame pta hai ki jab route banunga to wha par verify-jwt lga denge
  //middleware isi kaam ke liye to banaya tha
  // ab user se currentPassword change karate time user se kitne field lete h
  // ye aapke upar hai , kucch log newPassword ke sath confirmPassword bhi lete h , ye aap pr depend krta hai
  // confirmPassword  lete time ek addition check krna pdta hai ki kya newPassword aur confirmPassword same hai
  // agar same to sahi hai nhi to ek error throw kar do- vaise ye checking frontend me hi ho jati hai . itni jaruri nhi ha backend me krne ke liye
  // but if you want to do in backend then no problem.

  const { oldPassword, newPassword, confPassword } = req.body;

  // ab confirmPassword bhi set krna chahte hai to check kare ki kya newPassword aur confirmPassword same hai
  // agar nhi hai to error throw kare

  if (!(newPassword === confPassword)) {
    throw new ApiError(400, " Invalid confirm password");
  }

  // ab hame sbse phle ek user chahiye tabhi to mai uske field me jake password verify kara paunga.
  // but user kaise lu- agar vo apna password  change kr pa rha hai to vo loggedIn to hai
  // ye loggedIn kaise ho payega kuki middleware lagaya hai
  // middle karta kya hai -> req.user
  // req.user = user
  // isme user hai joki auth middleware ke req.user se mil rha hai
  // auth middleware chla hai to confirm si baat hai ki req.user ke under user hai . aur waha se mai userId nikal skta hu.
  // is user se hame userId mil jayega
  // to user id nikal lete hai

  const user = await User.findById(user?._id);
  // kuki database (mongoDB-mongoose) ka kaam hai to await lagana padega kuki database dusre continent me hota hai
  // ab aapne ye user find kiya hai iske sath ko select to aapne lagaya nhi
  // to password bhi sath aa gya hai
  // lekin password yha se q hi check krna kuki jab hamne user.models.js me isPasswordCorrect mathod banaya tha
  // isPasswordCorrect method ka use password checking ke liye lagange
  // isPasswordCorrect method - true or false dega
  // kuki jo user aaya uske pass isPasswordCorrect method hai to
  // isPasswordCorrect(oldPassword)- ya to true ya false dega

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  // if password does not correct then

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  // ab kuki oldPassword correct hai to ham newPassword set karenge

  user.password = newPassword;

  // ab jaise hi ye trigger hoga to ham jayenge user.model.js me  jaha password set kar rahe ho
  // "user.model.js me password save ho rha hai lekin save hone se phle kuki pre lga hai
  // to save hone se phle ye code chalega (userSchema.pre)

  // userSchema.pre("save", async function (next) {
  //if(!this.isModified("password")){
  //return next();
  //}
  //this.password = await bcrypt.hash(this.password, 10)
  //next()
  //} )"

  // password Modified hai kuki oldPassword se newPassword set ker rahe hai
  // so bcrypt.hash wala code chalega

  // abhi tak newPassword ko set kiya tha save nhi
  // to ab newPassword ko save krte hai
  // newPassword save karte time mujhe aur validate nahi lagana hai

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

// ek aur method har jagah aayega
// ab aapko ek endpoint banana hoga jisse aap ek current user ko get kr pao
// aapko yaad hoga aapne middleware (auth.middleware.js) lagya hai
// req.user = user
// pora ka pora user aapne inject kr diya tha
// to ab user loggedIn hai to usko mai 2 minute me current user de skta hu

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));

  // kuki aapki request par middleware run ho chuka hai. ab us object me  user inject ho chuka hai
  // ab use return kr do
});

// abhi hamne keval password change kiya  hai
// kuki password ka usually ek alag page hota hai
// but baki details user ki update krni hoto - kaise karoge ?
// usually as a backend engineer aapko decide krna hota hai
// ki kya kya mai allow kr rha hu user ko change karne ke liye (user ko kya change krna hai kya nhi )
// example ke taur par jaise youtube channel ka username hai .
// youtube username ko change krne me limit lga kar rkha hai I think - 3 month me 3 times hi change kr skte ho
// ye sab aap pr depend krta hai ki aap aapne app / webapp me kya function kya limit rkhna chahte hai

// ab aapko jo jo details chahiye aap le lijiye

const updateAccountDetails = asyncHandler(async (req, res) => {
  // sabse phle req.body user ki information leni padegi

  // always remember- kahi par agar koi file update kra rahe ho to uske liye alag controller rakhiaga
  // i mean alag endpoint rakhiaga , vaise ek me bhi rakh sak skte hai
  // but maine jyadatar dekha hai production level app me file k liye alag rhta hai
  // user sirf apni image update krna chahta hai to use wahi k wahi image update save krne ka options dedo aur endpoints hit kr do apna kaam ho jayega

  // but agar pura user vapas se save krte hai to text data bhi baar baar jata hai isliye file k liye alag se controller banana better approach hai
  // to kafi conjetion kam hota hai network k under - controller alag banane se

  const { fullName, email } = req.body;

  // if fullName & email both does not present then-
  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }
  // ab ye frontend engineer decide karega ki kaise error dikhana hai
  // as a backend engineer hame to fullName aur email dono chahiye

  // if fullName & email both present then-
  //  ab fullName aur email dono ko update krne ka information bhejenge
  // uske liye sbse phle user find krna padega
  // user find krne k liye -   req.user?.id  karenge

  const user = User.findByIdAndUpdate(
    req.user?._id, // const user =  k under updated information aa chuki hai
    {
      $set: {
        // set mongoDB database ka ek opertor hai - set operator ek object recieve krta hai. is object me do parameter de diya hai fullName and email
        fullName, // ise aap aese bhilikh skte hai -  fullName:fullName
        email, // email:email
      },
    },
    { new: true } // new:true - means update hone ke baad jo information hoti hai vo aapko return milti hai
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

// important points -:
// file update krte time aapko middleware par dhyan de hoga
// kuki file update krte time aapko first middleware -  multer (multer.middleware.js) lagana hoga ,taki aap file accept kar pao
//second -  wahi log update kar payenge jo loggedIn ho har koi user profile update kar payege
// to hame two middleware use karenge , routing krte time iska dhyan rakhe

// update the avatar

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path; // re.file  hame multer.middlewere.js se mila to jab bhi hame multer middlewere inject krna ho to ham multer middleware me file lelenge

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // TODO: delete old image - your assignment

  // Avatar file upload on cloudinary

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  // agar avatar cloudinary me upload ho gya lekin url nhi mila hai to

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  // finally update the avatar file

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image uploaded successfully"));
});

// update user cover image

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  // coverImage upload on cloudinary

  const coverImage = uploadOnCloudinary(coverImageLocalPath);

  // if coverImage url does not get then

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading on cover image");
  }

  // finally update the coverImage

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image uploaded successfully"));
});

// mongoDB aggriation pipeline

const getUserChannelProfile = asyncHandler(async (req, res) => {
  // jab kisi channel ki profile chaihye to usually aap us channel ke url par jate ho
  // jaise /chaiaurcode or /programmingwithsatyamp or /dollarpedia  or /mathswithsatyampandey
  // usi tarike se ham bhi channel profile ka url chahiye
  // url lena hai to req.params ke madhyam se le skte hai
  // url se username lena hai

  const { username } = req.params;

  // aapne try kiya ki params se username ka url nikal le but
  // ho skta hai params empty ho
  // mere kahne ka matlab hai ki kucch hona chahiye tabhi to Query karunga nhi to kha hi Query karunga

  // username check kr lete h

  if (!username?.trim) {
    // trim- aur agar username hai to use trim bhi kar lo
    //  ? marks-  difine krta hai option chaining ko
    // !username?.trim - is code ka matlab h ki agar username hai to trim karo
    throw new ApiError(400, " username is missing");
  }

  // ab mai accept krta hu ki ab username hoga
  // sabse phle username se apna document find kar lete hai
  // ek Query chalate hai - user.findById se
  // usme username dete hai waha wareclouse apne aap lag jayega kucch is tarah se

  // username hamare database me bhi hai aur yha par bhi hai to yha username naam de dete h
  // User.find({username})  - aese bhi aap kar skte hai
  // but is code ye problem  hai ki database se user logo pura phir uski id ke base par aggriation lagao ge
  // itna sab kucch krne ki jarurat hai nahi
  // aap direct hi aggriation pipeline laga skte hai
  // quki database me ek match field hota hai to automatically sare document me se sirf  ek document find kr lega aur wahi field ka kaam hai

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      }, // to $match field se 1 document (example -programmingwithsatyamp ) filter kr liya
      // ab is document (programmingwithsatyamp) ke base par mujhe krna hai - lookup
      // ab pta krte hai @programmingwithsatyamp channel k subscriber kitne hai?
      // subscriber find krne ke liye lookup lagega
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      }, // first pipeline - 1- $lookup me sare channel find ho gye jo mere channel ko subscribe kiye hai ab next step subsciber count karte hai
      // first pipeline -is pipeline ke under sare document store kr liya hai
    },

    // second pipeline -2- ab maine kitne channel subscribe kiye ye pya krte hai

    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subsciber",
        as: "subscribedTo", // ye pta rha hai ki maine kitne channel subscribe kiye hai
      },
    },

    // third pipeline - 3 -
    // $addFields - name ka operator hota hai , ye operator jitni ye sabhi value
    // (like watchHistory, username,email, avatar,coverImage, password, refreshToken,createdAt, updatedAt) rakhega hi but sath hi addition field add kr dega
    // aur yahi to hame krna hai ki ek hi object me sara data bhej de

    {
      $addFields: {
        subscribersCount: {
          $size: "$subscriber", // $size operator se sare subsciber count ho jayege
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },

        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },

    // fourth pipeline - is pipeline k through project use krna hai
    // project q use krna hai? - project projection deta hai ki mai sari value ko eakdam waha par project nahi karunga jobhi vo demand kr rha hai
    //  mai use selected value dunga
    // selected value jaise -  fullName, mere hane ka matlab hai jis jis value ko pass krna hai
    // but sari value na dijiye kuki network traffic badega aur data ka size badega

    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
        // createdAt:1  // ye batega ki aaplka channel kab create hua hai
      },
    },
  ]); // aggregate ek mathod hai jo array leta hai aur array ke pipeline {} likhi jati hai

  if (!channel?.length) {
    throw new ApiError(400, "channel does not exists");
  }

  // return response in Array form
  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

// getWatchHistory ke liye sub pipelines
// users ki hamari WatchHistory get kaise hogi

// watchHistory ke video se connect hone k liye aapko multiple document milenge
// but in sabhi document ke under (owner) nhi hoga
// isliye jaise hi ek document (video)  se join huye vaise hi turant ek aur document(owner) se join hona padega
// jisse ki hame ke perfect document mile nahi to half documet milega
// kahne ka mera matalb hai - hame nexted $lookup krna hoga
// (owner) se (video) & (video) ke under se jakar (users) se le lenge - this process is nexted lookup.

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id), // yaha par hame mongoDB ki id ka string only milta hai aur hame puri id chahiye
        // kuki yaha par mongoose kaam nhi krta hai aggregate pipeline ka jitna code hai vo directly hi jata hai
      }, // yaha par hame mongoose ki objectId banani padegi
    },
    // first aggregate pipeline (match) se hame users mil gya hai
    // ab second aggregate pipeline se hame watchHistory ke under jan apadega i mean $lookup krna pdega

    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",

        // sub pipeline for owner to users access
        // ab sub pipeline lagana hai nhi to owner ki koi information nhi milegi
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",

              // abhi array ke under multiple value aayi hai , i mean pora ka pora user aa gya h
              // users ka username, email , fullName, avatar ..... aa gya h
              // but ye sabhi ko owner ke under nhi dena hai
              // kucch value dena hai - uske liye phir se ek aggregate pipeline lagani hogi
              // another sub pipeline -
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },

          // data jo ki array ke form me frontend engineer ko milta
          // array data ko sudharane k liye ek aur aggregate pipeline aur lagana hoga

          {
            $addFields: {
              owner: {
                $first: "$owner", // fields me se owner ko nikalna hai isliye owner k sath dollar sign lagega
              }, // ab frontend engineer ko sidhe owner object mil jayega jisko frontend engineer owner.  krke value nikal lega
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        " Watch history fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
};
