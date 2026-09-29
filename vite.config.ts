import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
      // Only affects the browser bundle; poseidon paths use constants.
      { find: /^assert$/, replacement: "data:text/javascript,export default {};export const ok=()=>true;export const strict=()=>true;" },
      { find: /^events$/, replacement: "data:text/javascript,export class EventEmitter{}" },
      { find: /^buffer$/, replacement: "data:text/javascript,export const Buffer=undefined;export const Blob=globalThis.Blob;" },
      { find: /^readable-stream$/, replacement: "data:text/javascript,export class Readable{}export class Writable{}export class Transform{}export class PassThrough{}export const Stream=class{};" },
    ],
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:3101",
    },
  },
  preview: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:3101",
    },
  },
});
