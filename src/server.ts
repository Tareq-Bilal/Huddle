import express from 'express';
import pino from 'pino-http';
import userRouter from './routes/userRoutes.ts';
import authRouter from './routes/authRoutes.ts';

const app = express();
const pinoLogger = pino();

app.use(pinoLogger);

app.get('/', function (req, res) {
  req.log.info('something')
  res.send('hello world')
})

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is healthy' });
});

app.use('/auth', authRouter);
app.use('/user', userRouter);

export default app;