declare module "pngjs" {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    constructor(options?: { width?: number; height?: number; fill?: boolean });
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}
