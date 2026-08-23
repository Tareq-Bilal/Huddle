import {Router} from "express";

const userRouter = Router();

userRouter.get("/profile", (req, res) => {
    // Handle fetching user profile logic here
    res.send("User profile route");
});

export default userRouter;