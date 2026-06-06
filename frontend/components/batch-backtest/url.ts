export function pushBatchJobId(jobId: string) {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.set("batchJobId", jobId);
  window.history.replaceState(null, "", `${window.location.pathname}?${searchParams}`);
}

