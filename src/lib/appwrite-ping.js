import { client } from "./appwrite.js";

client
  .ping()
  .then(() => console.info("Appwrite connection verified."))
  .catch((error) => console.warn("Appwrite ping was not successful.", error));
