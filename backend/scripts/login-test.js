const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

async function main() {
  try {
    const response = await fetch('http://localhost:3007/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo@school.com', password: 'Demo@123' })
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Body:', text);
  } catch (error) {
    console.error('Request failed:', error);
    process.exitCode = 1;
  }
}

main();


