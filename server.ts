import 'dotenv/config';
import { createApp } from './src/app.ts';
import { PORT } from './src/config.ts';

createApp().app.listen(PORT, () => {
  console.log(`Korting Scanner running on http://localhost:${PORT}`);
});
