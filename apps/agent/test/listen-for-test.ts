import { randomInt } from "node:crypto";
import type { Server } from "node:http";

/** Keep fixtures out of low service ports that browser/Node fetch can reject. */
export async function listenForTest(server: Server): Promise<void> {
  for (let attempt = 0; attempt < 20; ++attempt) {
    try {
      await new Promise<void>((resolve, reject) => {
        const failed = (error: Error): void => { server.off("listening", listening); reject(error); };
        const listening = (): void => { server.off("error", failed); resolve(); };
        server.once("error", failed); server.once("listening", listening);
        server.listen(randomInt(49152, 65536), "127.0.0.1");
      });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt === 19) throw error;
    }
  }
}
