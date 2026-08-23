import express from 'express';

const app = express();


app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is healthy' });
});

export default app;