/**
 * Frontend entry point.
 *
 * This file renders the root React application into the DOM.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// #region App bootstrap

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// #endregion