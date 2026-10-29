import "dotenv/config";
import db from "./db/knex";
import { createApp } from "./app";
import { startPoller } from "./core/poller";
async function main() {
  for (const key of ["JWT_SECRET", "ENCRYPTION_KEY", "SETUP_TOKEN"])
    if (
      !process.env[key] ||
      process.env[key]!.length < 32 ||
      /changeme|replace-with/i.test(process.env[key]!)
    )
      throw new Error(
        `${key} must be set to a unique secret of at least 32 characters.`,
      );
  await db.migrate.latest();
  const stop = process.env.DISABLE_POLLER === "true" ? () => {} : startPoller();
  const server = createApp().listen(
    Number(process.env.PORT || 3000),
    "0.0.0.0",
    () => console.log("CryptoPay API listening."),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      stop();
      server.close(() => {
        void db.destroy().then(() => process.exit(0));
      });
    });
}
main().catch((err) => {
  console.error(err.message);
  void db.destroy().then(() => process.exit(1));
});
