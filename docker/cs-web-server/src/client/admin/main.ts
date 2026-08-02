// ============================================
// Admin Panel Entry Point
// ============================================

import {AdminApp} from "./app";

const app = new AdminApp();

window.addEventListener("DOMContentLoaded", () => void app.init());
