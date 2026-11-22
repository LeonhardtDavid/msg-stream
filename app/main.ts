import { mount } from "svelte";

// Self-hosted, so the page makes no request to Google. Only the weights the
// stylesheet uses, and only the Latin subset — which covers English and
// Spanish, the two languages the interface is written in.
import "@fontsource/chivo/latin-700.css";
import "@fontsource/chivo/latin-800.css";
import "@fontsource/chivo/latin-900.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

import App from "./App.svelte";

mount(App, { target: document.getElementById("root")! });
