
export async function runJob(
    name: string,
    job: () => Promise<void>,
    retries = 3
  ) {
    const start = Date.now();
  
    try {
      await job();
      console.log(`[JOB SUCCESS] ${name} (${Date.now() - start}ms)`);
    } catch (err) {
      console.error(`[JOB ERROR] ${name}`, err);
  
      if (retries > 0) {
        console.log(`[JOB RETRY] ${name}, remaining: ${retries}`);
        await runJob(name, job, retries - 1);
      } else {
        // Hook alert here later
        console.error(`[JOB FAILED PERMANENTLY] ${name}`);
      }
    }
};
  