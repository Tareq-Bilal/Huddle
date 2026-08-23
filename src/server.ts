import express from 'express';
import userRouter from './routes/userRoutes';
import authRouter from './routes/authRoutes';

const app = express();


app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is healthy' });
});

app.use('/auth', authRouter);
app.use('/user', userRouter);

export default app;