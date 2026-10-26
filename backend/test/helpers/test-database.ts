// Throws unless the URL names a test database, so a misconfigured
// TEST_DATABASE_URL can never migrate or wipe dev or production data.
export function assertTestDatabase(url: string | undefined) {
  const name = new URL(url ?? "").pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`refusing to use database "${name}" for tests: its name must end in _test`);
  }
}
