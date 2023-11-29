// by promise method

const asyncHandler = (requestHandler) => {
  (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export {asyncHandler}

// by trycatch  method

// first see the simple way how to create function inside a another function
//step-01
//const asyncHandler = () => {}
//step-02
//const asyncHandler = (fn) => () => {}
//step-03
//const asyncHandler = (fn) => async() => {}

// const asyncHandler = (fn) => async(req,res,next) => {
//   try {
//       await fn(req,res,next)
//   } catch (error) {
//     res.status(err.code || 500).json({
//         success:false,
//         massage:err.massage
//     })
//   }
// }

// export {asyncHandler}
