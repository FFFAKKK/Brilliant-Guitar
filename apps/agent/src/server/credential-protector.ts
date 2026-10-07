import { spawn } from "node:child_process";
import { isAgentProviderCredentialSecret } from "@brilliant-guitar/agent-runtime/contracts/agent-provider-credential";
import { SettingsStoreError } from "./connection-store.ts";

export interface CredentialProtectorPort {
  readonly kind: "windows-dpapi" | "unavailable";
  protect(secret: string, context: string): Promise<string>;
  unprotect(sealed: string, context: string): Promise<string>;
}
export class WindowsCredentialProtector implements CredentialProtectorPort {
  readonly kind = process.platform === "win32" ? "windows-dpapi" : "unavailable";
  async protect(secret: string, context: string): Promise<string> {
    if (!isAgentProviderCredentialSecret(secret)) throw unavailable();
    return this.#transform("Protect", Buffer.from(secret, "utf8").toString("base64"), context);
  }
  async unprotect(sealed: string, context: string): Promise<string> {
    const encoded = await this.#transform("Unprotect", sealed, context);
    const secret = Buffer.from(encoded, "base64").toString("utf8");
    if (!isAgentProviderCredentialSecret(secret)) throw unavailable();
    return secret;
  }
  #transform(operation: "Protect" | "Unprotect", data: string, context: string): Promise<string> {
    if (this.kind === "unavailable") return Promise.reject(unavailable());
    // Arguments are constant program text. Credentials and target binding travel only through stdin.
    const program = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::ReadLine()); $entropy=[Convert]::FromBase64String([Console]::ReadLine()); $result=[System.Security.Cryptography.ProtectedData]::${operation}($data,$entropy,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))`;
    return new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", program], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let output = ""; let failed = false;
      const timer = setTimeout(() => { failed = true; child.kill(); reject(unavailable()); }, 10000);
      child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); if (output.length > 8192) { failed = true; child.kill(); } });
      child.stderr.resume();
      child.stdin.on("error", () => { failed = true; });
      child.on("error", () => { clearTimeout(timer); reject(unavailable()); });
      child.on("close", (status) => {
        clearTimeout(timer);
        if (failed || status !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(output)) reject(unavailable());
        else resolve(output);
      });
      child.stdin.end(`${data}\n${Buffer.from(context, "utf8").toString("base64")}\n`);
    });
  }
}
function unavailable(): SettingsStoreError {
  return new SettingsStoreError("credential-unavailable", "系统密钥保护暂不可用。请取消记住密钥后保存，或重新填写密钥。");
}
