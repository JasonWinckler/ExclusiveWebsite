import { Account, Client, Databases } from "appwrite";

const client = new Client()
  .setEndpoint("https://fra.cloud.appwrite.io/v1")
  .setProject("6a64cbeb0009826c9efc");

const account = new Account(client);
const databases = new Databases(client);

function verifyAppwriteConnection() {
  return client
    .ping()
    .then(() => console.info("Appwrite connection verified."))
    .catch((error) => console.warn("Appwrite ping was not successful.", error));
}

export { account, client, databases, verifyAppwriteConnection };
