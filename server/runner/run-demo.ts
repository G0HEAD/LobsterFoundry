import { runDemo } from './demo';

runDemo().catch((error) => {
  console.error(error);
  process.exit(1);
});
