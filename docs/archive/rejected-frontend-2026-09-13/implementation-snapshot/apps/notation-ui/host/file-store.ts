import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { SavedFile } from '../contracts';

export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export class FileStore {
  readonly directory: string;
  constructor(directory: string) {
    mkdirSync(resolve(directory), { recursive: true });
    this.directory = realpathSync(directory);
  }
  private path(name: string): string {
    if (name.length > 90 || !/^[\p{L}\p{N}_ -]+\.score\.json$/u.test(name)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name)) throw new Error('文件名只能包含文字、数字、空格、短横线和下划线。');
    const path = join(this.directory, name);
    if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw new Error('不能打开或覆盖链接及非普通文件。');
    return path;
  }
  list(): SavedFile[] {
    return readdirSync(this.directory).filter(name => {
      try { return name.endsWith('.score.json') && lstatSync(this.path(name)).isFile(); } catch { return false; }
    }).map(name => ({ name, modified: lstatSync(this.path(name)).mtime.toISOString() }))
      .sort((a, b) => b.modified.localeCompare(a.modified));
  }
  read(name: string): string {
    const path = this.path(name);
    if (lstatSync(path).size > 1024 * 1024) throw new Error('初版暂不支持超过 1 MB 的乐谱文件。');
    return readFileSync(path, 'utf8');
  }
  write(name: string, text: string, previousHash: string | null): string {
    const path = this.path(name);
    if (previousHash === null && existsSync(path)) throw new Error('同名文件已存在，请使用其他名称。');
    if (previousHash !== null && (!existsSync(path) || digest(this.read(name)) !== previousHash)) throw new Error('文件已被其他程序修改或移走，请另存为，避免覆盖。');
    const temporary = join(this.directory, `.saving-${randomUUID()}`);
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, 'wx');
      writeFileSync(descriptor, text, 'utf8');
      fsyncSync(descriptor);
      closeSync(descriptor); descriptor = undefined;
      // Recheck immediately before replacement. Cross-process locking is not claimed.
      if (previousHash === null && existsSync(path)) throw new Error('同名文件已存在。');
      if (previousHash !== null && digest(this.read(name)) !== previousHash) throw new Error('文件已变化，请另存为。');
      renameSync(temporary, path);
      return digest(text);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
}
