import { Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";

export interface RunResult {
  code: number | null;
  stdout: string | Buffer;
  stderr: string;
}

export interface RunOptions {
  input?: Buffer | string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  encoding?: "utf8" | "buffer";
}

/**
 * Thin promise wrapper around `child_process.spawn`. We need this because
 * the ZATCA signing pipeline shells out to `openssl`, `xmllint`, `xsltproc`
 * — there is no first-party Node binding for ZATCA's hash-transform XSL or
 * for ECDSA-secp256k1, so the CLI tools are the simplest reliable option.
 */
@Injectable()
export class ShellService {
  run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout.on("data", (c) => stdoutChunks.push(c));
      child.stderr.on("data", (c) => stderrChunks.push(c));

      child.on("error", reject);
      child.on("close", (code) => {
        const stdoutBuf = Buffer.concat(stdoutChunks);
        const stdout = opts.encoding === "buffer" ? stdoutBuf : stdoutBuf.toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        resolve({ code, stdout, stderr });
      });

      if (opts.input != null) child.stdin.end(opts.input);
      else child.stdin.end();
    });
  }

  async mustRun(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
    const r = await this.run(cmd, args, opts);
    if (r.code !== 0) {
      const err = new Error(`${cmd} exited ${r.code}: ${r.stderr || (typeof r.stdout === "string" ? r.stdout : "")}`);
      (err as any).stdout = r.stdout;
      (err as any).stderr = r.stderr;
      (err as any).code = r.code;
      throw err;
    }
    return r;
  }
}
