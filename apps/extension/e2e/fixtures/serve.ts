import { startServers } from "./servers.ts";

// App de prueba en puertos fijos para la validación manual (quickstart).
const servers = await startServers({ app: 4310, api: 4311 });
console.log(`SPA (origen A): ${servers.appOrigin}/`);
console.log(`API (origen B): ${servers.apiOrigin}/`);
console.log("Ctrl+C para terminar.");

process.on("SIGINT", () => {
  void servers.close().then(() => process.exit(0));
});
