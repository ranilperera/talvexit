import 'dotenv/config';
import { generateScope } from '../services/claude-api.service.js';

async function main() {
  try {
    await generateScope(
      'Return the word "NOTJSON" with no other text.',
      'test',
    );
    console.log('Unexpected success');
  } catch (err) {
    const e = err as { code?: string; retryable?: boolean; message?: string };
    console.log('Error code:', e.code);
    console.log('Retryable:', e.retryable);
    console.log('Message:', e.message);
    if (e.code === 'PARSE_FAILURE' && e.retryable === false) {
      console.log('Test passed!');
    } else {
      console.log('Test did not hit parse-failure path.');
    }
  }
}

void main();
