import { client } from "./appwrite.js";

// Verify the configured Appwrite endpoint as soon as the application starts.
// A failed health check must not prevent the conservative frontend from loading.
client.ping()
  .then(() => console.info("Appwrite connection verified."))
  .catch((error) => console.warn("Appwrite ping was not successful.", error));
