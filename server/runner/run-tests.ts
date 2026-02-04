import { runTests } from './tests';

try {
  runTests();
  console.log('Runner tests passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
