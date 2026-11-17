/** Warms up the app before the first test, so cold-start latency is not counted against a test. */
export default async function globalSetup(config: { projects: { use: { baseURL?: string } }[] }) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3100';
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(baseURL);
      await response.text();
      if (response.ok) return;
    } catch {
      // The server may still be settling; try again.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
