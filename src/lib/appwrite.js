import { Account, Client, Databases } from "appwrite";

const client = new Client()
  .setEndpoint("https://fra.cloud.appwrite.io/v1")
  .setProject("6a64cbeb0009826c9efc");

const account = new Account(client);
const databases = new Databases(client);

export { account, client, databases };
