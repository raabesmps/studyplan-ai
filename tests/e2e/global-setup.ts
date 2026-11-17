/** Warms up both app instances before the first test, so cold-start latency is not counted against a test. */
const URLS = ['http://localhost:3100', 'http://localhost:3101'];

async function warm(url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url);
      await response.text();
      if (response.ok) return;
    } catch {
      // The server may still be settling; try again.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export default async function globalSetup() {
  await Promise.all(URLS.map(warm));
}
