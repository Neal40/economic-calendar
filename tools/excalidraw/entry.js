// Bundle autonome d'Excalidraw (SDK open source, licence MIT) pour Inner Circle Trader.
// Reconstruire : node tools/build-excalidraw.js  → vendor/excalidraw/excalidraw.js + .css + fonts/
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, MainMenu, WelcomeScreen, exportToBlob, exportToSvg, serializeAsJSON, loadFromBlob, restore, convertToExcalidrawElements } from "@excalidraw/excalidraw";
window.ICTExcalidraw = { React, createRoot, Excalidraw, MainMenu, WelcomeScreen, exportToBlob, exportToSvg, serializeAsJSON, loadFromBlob, restore, convertToExcalidrawElements };
