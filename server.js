import express from 'express';
import { PORT } from './src/config.js';
import { router as apiRouter } from './src/routes/api.js';

const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use('/api', apiRouter);

app.listen(PORT, () => {
  console.log(`Korting Scanner running on http://localhost:${PORT}`);
});
