import React from "react";
import { createRoot } from "react-dom/client";
import "../assets/js/backend-stubs.js";
import "../assets/js/translations.js";
import "./lib/appwrite-ping.js";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>,
);
